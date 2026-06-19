import Typesense from 'typesense'
import { config } from 'dotenv'
import databaseService from './database.services'

config()

// ─── Typesense Client ───────────────────────────────────────────────────────

const client = new Typesense.Client({
  nodes: [
    {
      host: process.env.TYPESENSE_HOST || 'localhost',
      port: Number(process.env.TYPESENSE_PORT) || 7700,
      protocol: 'http'
    }
  ],
  apiKey: process.env.TYPESENSE_API_KEY || 'medispace-ts-secret',
  connectionTimeoutSeconds: 60
})

// ─── Schemas ────────────────────────────────────────────────────────────────

const PRODUCTS_COLLECTION = 'products'
const ARTICLES_COLLECTION = 'articles'
const BRANDS_COLLECTION = 'brands'
const CATEGORIES_COLLECTION = 'categories'
const QUERY_SUGGESTIONS_COLLECTION = 'query_suggestions'

const productSchema = {
  name: PRODUCTS_COLLECTION,
  fields: [
    { name: 'mongoId', type: 'string' as const },
    { name: 'name', type: 'string' as const, infix: true },
    { name: 'slug', type: 'string' as const, index: false },
    { name: 'sku', type: 'string' as const, infix: true },
    { name: 'barcode', type: 'string' as const, optional: true },
    { name: 'shortDescription', type: 'string' as const, optional: true },
    { name: 'categoryId', type: 'string' as const, facet: true },
    { name: 'categoryName', type: 'string' as const, facet: true },
    { name: 'brandId', type: 'string' as const, facet: true, optional: true },
    { name: 'brandName', type: 'string' as const, facet: true, optional: true },
    { name: 'requiresPrescription', type: 'bool' as const, facet: true },
    { name: 'isActive', type: 'bool' as const, facet: true },
    { name: 'inStock', type: 'bool' as const, facet: true },
    { name: 'stockQuantity', type: 'int32' as const },
    { name: 'price', type: 'float' as const },
    { name: 'originalPrice', type: 'float' as const },
    { name: 'salePrice', type: 'float' as const },
    { name: 'discountPercentage', type: 'int32' as const },
    { name: 'defaultUnit', type: 'string' as const, optional: true },
    { name: 'priceVariantsJson', type: 'string' as const, optional: true, index: false },
    { name: 'maxOrderQuantity', type: 'int32' as const },
    { name: 'campaignId', type: 'string' as const, optional: true },
    { name: 'campaignName', type: 'string' as const, optional: true },
    { name: 'campaignBadgeText', type: 'string' as const, optional: true },
    { name: 'campaignBadgeColor', type: 'string' as const, optional: true, index: false },
    { name: 'campaignEndDate', type: 'int64' as const, optional: true },
    { name: 'searchTextNormalized', type: 'string' as const, optional: true },
    { name: 'rating', type: 'float' as const },
    { name: 'reviewCount', type: 'int32' as const },
    { name: 'featuredImage', type: 'string' as const, index: false, optional: true },
    { name: 'activeIngredients', type: 'string' as const, optional: true },
    { name: 'indications', type: 'string' as const, optional: true },
    { name: 'manufacturer', type: 'string' as const, optional: true, facet: true },
    { name: 'dosageForm', type: 'string' as const, optional: true },
    { name: 'strength', type: 'string' as const, optional: true },
    { name: 'packSize', type: 'string' as const, optional: true },
    { name: 'dosageInstructions', type: 'string' as const, optional: true },
    { name: 'storageInstructions', type: 'string' as const, optional: true },
    { name: 'createdAt', type: 'int64' as const },
    // ── Hybrid RAG: Vector Embedding (Typesense v27+ built-in) ───────────────
    // model ts/multilingual-e5-small: hỗ trợ tiếng Việt, ~500MB RAM, dim=384
    // embed tự động khi index document — không cần gọi API ngoài
    // optional=true: document cũ không có embedding vẫn index được (backward compat)
    {
      name: 'embedding',
      type: 'float[]' as const,
      optional: true,
      embed: {
        from: [
          'name',               // Tên sản phẩm
          'indications',        // Chỉ định — quan trọng nhất cho RAG triệu chứng
          'activeIngredients',  // Thành phần hoạt chất
          'shortDescription',   // Mô tả ngắn
          'categoryName'        // Danh mục
        ],
        model_config: {
          model_name: 'ts/multilingual-e5-small'
        }
      }
    }
  ],
  default_sorting_field: 'rating',
  token_separators: ['-', '/', '(', ')', '.', ',']
}

const articleSchema = {
  name: ARTICLES_COLLECTION,
  fields: [
    { name: 'mongoId', type: 'string' as const },
    { name: 'title', type: 'string' as const },
    { name: 'slug', type: 'string' as const, index: false },
    { name: 'excerpt', type: 'string' as const, optional: true },
    { name: 'content', type: 'string' as const, optional: true },
    { name: 'categoryId', type: 'string' as const, facet: true, optional: true },
    { name: 'categoryName', type: 'string' as const, facet: true, optional: true },
    { name: 'tags', type: 'string[]' as const, facet: true, optional: true },
    { name: 'riskLevel', type: 'string' as const, facet: true, optional: true },
    { name: 'targetAudiences', type: 'string[]' as const, facet: true, optional: true },
    { name: 'symptoms', type: 'string[]' as const, facet: true, optional: true },
    { name: 'activeIngredients', type: 'string[]' as const, facet: true, optional: true },
    { name: 'healthTopics', type: 'string[]' as const, facet: true, optional: true },
    { name: 'authorName', type: 'string' as const, optional: true },
    { name: 'isPublished', type: 'bool' as const, facet: true },
    { name: 'isFeatured', type: 'bool' as const, facet: true },
    { name: 'viewCount', type: 'int32' as const },
    { name: 'publishedAt', type: 'int64' as const, optional: true },
    { name: 'featuredImage', type: 'string' as const, index: false, optional: true },
    // ── Hybrid RAG: Vector Embedding cho bài viết sức khỏe ───────────────────
    // Embed từ title + excerpt + content — giúp tìm bài viết theo ngữ nghĩa
    // không chỉ theo keyword (VD: "cao huyết áp" → bài về tim mạch, muối)
    {
      name: 'embedding',
      type: 'float[]' as const,
      optional: true,
      embed: {
        from: ['title', 'excerpt', 'content'],
        model_config: {
          model_name: 'ts/multilingual-e5-small'
        }
      }
    }
  ],
  default_sorting_field: 'viewCount'
}

const brandSchema = {
  name: BRANDS_COLLECTION,
  fields: [
    { name: 'mongoId', type: 'string' as const },
    { name: 'name', type: 'string' as const },
    { name: 'slug', type: 'string' as const },
    { name: 'description', type: 'string' as const, optional: true },
    { name: 'country', type: 'string' as const, optional: true, facet: true },
    { name: 'logo', type: 'string' as const, optional: true, index: false },
    { name: 'isActive', type: 'bool' as const, facet: true },
    { name: 'productCount', type: 'int32' as const }
  ]
}

const categorySchema = {
  name: CATEGORIES_COLLECTION,
  fields: [
    { name: 'mongoId', type: 'string' as const },
    { name: 'name', type: 'string' as const },
    { name: 'slug', type: 'string' as const },
    { name: 'description', type: 'string' as const, optional: true },
    { name: 'isActive', type: 'bool' as const, facet: true },
    { name: 'level', type: 'int32' as const, facet: true },
    { name: 'productCount', type: 'int32' as const },
    { name: 'icon', type: 'string' as const, optional: true, index: false }
  ]
}

// Schema cho query_suggestions — lưu các từ khóa gợi ý hoàn thành câu query
const querySuggestionsSchema = {
  name: QUERY_SUGGESTIONS_COLLECTION,
  fields: [
    { name: 'q', type: 'string' as const },              // từ khóa hiển thị (VD: "Paracetamol")
    { name: 'normalized', type: 'string' as const },     // lowercase để dedup
    { name: 'type', type: 'string' as const, facet: true }, // ingredient|brand|category|product
    { name: 'count', type: 'int32' as const }             // số sản phẩm liên quan — dùng để rank
  ],
  default_sorting_field: 'count',
  token_separators: ['-', '/', ' ']
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toProductDocument(product: any): Record<string, unknown> {
  const defaultVariant = product.priceVariants?.find((v: any) => v.isDefault) || product.priceVariants?.[0]
  const originalPrice = defaultVariant?.originalPrice || defaultVariant?.price || product.originalPrice || product.price || 0
  const salePrice = defaultVariant?.salePrice || product.salePrice || originalPrice
  const price = salePrice
  const mongoId = product._id?.toString() || ''
  const searchableText = [
    product.name,
    product.sku,
    product.brand?.name,
    product.category?.name,
    product.details?.activeIngredients,
    product.details?.indications,
    product.details?.manufacturer
  ]
    .filter(Boolean)
    .join(' ')

  return {
    id: mongoId,
    mongoId,
    name: product.name || '',
    slug: product.slug || '',
    sku: product.sku || '',
    barcode: product.barcode || '',
    shortDescription: product.shortDescription || '',
    categoryId: product.categoryId?.toString() || '',
    categoryName: product.category?.name || product.categoryName || '',
    brandId: product.brandId?.toString() || '',
    brandName: product.brand?.name || product.brandName || '',
    requiresPrescription: Boolean(product.requiresPrescription),
    isActive: product.isActive !== false,
    inStock: (product.stockQuantity || 0) > 0,
    stockQuantity: product.stockQuantity || 0,
    price,
    originalPrice,
    salePrice,
    discountPercentage: defaultVariant?.discountPercent || product.discountPercentage || 0,
    defaultUnit: defaultVariant?.unit || product.unit || '',
    priceVariantsJson: JSON.stringify(
      (product.priceVariants || []).map((variant: any) => ({
        unit: variant.unit,
        price: variant.price,
        originalPrice: variant.originalPrice,
        salePrice: variant.salePrice,
        discountPercent: variant.discountPercent,
        isDefault: Boolean(variant.isDefault),
        quantityPerUnit: variant.quantityPerUnit
      }))
    ),
    maxOrderQuantity: product.maxOrderQuantity || 10,
    campaignId: product.campaign?._id?.toString?.() || '',
    campaignName: product.campaign?.name || '',
    campaignBadgeText: product.campaign?.badgeText || '',
    campaignBadgeColor: product.campaign?.badgeColor || '',
    campaignEndDate: product.campaign?.endDate ? new Date(product.campaign.endDate).getTime() : undefined,
    searchTextNormalized: normalizeVietnamese(searchableText),
    rating: product.rating || 0,
    reviewCount: product.reviewCount || 0,
    featuredImage: product.featuredImage || '',
    activeIngredients: product.details?.activeIngredients || product.activeIngredients || '',
    indications: product.details?.indications || product.indications || '',
    manufacturer: product.details?.manufacturer || product.manufacturer || '',
    dosageForm: product.details?.dosageForm || product.dosageForm || '',
    strength: product.details?.strength || product.strength || '',
    packSize: product.details?.packSize || product.packSize || '',
    dosageInstructions: product.details?.dosageInstructions || product.dosageInstructions || '',
    storageInstructions: product.details?.storageInstructions || product.storageInstructions || '',
    createdAt: product.createdAt ? new Date(product.createdAt).getTime() : Date.now()
  }
}

function normalizeVietnamese(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
}

function toArticleDocument(article: any): Record<string, unknown> {
  const mongoId = article._id?.toString() || ''
  return {
    id: mongoId,
    mongoId,
    title: article.title || '',
    slug: article.slug || '',
    excerpt: article.excerpt || '',
    content: typeof article.content === 'string' ? article.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 5000) : '',
    categoryId: article.categoryId?.toString() || '',
    categoryName: article.category?.name || '',
    tags: Array.isArray(article.tags) ? article.tags : [],
    riskLevel: article.riskLevel || 'general',
    targetAudiences: Array.isArray(article.targetAudiences) ? article.targetAudiences : [],
    symptoms: Array.isArray(article.symptoms) ? article.symptoms : [],
    activeIngredients: Array.isArray(article.activeIngredients) ? article.activeIngredients : [],
    healthTopics: Array.isArray(article.healthTopics) ? article.healthTopics : [],
    authorName: article.authorName || '',
    isPublished: Boolean(article.isPublished),
    isFeatured: Boolean(article.isFeatured),
    viewCount: article.viewCount || 0,
    publishedAt: article.publishedAt ? new Date(article.publishedAt).getTime() : undefined,
    featuredImage: article.featuredImage || ''
  }
}

function toBrandDocument(brand: any): Record<string, unknown> {
  const mongoId = brand._id?.toString() || ''
  return {
    id: mongoId,
    mongoId,
    name: brand.name || '',
    slug: brand.slug || '',
    description: brand.description || '',
    country: brand.country || '',
    logo: brand.logo || '',
    isActive: brand.isActive !== false,
    productCount: brand.productCount || 0
  }
}

function toCategoryDocument(category: any): Record<string, unknown> {
  const mongoId = category._id?.toString() || ''
  return {
    id: mongoId,
    mongoId,
    name: category.name || '',
    slug: category.slug || '',
    description: category.description || '',
    isActive: category.isActive !== false,
    level: category.level || 0,
    productCount: category.productCount || 0,
    icon: category.icon || ''
  }
}

function toQuerySuggestionDocument(item: { q: string; type: string; count: number }): Record<string, unknown> {
  const normalized = item.q.toLowerCase().trim()
  return {
    id: `${item.type}-${normalized.replace(/[^a-z0-9]/g, '-')}`,
    q: item.q.trim(),
    normalized,
    type: item.type,
    count: item.count || 1
  }
}

// ─── Service Class ───────────────────────────────────────────────────────────

class TypesenseService {
  private isAvailable = false
  private retryQueue: Array<{ description: string; run: () => Promise<void>; attempts: number }> = []
  private isFlushingRetries = false
  private readonly maxRetryAttempts = 5
  private readonly maxQueueSize = 500
  private isReconciling = false

  private async markDirty(reason: string): Promise<void> {
    try {
      await databaseService.typesenseSyncState.updateOne(
        { key: 'global' },
        { $set: { key: 'global', dirty: true, reason, updatedAt: new Date() } },
        { upsert: true }
      )
    } catch (err) {
      console.error('[Typesense] Could not persist dirty sync marker:', (err as Error)?.message)
    }
  }

  private enqueueRetry(description: string, run: () => Promise<void>, attempts = 0): void {
    if (attempts >= this.maxRetryAttempts) {
      console.error(`[Typesense] Dropping retry after ${attempts} attempts: ${description}`)
      return
    }
    if (this.retryQueue.length >= this.maxQueueSize) {
      console.error(`[Typesense] Queue full (${this.maxQueueSize}), dropping: ${description}`)
      return
    }
    this.retryQueue.push({ description, run, attempts })
  }

  private async runOrQueue(description: string, run: () => Promise<void>, attempts = 0): Promise<void> {
    if (!this.isAvailable) {
      await this.markDirty(description)
      this.enqueueRetry(description, run, attempts)
      return
    }

    try {
      await run()
    } catch (err) {
      console.error(`[Typesense] ${description} error:`, (err as Error)?.message)
      await this.markDirty(description)
      this.enqueueRetry(description, run, attempts + 1)
    }
  }

  private async flushRetries(): Promise<void> {
    if (!this.isAvailable || this.isFlushingRetries || this.retryQueue.length === 0) return
    this.isFlushingRetries = true
    const pending = this.retryQueue.splice(0)
    const requeued: typeof pending = []

    try {
      for (const item of pending) {
        if (item.attempts >= this.maxRetryAttempts) {
          console.error(`[Typesense] Dropping retry after ${item.attempts} attempts: ${item.description}`)
          continue
        }

        try {
          await item.run()
        } catch (err) {
          console.error(`[Typesense] ${item.description} retry error:`, (err as Error)?.message)
          requeued.push({ ...item, attempts: item.attempts + 1 })
        }
      }
    } finally {
      if (requeued.length > 0) {
        this.retryQueue.unshift(...requeued)
      }
      this.isFlushingRetries = false
    }
  }

  private async ensureCollections(): Promise<boolean> {
    let needsReconciliation = false
    const collections = [
      { name: PRODUCTS_COLLECTION, schema: productSchema },
      { name: ARTICLES_COLLECTION, schema: articleSchema },
      { name: BRANDS_COLLECTION, schema: brandSchema },
      { name: CATEGORIES_COLLECTION, schema: categorySchema },
      { name: QUERY_SUGGESTIONS_COLLECTION, schema: querySuggestionsSchema }
    ]

    for (const { name, schema } of collections) {
      try {
        const collection = await client.collections(name).retrieve()
        const existingFieldNames = new Set((collection.fields || []).map((field: any) => field.name))
        const schemaFieldNames = (schema.fields || []).map((field: any) => field.name)
        const missingFields = schemaFieldNames.filter((fieldName: string) => !existingFieldNames.has(fieldName))
        const expectedFields = new Map((schema.fields || []).map((field: any) => [field.name, field]))
        const incompatibleFields = (collection.fields || [])
          .filter((field: any) => {
            const expected = expectedFields.get(field.name)
            if (!expected) return false
            return (
              field.type !== expected.type ||
              Boolean(field.facet) !== Boolean(expected.facet) ||
              Boolean(field.optional) !== Boolean(expected.optional) ||
              Boolean(field.infix) !== Boolean(expected.infix) ||
              field.index === false !== (expected.index === false)
            )
          })
          .map((field: any) => field.name)

        if (missingFields.length > 0 || incompatibleFields.length > 0) {
          const reasons = [
            missingFields.length ? `missing fields: ${missingFields.join(', ')}` : '',
            incompatibleFields.length ? `incompatible fields: ${incompatibleFields.join(', ')}` : ''
          ].filter(Boolean)
          console.log(`[Typesense] Collection "${name}" schema ${reasons.join('; ')}. Recreating.`)
          await client.collections(name).delete()
          await client.collections().create(schema as any)
          console.log(`[Typesense] Recreated collection "${name}".`)
          needsReconciliation = true
          continue
        }

        console.log(`[Typesense] Collection "${name}" exists.`)
      } catch {
        await client.collections().create(schema as any)
        console.log(`[Typesense] Created collection "${name}".`)
        needsReconciliation = true
      }
    }
    return needsReconciliation
  }

  private async loadProducts(): Promise<any[]> {
    const products = await databaseService.products
      .aggregate([
        { $lookup: { from: process.env.DB_CATEGORIES_COLLECTION || 'categories', localField: 'categoryId', foreignField: '_id', as: 'category' } },
        { $lookup: { from: process.env.DB_BRANDS_COLLECTION || 'brands', localField: 'brandId', foreignField: '_id', as: 'brand' } },
        { $lookup: { from: process.env.DB_PRODUCT_DETAILS_COLLECTION || 'productDetails', localField: '_id', foreignField: 'productId', as: 'details' } },
        { $addFields: { category: { $arrayElemAt: ['$category', 0] }, brand: { $arrayElemAt: ['$brand', 0] }, details: { $arrayElemAt: ['$details', 0] } } }
      ])
      .toArray()
    const campaignModule = await import('./campaigns.services.js')
    const campaignService = (campaignModule.default as any)?.default ?? campaignModule.default
    return campaignService.enrichProductsWithCampaigns(products)
  }

  private async reconcileAll(): Promise<void> {
    if (!this.isAvailable || this.isReconciling) return
    this.isReconciling = true
    try {
      // A full source-of-truth rebuild supersedes stale in-memory operations.
      this.retryQueue = []
      await Promise.all(
        [PRODUCTS_COLLECTION, ARTICLES_COLLECTION, BRANDS_COLLECTION, CATEGORIES_COLLECTION].map((name) =>
          client.collections(name).documents().delete({ filter_by: 'mongoId:!=__typesense_never__' })
        )
      )
      const articles = await databaseService.articles
        .aggregate([
          { $lookup: { from: process.env.DB_HEALTH_CATEGORIES_COLLECTION || 'healthCategories', localField: 'categoryId', foreignField: '_id', as: 'category' } },
          { $addFields: { category: { $arrayElemAt: ['$category', 0] } } }
        ])
        .toArray()
      const [products, brands, categories] = await Promise.all([
        this.loadProducts(),
        databaseService.brands.find({}).toArray(),
        databaseService.categories.find({}).toArray()
      ])
      await Promise.all([
        this.bulkIndexProducts(products),
        this.bulkIndexArticles(articles),
        this.bulkIndexBrands(brands),
        this.bulkIndexCategories(categories)
      ])
      if (this.retryQueue.length > 0) throw new Error(`${this.retryQueue.length} Typesense operations are still queued`)
      const campaignFingerprint = await this.getCampaignFingerprint()
      this.retryQueue = []
      await databaseService.typesenseSyncState.updateOne(
        { key: 'global' },
        { $set: { key: 'global', dirty: false, reconciledAt: new Date(), campaignFingerprint }, $unset: { reason: '' } },
        { upsert: true }
      )
      console.log('[Typesense] Full reconciliation completed.')
    } catch (err) {
      await this.markDirty(`reconciliation: ${(err as Error)?.message}`)
      console.error('[Typesense] Full reconciliation failed:', (err as Error)?.message)
    } finally {
      this.isReconciling = false
    }
  }

  private async reconcileIfNeeded(force = false): Promise<void> {
    const state = await databaseService.typesenseSyncState.findOne({ key: 'global' })
    const campaignFingerprint = await this.getCampaignFingerprint()
    if (force || state?.dirty || state?.campaignFingerprint !== campaignFingerprint) await this.reconcileAll()
  }

  private async getCampaignFingerprint(): Promise<string> {
    const now = new Date()
    const campaigns = await databaseService.campaigns
      .find(
        { status: 'active', startDate: { $lte: now }, endDate: { $gte: now } },
        { projection: { _id: 1, updatedAt: 1, startDate: 1, endDate: 1 } }
      )
      .sort({ _id: 1 })
      .toArray()
    return campaigns
      .map((campaign) => `${campaign._id}:${campaign.updatedAt?.getTime?.() || ''}:${campaign.startDate}:${campaign.endDate}`)
      .join('|')
  }

  private startHealthCheck(): void {
    setInterval(async () => {
      try {
        await client.health.retrieve()
        if (!this.isAvailable) {
          this.isAvailable = true
          await this.ensureCollections()
          await this.reconcileIfNeeded(true)
        }
        await this.reconcileIfNeeded()
        await this.flushRetries()
      } catch {
        this.isAvailable = false
      }
    }, 30_000)
  }

  async initCollections(): Promise<void> {
    try {
      await client.health.retrieve()
      this.isAvailable = true
      await this.ensureCollections()
      await this.reconcileIfNeeded(true)
      await this.flushRetries()
    } catch {
      this.isAvailable = false
    }
    this.startHealthCheck()
  }

  async dropCollections(collectionNames: string[]): Promise<void> {
    for (const collectionName of collectionNames) {
      try {
        await client.collections(collectionName).delete()
        console.log(`[Typesense] Dropped collection "${collectionName}".`)
      } catch {
        // Collection may not exist yet.
      }
    }
  }

  async getCollectionFieldNames(collectionName: string): Promise<Set<string>> {
    const collection = await client.collections(collectionName).retrieve()
    return new Set((collection.fields || []).map((field: any) => field.name))
  }

  async indexProduct(product: any): Promise<void> {
    await this.runOrQueue(`indexProduct ${product?._id?.toString?.() || product?.mongoId || ''}`, async () => {
      const campaignModule = await import('./campaigns.services.js')
      const campaignService = (campaignModule.default as any)?.default ?? campaignModule.default
      const enriched = await campaignService.enrichProductWithCampaign(product)
      await client.collections(PRODUCTS_COLLECTION).documents().upsert(toProductDocument(enriched))
    })
  }

  async removeProduct(mongoId: string): Promise<void> {
    await this.runOrQueue(`removeProduct ${mongoId}`, async () => {
      await client.collections(PRODUCTS_COLLECTION).documents().delete({ filter_by: `mongoId:=${mongoId}` })
    })
  }

  async bulkIndexProducts(products: any[]): Promise<void> {
    if (!products.length) return
    await this.runOrQueue(`bulkIndexProducts ${products.length}`, async () => {
      const campaignModule = await import('./campaigns.services.js')
      const campaignService = (campaignModule.default as any)?.default ?? campaignModule.default
      const enriched = await campaignService.enrichProductsWithCampaigns(products)
      const result = await client.collections(PRODUCTS_COLLECTION).documents().import(enriched.map(toProductDocument), { action: 'upsert' })
      const failed = result.filter((r: any) => !r.success).length
      console.log(`[Typesense] Bulk indexed ${products.length - failed}/${products.length} products.`)
      if (failed > 0) throw new Error(`${failed} product documents failed to import`)
    })
  }

  async indexArticle(article: any): Promise<void> {
    await this.runOrQueue(`indexArticle ${article?._id?.toString?.() || article?.mongoId || ''}`, async () => {
      await client.collections(ARTICLES_COLLECTION).documents().upsert(toArticleDocument(article))
    })
  }

  async removeArticle(mongoId: string): Promise<void> {
    await this.runOrQueue(`removeArticle ${mongoId}`, async () => {
      await client.collections(ARTICLES_COLLECTION).documents().delete({ filter_by: `mongoId:=${mongoId}` })
    })
  }

  async bulkIndexArticles(articles: any[]): Promise<void> {
    if (!articles.length) return
    await this.runOrQueue(`bulkIndexArticles ${articles.length}`, async () => {
      const result = await client.collections(ARTICLES_COLLECTION).documents().import(articles.map(toArticleDocument), { action: 'upsert' })
      const failed = result.filter((r: any) => !r.success).length
      console.log(`[Typesense] Bulk indexed ${articles.length - failed}/${articles.length} articles.`)
      if (failed > 0) throw new Error(`${failed} article documents failed to import`)
    })
  }

  async indexBrand(brand: any): Promise<void> {
    await this.runOrQueue(`indexBrand ${brand?._id?.toString?.() || brand?.mongoId || ''}`, async () => {
      await client.collections(BRANDS_COLLECTION).documents().upsert(toBrandDocument(brand))
    })
  }

  async removeBrand(mongoId: string): Promise<void> {
    await this.runOrQueue(`removeBrand ${mongoId}`, async () => {
      await client.collections(BRANDS_COLLECTION).documents().delete({ filter_by: `mongoId:=${mongoId}` })
    })
  }

  async bulkIndexBrands(brands: any[]): Promise<void> {
    if (!brands.length) return
    await this.runOrQueue(`bulkIndexBrands ${brands.length}`, async () => {
      const docs = brands.map(toBrandDocument)
      const result = await client.collections(BRANDS_COLLECTION).documents().import(docs, { action: 'upsert' })
      const failed = result.filter((r: any) => !r.success).length
      console.log(`[Typesense] Bulk indexed ${docs.length - failed}/${docs.length} brands.`)
      if (failed > 0) throw new Error(`${failed} brand documents failed to import`)
    })
  }

  async indexCategory(category: any): Promise<void> {
    await this.runOrQueue(`indexCategory ${category?._id?.toString?.() || category?.mongoId || ''}`, async () => {
      await client.collections(CATEGORIES_COLLECTION).documents().upsert(toCategoryDocument(category))
    })
  }

  async removeCategory(mongoId: string): Promise<void> {
    await this.runOrQueue(`removeCategory ${mongoId}`, async () => {
      await client.collections(CATEGORIES_COLLECTION).documents().delete({ filter_by: `mongoId:=${mongoId}` })
    })
  }

  async bulkIndexCategories(categories: any[]): Promise<void> {
    if (!categories.length) return
    await this.runOrQueue(`bulkIndexCategories ${categories.length}`, async () => {
      const docs = categories.map(toCategoryDocument)
      const result = await client.collections(CATEGORIES_COLLECTION).documents().import(docs, { action: 'upsert' })
      const failed = result.filter((r: any) => !r.success).length
      console.log(`[Typesense] Bulk indexed ${docs.length - failed}/${docs.length} categories.`)
      if (failed > 0) throw new Error(`${failed} category documents failed to import`)
    })
  }

  async bulkIndexQuerySuggestions(items: { q: string; type: string; count: number }[]): Promise<void> {
    if (!this.isAvailable || !items.length) return
    try {
      const docs = items.map(toQuerySuggestionDocument)
      const result = await client.collections(QUERY_SUGGESTIONS_COLLECTION).documents().import(docs, { action: 'upsert' })
      const failed = result.filter((r: any) => !r.success).length
      console.log(`[Typesense] Bulk indexed ${docs.length - failed}/${docs.length} query suggestions.`)
    } catch (err) {
      console.error('[Typesense] bulkIndexQuerySuggestions error:', (err as Error)?.message)
    }
  }

  async suggestQueries(q: string): Promise<string[]> {
    if (!this.isAvailable || !q || q.trim().length < 2) return []
    try {
      const result = await client.collections(QUERY_SUGGESTIONS_COLLECTION).documents().search({
        q: q.trim(),
        query_by: 'q',
        prefix: true,
        num_typos: 1,
        per_page: 6,
        sort_by: '_text_match:desc,count:desc',
        include_fields: 'q,type,count'
      })
      return (result.hits || []).map((h: any) => h.document.q as string)
    } catch (err) {
      console.error('[Typesense] suggestQueries error:', (err as Error)?.message)
      return []
    }
  }

  async suggest(q: string): Promise<any> {
    if (!this.isAvailable) return { products: [], brands: [], categories: [], articles: [] }
    try {
      // Two-stage product search:
      // Stage 1: match by name/sku/brandName → "exact concept" matches
      // Stage 2: match by activeIngredients/indications → "ingredient" matches
      // Merge deduped, name-matches come first for relevance
      const results = (await client.multiSearch.perform({
        searches: [
          // Products by name/brand/sku (high precision)
          // OTC (requiresPrescription=false=0) được ưu tiên hơn thuốc kê đơn
          {
            collection: PRODUCTS_COLLECTION,
            q,
            query_by: 'name,sku,brandName,dosageForm,strength',
            query_by_weights: '4,3,3,1,1',
            filter_by: 'isActive:=true',
            per_page: 5,
            include_fields: 'mongoId,name,slug,featuredImage,price,rating,brandName,categoryName,activeIngredients,requiresPrescription',
            sort_by: '_text_match:desc,requiresPrescription:asc,stockQuantity:desc',
            num_typos: 2,
            prefix: true
          },
          // Products by active ingredient/indications (ingredient lookup)
          // OTC ưu tiên hơn kê đơn khi score text match bằng nhau
          {
            collection: PRODUCTS_COLLECTION,
            q,
            query_by: 'activeIngredients,indications,shortDescription',
            query_by_weights: '4,2,1',
            filter_by: 'isActive:=true',
            per_page: 12,
            include_fields: 'mongoId,name,slug,featuredImage,price,rating,brandName,categoryName,activeIngredients,requiresPrescription',
            sort_by: '_text_match:desc,requiresPrescription:asc,stockQuantity:desc',
            num_typos: 1
          },
          // Brands
          {
            collection: BRANDS_COLLECTION,
            q,
            query_by: 'name,description',
            filter_by: 'isActive:=true',
            per_page: 2,
            include_fields: 'mongoId,name,slug,logo,productCount',
            num_typos: 1
          },
          // Categories
          {
            collection: CATEGORIES_COLLECTION,
            q,
            query_by: 'name,description',
            filter_by: 'isActive:=true',
            per_page: 2,
            include_fields: 'mongoId,name,slug,icon,productCount,level',
            num_typos: 1
          },
          // Health articles
          {
            collection: ARTICLES_COLLECTION,
            q,
            query_by: 'title,excerpt,tags,healthTopics,symptoms,activeIngredients,targetAudiences,categoryName',
            query_by_weights: '5,3,2,3,3,3,2,2',
            filter_by: 'isPublished:=true',
            per_page: 4,
            include_fields: 'mongoId,title,slug,excerpt,featuredImage,categoryName,tags,riskLevel',
            num_typos: 1,
            prefix: true
          }
        ]
      })) as any

      // Merge products: name-matches first, then ingredient-matches, deduped by mongoId
      const seen = new Set<string>()
      const nameHits = (results.results[0] as any).hits || []
      const ingredientHits = (results.results[1] as any).hits || []

      const productHits: any[] = []
      for (const hit of nameHits) {
        const id = hit.document.mongoId
        if (!seen.has(id)) {
          seen.add(id)
          productHits.push(hit)
        }
      }
      for (const hit of ingredientHits) {
        const id = hit.document.mongoId
        if (!seen.has(id)) {
          seen.add(id)
          productHits.push(hit)
          if (productHits.length >= 15) break // cap total at 15
        }
      }

      return {
        products: productHits,
        brands: (results.results[2] as any).hits || [],
        categories: (results.results[3] as any).hits || [],
        articles: (results.results[4] as any).hits || []
      }
    } catch (err) {
      console.error('[Typesense] suggest error:', (err as Error)?.message)
      return { products: [], brands: [], categories: [], articles: [] }
    }
  }

  async searchProducts(params: {
    q: string
    page?: number
    limit?: number
    categoryId?: string
    categoryIds?: string[]
    brandId?: string
    requiresPrescription?: boolean
    inStock?: boolean
    priceMin?: number
    priceMax?: number
    ratingMin?: number
    sortBy?: string
  }): Promise<any> {
    console.log('[Typesense] searchProducts called, isAvailable =', this.isAvailable)
    if (!this.isAvailable) return null

    const { q, page = 1, limit = 20, categoryId, categoryIds, brandId, requiresPrescription, inStock, priceMin, priceMax, ratingMin, sortBy } = params

    let reqPrescription = requiresPrescription
    if (reqPrescription === undefined && (priceMin !== undefined || priceMax !== undefined || sortBy === 'price_asc' || sortBy === 'price_desc')) {
      reqPrescription = false
    }

    const filters: string[] = ['isActive:=true']
    if (categoryIds?.length) filters.push(`categoryId:=[${categoryIds.join(',')}]`)
    else if (categoryId) filters.push(`categoryId:=${categoryId}`)
    if (brandId) filters.push(`brandId:=${brandId}`)
    if (reqPrescription !== undefined) filters.push(`requiresPrescription:=${reqPrescription}`)
    if (inStock) filters.push('inStock:=true')
    if (priceMin !== undefined && priceMax !== undefined) filters.push(`price:[${priceMin}..${priceMax}]`)
    else if (priceMin !== undefined) filters.push(`price:>=${priceMin}`)
    else if (priceMax !== undefined) filters.push(`price:<=${priceMax}`)
    if (ratingMin !== undefined) filters.push(`rating:>=${ratingMin}`)

    // Mặc định: ưu tiên OTC trước kê đơn (requiresPrescription:asc → false=0 trước true=1)
    // Trừ khi user đã filter requiresPrescription cụ thể thì bỏ qua ưu tiên này
    const rxSort = reqPrescription !== undefined ? '' : 'requiresPrescription:asc,'
    // Khi q='*' (browse mode), _text_match không có ý nghĩa → bỏ qua
    // Typesense giới hạn tối đa 3 sort fields
    const isTextSearch = q && q !== '*'
    const textMatchPrefix = isTextSearch ? '_text_match:desc,' : ''

    let sortByStr = `${textMatchPrefix}${rxSort}rating:desc`.replace(/,$/, '')
    if (sortBy === 'price_asc') sortByStr = `${rxSort}price:asc`.replace(/,$/, '')
    else if (sortBy === 'price_desc') sortByStr = `${rxSort}price:desc`.replace(/,$/, '')
    else if (sortBy === 'newest') sortByStr = `${rxSort}createdAt:desc`.replace(/,$/, '')
    else if (sortBy === 'rating') sortByStr = `${rxSort}rating:desc,reviewCount:desc`

    try {
      return await client.collections(PRODUCTS_COLLECTION).documents().search({
        q: q && q !== '*' ? `${q} ${normalizeVietnamese(q)}` : '*',
        query_by: 'name,shortDescription,sku,activeIngredients,indications,categoryName,brandName,dosageForm,strength,barcode,searchTextNormalized',
        filter_by: filters.join(' && '),
        facet_by: 'categoryId,categoryName,brandId,brandName,requiresPrescription,inStock,manufacturer',
        sort_by: sortByStr,
        page,
        per_page: limit,
        num_typos: 2
      })
    } catch (err) {
      console.error('[Typesense] searchProducts error:', err)
      return null
    }
  }

  async searchArticles(params: { q: string; page?: number; limit?: number; categoryId?: string }): Promise<any> {
    if (!this.isAvailable) return null
    const { q, page = 1, limit = 10, categoryId } = params
    const filters: string[] = ['isPublished:=true']
    if (categoryId) filters.push(`categoryId:=${categoryId}`)
    try {
      return await client.collections(ARTICLES_COLLECTION).documents().search({
        q: q || '*',
        query_by: 'title,excerpt,content,tags,healthTopics,symptoms,activeIngredients,targetAudiences,categoryName',
        query_by_weights: '5,3,1,2,3,3,3,2,2',
        filter_by: filters.join(' && '),
        facet_by: 'categoryId,categoryName,tags,riskLevel,targetAudiences,healthTopics',
        sort_by: '_text_match:desc,viewCount:desc',
        page,
        per_page: limit,
        num_typos: 2,
        highlight_full_fields: 'title,excerpt',
        highlight_affix_num_tokens: 5
      })
    } catch {
      return null
    }
  }

  // ── Status ────────────────────────────────────────────────────────────────

  getAvailability(): boolean {
    return this.isAvailable
  }

  async requestReconciliation(reason: string): Promise<void> {
    await this.markDirty(reason)
    if (this.isAvailable) void this.reconcileAll()
  }

  async getConsistencyStatus(): Promise<Record<string, unknown>> {
    if (!this.isAvailable) return { healthy: false, dirty: true }
    const [state, collections] = await Promise.all([
      databaseService.typesenseSyncState.findOne({ key: 'global' }),
      Promise.all(
        [PRODUCTS_COLLECTION, ARTICLES_COLLECTION, BRANDS_COLLECTION, CATEGORIES_COLLECTION].map(async (name) => {
          const collection = await client.collections(name).retrieve()
          return [name, collection.num_documents || 0] as const
        })
      )
    ])
    return { healthy: true, dirty: Boolean(state?.dirty), counts: Object.fromEntries(collections), lastReconciledAt: state?.reconciledAt }
  }
}

const typesenseService = new TypesenseService()
export default typesenseService
