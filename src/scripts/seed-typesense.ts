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
  nodes: [{ host: process.env.TYPESENSE_HOST || 'localhost', port: Number(process.env.TYPESENSE_PORT) || 7700, protocol: 'http' }],
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
    try { await tsClient.collections('products').delete(); console.log('[Seed] Dropped "products".') } catch {}
    try { await tsClient.collections('articles').delete(); console.log('[Seed] Dropped "articles".') } catch {}
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
          brand:    { $arrayElemAt: ['$brand', 0] },
          details:  { $arrayElemAt: ['$details', 0] }
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

  await mongoClient.close()
  console.log('[Seed] ✅ Done! Typesense is now synced with MongoDB.')
  process.exit(0)
}

seed().catch((err) => {
  console.error('[Seed] ❌ Error:', err)
  process.exit(1)
})
