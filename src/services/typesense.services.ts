import Typesense from 'typesense'
import { config } from 'dotenv'

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
  connectionTimeoutSeconds: 5
})

// ─── Schemas ────────────────────────────────────────────────────────────────

const PRODUCTS_COLLECTION = 'products'
const ARTICLES_COLLECTION = 'articles'

const productSchema = {
  name: PRODUCTS_COLLECTION,
  fields: [
    { name: 'mongoId',              type: 'string' as const },
    { name: 'name',                 type: 'string' as const, infix: true },
    { name: 'slug',                 type: 'string' as const, index: false },
    { name: 'sku',                  type: 'string' as const, infix: true },
    { name: 'shortDescription',     type: 'string' as const, optional: true },
    { name: 'categoryId',           type: 'string' as const, facet: true },
    { name: 'categoryName',         type: 'string' as const, facet: true },
    { name: 'brandId',              type: 'string' as const, facet: true, optional: true },
    { name: 'brandName',            type: 'string' as const, facet: true, optional: true },
    { name: 'requiresPrescription', type: 'bool'   as const, facet: true },
    { name: 'isActive',             type: 'bool'   as const, facet: true },
    { name: 'inStock',              type: 'bool'   as const, facet: true },
    { name: 'stockQuantity',        type: 'int32'  as const },
    { name: 'price',                type: 'float'  as const },
    { name: 'rating',               type: 'float'  as const },
    { name: 'reviewCount',          type: 'int32'  as const },
    { name: 'featuredImage',        type: 'string' as const, index: false, optional: true },
    // From ProductDetail
    { name: 'activeIngredients',    type: 'string' as const, optional: true },
    { name: 'indications',          type: 'string' as const, optional: true },
    { name: 'manufacturer',         type: 'string' as const, optional: true, facet: true },
    { name: 'createdAt',            type: 'int64'  as const }
  ],
  default_sorting_field: 'rating',
  token_separators: ['-', '/', '(', ')', '.', ',']
}

const articleSchema = {
  name: ARTICLES_COLLECTION,
  fields: [
    { name: 'mongoId',       type: 'string'   as const },
    { name: 'title',         type: 'string'   as const },
    { name: 'slug',          type: 'string'   as const, index: false },
    { name: 'excerpt',       type: 'string'   as const, optional: true },
    { name: 'content',       type: 'string'   as const, optional: true },
    { name: 'categoryId',    type: 'string'   as const, facet: true, optional: true },
    { name: 'categoryName',  type: 'string'   as const, facet: true, optional: true },
    { name: 'tags',          type: 'string[]' as const, facet: true, optional: true },
    { name: 'authorName',    type: 'string'   as const, optional: true },
    { name: 'isPublished',   type: 'bool'     as const, facet: true },
    { name: 'isFeatured',    type: 'bool'     as const, facet: true },
    { name: 'viewCount',     type: 'int32'    as const },
    { name: 'publishedAt',   type: 'int64'    as const, optional: true },
    { name: 'featuredImage', type: 'string'   as const, index: false, optional: true }
  ],
  default_sorting_field: 'viewCount'
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toProductDocument(product: any): Record<string, unknown> {
  // Determine default price from priceVariants
  const defaultVariant = product.priceVariants?.find((v: any) => v.isDefault) || product.priceVariants?.[0]
  const price = defaultVariant?.price || product.price || 0
  const mongoId = product._id?.toString() || ''

  return {
    id:                   mongoId,   // ← Typesense primary key (required for upsert dedup)
    mongoId,
    name:                 product.name || '',
    slug:                 product.slug || '',
    sku:                  product.sku || '',
    shortDescription:     product.shortDescription || '',
    categoryId:           product.categoryId?.toString() || '',
    categoryName:         product.category?.name || product.categoryName || '',
    brandId:              product.brandId?.toString() || '',
    brandName:            product.brand?.name || product.brandName || '',
    requiresPrescription: Boolean(product.requiresPrescription),
    isActive:             product.isActive !== false,
    inStock:              (product.stockQuantity || 0) > 0,
    stockQuantity:        product.stockQuantity || 0,
    price,
    rating:               product.rating || 0,
    reviewCount:          product.reviewCount || 0,
    featuredImage:        product.featuredImage || '',
    // ProductDetail fields (joined in seed, optionally present)
    activeIngredients:    product.details?.activeIngredients || product.activeIngredients || '',
    indications:          product.details?.indications || product.indications || '',
    manufacturer:         product.details?.manufacturer || product.manufacturer || '',
    createdAt:            product.createdAt ? new Date(product.createdAt).getTime() : Date.now()
  }
}

function toArticleDocument(article: any): Record<string, unknown> {
  const mongoId = article._id?.toString() || ''
  return {
    id:           mongoId,   // ← Typesense primary key
    mongoId,
    title:        article.title || '',
    slug:         article.slug || '',
    excerpt:      article.excerpt || '',
    content:      typeof article.content === 'string'
      ? article.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 5000)
      : '',
    categoryId:   article.categoryId?.toString() || '',
    categoryName: article.category?.name || '',
    tags:         Array.isArray(article.tags) ? article.tags : [],
    authorName:   article.authorName || '',
    isPublished:  Boolean(article.isPublished),
    isFeatured:   Boolean(article.isFeatured),
    viewCount:    article.viewCount || 0,
    publishedAt:  article.publishedAt ? new Date(article.publishedAt).getTime() : undefined,
    featuredImage: article.featuredImage || ''
  }
}

// ─── Service Class ───────────────────────────────────────────────────────────

class TypesenseService {
  private isAvailable = false

  // ── Init ──────────────────────────────────────────────────────────────────

  private async ensureCollections(): Promise<void> {
    // Create or skip products collection
    try {
      await client.collections(PRODUCTS_COLLECTION).retrieve()
      console.log('[Typesense] Collection "products" already exists.')
    } catch {
      await client.collections().create(productSchema as any)
      console.log('[Typesense] Created collection "products".')
    }

    // Create or skip articles collection
    try {
      await client.collections(ARTICLES_COLLECTION).retrieve()
      console.log('[Typesense] Collection "articles" already exists.')
    } catch {
      await client.collections().create(articleSchema as any)
      console.log('[Typesense] Created collection "articles".')
    }
  }

  private startHealthCheck(): void {
    setInterval(async () => {
      try {
        await client.health.retrieve()
        if (!this.isAvailable) {
          this.isAvailable = true
          console.log('[Typesense] Recovered — back online. Re-ensuring collections...')
          await this.ensureCollections()
        }
      } catch {
        if (this.isAvailable) {
          this.isAvailable = false
          console.warn('[Typesense] Lost connection — falling back to MongoDB.')
        }
      }
    }, 30_000)
  }

  async initCollections(): Promise<void> {
    try {
      await client.health.retrieve()
      this.isAvailable = true

      await this.ensureCollections()

      console.log('[Typesense] Ready.')
    } catch (err) {
      this.isAvailable = false
      console.warn('[Typesense] Not available on startup — search will fall back to MongoDB.', (err as Error)?.message)
    }

    // Start periodic health-check để tự recover khi Typesense back online
    this.startHealthCheck()
  }

  // ── Product Indexing ──────────────────────────────────────────────────────

  async indexProduct(product: any): Promise<void> {
    if (!this.isAvailable) return
    try {
      const doc = toProductDocument(product)
      await client.collections(PRODUCTS_COLLECTION).documents().upsert(doc)
    } catch (err) {
      console.error('[Typesense] indexProduct error:', (err as Error)?.message)
    }
  }

  async removeProduct(mongoId: string): Promise<void> {
    if (!this.isAvailable) return
    try {
      await client.collections(PRODUCTS_COLLECTION).documents().delete({ filter_by: `mongoId:=${mongoId}` })
    } catch (err) {
      console.error('[Typesense] removeProduct error:', (err as Error)?.message)
    }
  }

  async bulkIndexProducts(products: any[]): Promise<void> {
    if (!this.isAvailable || !products.length) return
    try {
      const docs = products.map(toProductDocument)
      const result = await client.collections(PRODUCTS_COLLECTION).documents().import(docs, { action: 'upsert' })
      const failed = result.filter((r: any) => !r.success).length
      console.log(`[Typesense] Bulk indexed ${docs.length - failed}/${docs.length} products. Failed: ${failed}`)
    } catch (err) {
      console.error('[Typesense] bulkIndexProducts error:', (err as Error)?.message)
    }
  }

  // ── Article Indexing ──────────────────────────────────────────────────────

  async indexArticle(article: any): Promise<void> {
    if (!this.isAvailable) return
    try {
      const doc = toArticleDocument(article)
      await client.collections(ARTICLES_COLLECTION).documents().upsert(doc)
    } catch (err) {
      console.error('[Typesense] indexArticle error:', (err as Error)?.message)
    }
  }

  async removeArticle(mongoId: string): Promise<void> {
    if (!this.isAvailable) return
    try {
      await client.collections(ARTICLES_COLLECTION).documents().delete({ filter_by: `mongoId:=${mongoId}` })
    } catch (err) {
      console.error('[Typesense] removeArticle error:', (err as Error)?.message)
    }
  }

  async bulkIndexArticles(articles: any[]): Promise<void> {
    if (!this.isAvailable || !articles.length) return
    try {
      const docs = articles.map(toArticleDocument)
      const result = await client.collections(ARTICLES_COLLECTION).documents().import(docs, { action: 'upsert' })
      const failed = result.filter((r: any) => !r.success).length
      console.log(`[Typesense] Bulk indexed ${docs.length - failed}/${docs.length} articles. Failed: ${failed}`)
    } catch (err) {
      console.error('[Typesense] bulkIndexArticles error:', (err as Error)?.message)
    }
  }

  // ── Search ────────────────────────────────────────────────────────────────

  async suggest(q: string): Promise<any> {
    if (!this.isAvailable) return { products: [], categories: [] }
    try {
      const results = await client.multiSearch.perform({
        searches: [
          {
            collection: PRODUCTS_COLLECTION,
            q,
            query_by: 'name,sku,activeIngredients',
            filter_by: 'isActive:=true',
            per_page: 5,
            include_fields: 'mongoId,name,slug,featuredImage,price,rating',
            typo_tokens_threshold: 1,
            num_typos: 2
          }
        ]
      })
      return results.results[0]
    } catch (err) {
      console.error('[Typesense] suggest error:', (err as Error)?.message)
      return { hits: [] }
    }
  }

  async searchProducts(params: {
    q: string
    page?: number
    limit?: number
    categoryId?: string
    brandId?: string
    requiresPrescription?: boolean
    inStock?: boolean
    priceMin?: number
    priceMax?: number
    ratingMin?: number
    sortBy?: string
  }): Promise<any> {
    if (!this.isAvailable) return null // signal caller to fall back to MongoDB

    const { q, page = 1, limit = 20, categoryId, brandId, requiresPrescription, inStock, priceMin, priceMax, ratingMin, sortBy } = params

    // Build filter string
    const filters: string[] = ['isActive:=true']
    if (categoryId) filters.push(`categoryId:=${categoryId}`)
    if (brandId) filters.push(`brandId:=${brandId}`)
    if (requiresPrescription !== undefined) filters.push(`requiresPrescription:=${requiresPrescription}`)
    if (inStock) filters.push('inStock:=true')
    if (priceMin !== undefined && priceMax !== undefined) filters.push(`price:[${priceMin}..${priceMax}]`)
    else if (priceMin !== undefined) filters.push(`price:>=${priceMin}`)
    else if (priceMax !== undefined) filters.push(`price:<=${priceMax}`)
    if (ratingMin !== undefined) filters.push(`rating:>=${ratingMin}`)

    // Sort
    let sortByStr = 'rating:desc,reviewCount:desc'
    if (sortBy === 'price_asc') sortByStr = 'price:asc'
    else if (sortBy === 'price_desc') sortByStr = 'price:desc'
    else if (sortBy === 'newest') sortByStr = 'createdAt:desc'
    else if (sortBy === 'rating') sortByStr = 'rating:desc'

    try {
      const result = await client.collections(PRODUCTS_COLLECTION).documents().search({
        q: q || '*',
        query_by: 'name,shortDescription,sku,activeIngredients,indications,categoryName,brandName',
        filter_by: filters.join(' && '),
        facet_by: 'categoryId,categoryName,brandId,brandName,requiresPrescription,inStock',
        sort_by: sortByStr,
        page,
        per_page: limit,
        num_typos: 2,
        typo_tokens_threshold: 1,
        highlight_full_fields: 'name,shortDescription',
        highlight_affix_num_tokens: 3
      })
      return result
    } catch (err) {
      console.error('[Typesense] searchProducts error:', (err as Error)?.message)
      return null
    }
  }

  async searchArticles(params: {
    q: string
    page?: number
    limit?: number
    categoryId?: string
  }): Promise<any> {
    if (!this.isAvailable) return null

    const { q, page = 1, limit = 10, categoryId } = params
    const filters: string[] = ['isPublished:=true']
    if (categoryId) filters.push(`categoryId:=${categoryId}`)

    try {
      const result = await client.collections(ARTICLES_COLLECTION).documents().search({
        q: q || '*',
        query_by: 'title,excerpt,content,tags',
        filter_by: filters.join(' && '),
        sort_by: 'viewCount:desc',
        page,
        per_page: limit,
        num_typos: 2,
        highlight_full_fields: 'title,excerpt',
        highlight_affix_num_tokens: 5
      })
      return result
    } catch (err) {
      console.error('[Typesense] searchArticles error:', (err as Error)?.message)
      return null
    }
  }

  // ── Status ────────────────────────────────────────────────────────────────

  getAvailability(): boolean {
    return this.isAvailable
  }
}

const typesenseService = new TypesenseService()
export default typesenseService
