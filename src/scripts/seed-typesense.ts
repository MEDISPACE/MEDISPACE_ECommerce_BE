/**
 * Seed Typesense — import toàn bộ data từ MongoDB vào Typesense
 * Chạy thủ công 1 lần khi setup hoặc khi cần re-sync:
 *   npm run seed:search
 */

import { config } from 'dotenv'
config()

import { MongoClient, ObjectId } from 'mongodb'
import typesenseService from '../services/typesense.services'

const MONGO_URI = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@medispacedb.35qkwso.mongodb.net/${process.env.DB_NAME}?retryWrites=true&w=majority`

import Typesense from 'typesense'

const tsClient = new Typesense.Client({
  nodes: [
    {
      host: process.env.TYPESENSE_HOST || 'localhost',
      port: Number(process.env.TYPESENSE_PORT) || 7700,
      protocol: 'http'
    }
  ],
  apiKey: process.env.TYPESENSE_API_KEY || 'medispace-ts-secret',
  connectionTimeoutSeconds: 5
})

async function seed() {
  console.log('[Seed] Connecting to MongoDB...')
  const mongoClient = new MongoClient(MONGO_URI)
  await mongoClient.connect()
  const db = mongoClient.db(process.env.DB_NAME || 'medispacedb')

  // ── Force drop collections nếu có --force flag ──────────────────────────────
  const force = process.argv.includes('--force')
  if (force) {
    console.log('[Seed] --force mode: dropping existing collections...')
    try {
      await tsClient.collections('products').delete()
      console.log('[Seed] Dropped "products".')
    } catch {}
    try {
      await tsClient.collections('articles').delete()
      console.log('[Seed] Dropped "articles".')
    } catch {}
  }

  // query_suggestions luôn drop và tạo lại để tránh data cũ lẫn lộn
  try {
    await tsClient.collections('query_suggestions').delete()
    console.log('[Seed] Dropped "query_suggestions" (will recreate fresh).')
  } catch {}

  if (!force) {
    try {
      const articlesCollection = await tsClient.collections('articles').retrieve()
      const articleFields = new Set((articlesCollection.fields || []).map((field: any) => field.name))
      const requiredArticleFields = ['riskLevel', 'targetAudiences', 'symptoms', 'activeIngredients', 'healthTopics']
      const missingArticleFields = requiredArticleFields.filter((field) => !articleFields.has(field))
      if (missingArticleFields.length > 0) {
        console.log(`[Seed] Recreating "articles" because schema is missing: ${missingArticleFields.join(', ')}`)
        await tsClient.collections('articles').delete()
      }
    } catch {}
  }

  // ── Init Typesense collections ──────────────────────────────────────────────
  console.log('[Seed] Initializing Typesense collections...')
  await typesenseService.initCollections()

  // ── Seed Products ───────────────────────────────────────────────────────────
  console.log('[Seed] Fetching products from MongoDB...')
  const products = await db
    .collection('products')
    .aggregate([
      {
        $lookup: {
          from: process.env.DB_CATEGORIES_COLLECTION || 'categories',
          localField: 'categoryId',
          foreignField: '_id',
          as: 'category',
          pipeline: [{ $project: { _id: 1, name: 1 } }]
        }
      },
      {
        $lookup: {
          from: process.env.DB_BRANDS_COLLECTION || 'brands',
          localField: 'brandId',
          foreignField: '_id',
          as: 'brand',
          pipeline: [{ $project: { _id: 1, name: 1 } }]
        }
      },
      {
        $lookup: {
          from: process.env.DB_PRODUCT_DETAILS_COLLECTION || 'productDetails',
          localField: '_id',
          foreignField: 'productId',
          as: 'details'
        }
      },
      {
        $addFields: {
          category: { $arrayElemAt: ['$category', 0] },
          brand: { $arrayElemAt: ['$brand', 0] },
          details: { $arrayElemAt: ['$details', 0] }
        }
      }
    ])
    .toArray()

  console.log(`[Seed] Found ${products.length} products. Indexing...`)
  await typesenseService.bulkIndexProducts(products)

  // ── Seed Articles ───────────────────────────────────────────────────────────
  console.log('[Seed] Fetching articles from MongoDB...')
  const articles = await db
    .collection(process.env.DB_ARTICLES_COLLECTION || 'articles')
    .aggregate([
      {
        $lookup: {
          from: process.env.DB_HEALTH_CATEGORIES_COLLECTION || 'healthCategories',
          localField: 'categoryId',
          foreignField: '_id',
          as: 'category',
          pipeline: [{ $project: { _id: 1, name: 1 } }]
        }
      },
      {
        $addFields: {
          category: { $arrayElemAt: ['$category', 0] }
        }
      }
    ])
    .toArray()

  console.log(`[Seed] Found ${articles.length} articles. Indexing...`)
  await typesenseService.bulkIndexArticles(articles)

  // ── Seed Brands ─────────────────────────────────────────────────────────────
  console.log('[Seed] Fetching brands from MongoDB...')
  const brands = await db
    .collection(process.env.DB_BRANDS_COLLECTION || 'brands')
    .find({})
    .toArray()

  console.log(`[Seed] Found ${brands.length} brands. Indexing...`)
  await typesenseService.bulkIndexBrands(brands)

  // ── Seed Categories ──────────────────────────────────────────────────────────
  console.log('[Seed] Fetching categories from MongoDB...')
  const categories = await db
    .collection(process.env.DB_CATEGORIES_COLLECTION || 'categories')
    .find({})
    .toArray()

  console.log(`[Seed] Found ${categories.length} categories. Indexing...`)
  await typesenseService.bulkIndexCategories(categories)

  // ── Seed Query Suggestions ──────────────────────────────────────────────────
  console.log('[Seed] Building query suggestions from indexed data...')

  // Map: normalized → { q, type, count }
  const suggestionsMap = new Map<string, { q: string; type: string; count: number }>()

  const addSuggestion = (raw: string, type: string, weight = 1) => {
    if (!raw || raw.trim().length < 2) return
    // Tách các thành phần nếu có dấu phân cách (VD: "Paracetamol, Caffeine" → 2 gợi ý)
    const parts = raw.split(/[,;|]+/).map((s) => s.trim()).filter((s) => s.length >= 2)
    for (const part of parts) {
      const normalized = part.toLowerCase()
      const existing = suggestionsMap.get(normalized)
      if (existing) {
        existing.count += weight
      } else {
        suggestionsMap.set(normalized, { q: part, type, count: weight })
      }
    }
  }

  // Từ products đã fetch ở trên
  for (const p of products) {
    // Hoạt chất (trọng số cao nhất — đây là search chính)
    const ingredients = p.details?.activeIngredients || p.activeIngredients || ''
    addSuggestion(ingredients, 'ingredient', 3)

    // Tên sản phẩm → lấy 1-2 từ đầu (ngắn gọn, dễ search)
    const nameParts = (p.name || '').split(' ')
    if (nameParts.length >= 2) {
      // Lấy 1 từ đầu nếu dài ≥ 4 ký tự (VD: "Panadol" từ "Viên sủi Panadol GSK...")
      const keyword = nameParts.find((w: string) => w.length >= 4 && /^[A-Za-z]/.test(w))
      if (keyword) addSuggestion(keyword, 'product', 1)
    }

    // Brand name
    const brand = p.brand?.name || p.brandName || ''
    if (brand) addSuggestion(brand, 'brand', 2)
  }

  // Từ categories
  for (const c of categories) {
    if (c.name) addSuggestion(c.name, 'category', 2)
  }

  // Các từ tiếng Việt hay đứng đầu câu mô tả (không phải tên hoạt chất)
  const BAD_STARTS = ['không', 'của ', 'có ', 'và ', 'làm ', 'phù ', 'kết ', 'theo', 'với ', 'cho ', 'bao ', 'được', 'dạng', 'mỗi', 'dùng', 'các ', 'như ', 'tùy ', 'hay ', 'giúp']

  const suggestions = Array.from(suggestionsMap.values())
    .filter((s) => {
      const q = s.q.trim()
      if (q.length < 2 || q.length > 35) return false
      const lower = q.toLowerCase()
      // Loại bỏ các chuỗi bắt đầu bằng từ mô tả tiếng Việt
      if (BAD_STARTS.some((w) => lower.startsWith(w))) return false
      if (s.type === 'ingredient') {
        // Phải bắt đầu bằng Latin
        if (!/^[a-zA-Z]/.test(q)) return false
        // Tên hoạt chất dược phải có ≥55% ký tự Latin (loại bỏ câu tiếng Việt như "cao su tự nhiên")
        const latinCount = (q.match(/[a-zA-Z]/g) || []).length
        const latinRatio = latinCount / q.length
        return latinRatio >= 0.55
      }
      // Brand, product keyword: phải bắt đầu bằng Latin
      if (['brand', 'product'].includes(s.type)) {
        return /^[a-zA-Z]/.test(q)
      }
      return true // categories được phép tiếng Việt
    })
    .sort((a, b) => b.count - a.count)

  console.log(`[Seed] Generated ${suggestions.length} query suggestions. Indexing...`)
  await typesenseService.bulkIndexQuerySuggestions(suggestions)

  await mongoClient.close()
  console.log('[Seed] ✅ Done! Typesense is now synced with MongoDB (products, articles, brands, categories, query_suggestions).')
  process.exit(0)
}

seed().catch((err) => {
  console.error('[Seed] ❌ Error:', err)
  process.exit(1)
})
