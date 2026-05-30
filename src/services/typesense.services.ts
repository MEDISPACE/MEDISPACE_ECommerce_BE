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
const BRANDS_COLLECTION = 'brands'
const CATEGORIES_COLLECTION = 'categories'

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
    { name: 'createdAt', type: 'int64' as const }
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
    { name: 'authorName', type: 'string' as const, optional: true },
    { name: 'isPublished', type: 'bool' as const, facet: true },
    { name: 'isFeatured', type: 'bool' as const, facet: true },
    { name: 'viewCount', type: 'int32' as const },
    { name: 'publishedAt', type: 'int64' as const, optional: true },
    { name: 'featuredImage', type: 'string' as const, index: false, optional: true }
  ],
  default_sorting_field: 'viewCount'
}

const brandSchema = {
  name: BRANDS_COLLECTION,
  fields: [
    { name: 'mongoId', type: 'string' as const },
    { name: 'name', type: 'string' as const },
    { name: 'slug', type: 'string' as const }
  ]
}

const categorySchema = {
  name: CATEGORIES_COLLECTION,
  fields: [
    { name: 'mongoId', type: 'string' as const },
    { name: 'name', type: 'string' as const },
    { name: 'slug', type: 'string' as const }
  ]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toProductDocument(product: any): Record<string, unknown> {
  const defaultVariant = product.priceVariants?.find((v: any) => v.isDefault) || product.priceVariants?.[0]
  const price = defaultVariant?.price || product.price || 0
  const mongoId = product._id?.toString() || ''

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

// ─── Service Class ───────────────────────────────────────────────────────────

class TypesenseService {
  private isAvailable = false

  private async ensureCollections(): Promise<void> {
    const collections = [
      { name: PRODUCTS_COLLECTION, schema: productSchema },
      { name: ARTICLES_COLLECTION, schema: articleSchema },
      { name: BRANDS_COLLECTION, schema: brandSchema },
      { name: CATEGORIES_COLLECTION, schema: categorySchema }
    ]

    for (const { name, schema } of collections) {
      try {
        await client.collections(name).retrieve()
        console.log(`[Typesense] Collection "${name}" exists.`)
      } catch {
        await client.collections().create(schema as any)
        console.log(`[Typesense] Created collection "${name}".`)
      }
    }
  }

  private startHealthCheck(): void {
    setInterval(async () => {
      try {
        await client.health.retrieve()
        if (!this.isAvailable) {
          this.isAvailable = true
          await this.ensureCollections()
        }
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
    } catch {
      this.isAvailable = false
    }
    this.startHealthCheck()
  }

  async indexProduct(product: any): Promise<void> {
    if (!this.isAvailable) return
    try {
      await client.collections(PRODUCTS_COLLECTION).documents().upsert(toProductDocument(product))
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
      await client.collections(PRODUCTS_COLLECTION).documents().import(products.map(toProductDocument), { action: 'upsert' })
    } catch (err) {
      console.error('[Typesense] bulkIndexProducts error:', (err as Error)?.message)
    }
  }

  async indexArticle(article: any): Promise<void> {
    if (!this.isAvailable) return
    try {
      await client.collections(ARTICLES_COLLECTION).documents().upsert(toArticleDocument(article))
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
      await client.collections(ARTICLES_COLLECTION).documents().import(articles.map(toArticleDocument), { action: 'upsert' })
    } catch (err) {
      console.error('[Typesense] bulkIndexArticles error:', (err as Error)?.message)
    }
  }

  async indexBrand(brand: any): Promise<void> {
    if (!this.isAvailable) return
    try {
      await client.collections(BRANDS_COLLECTION).documents().upsert(toBrandDocument(brand))
    } catch (err) {
      console.error('[Typesense] indexBrand error:', (err as Error)?.message)
    }
  }

  async removeBrand(mongoId: string): Promise<void> {
    if (!this.isAvailable) return
    try {
      await client.collections(BRANDS_COLLECTION).documents().delete({ filter_by: `mongoId:=${mongoId}` })
    } catch (err) {
      console.error('[Typesense] removeBrand error:', (err as Error)?.message)
    }
  }

  async bulkIndexBrands(brands: any[]): Promise<void> {
    if (!this.isAvailable || !brands.length) return
    try {
      const docs = brands.map(toBrandDocument)
      const result = await client.collections(BRANDS_COLLECTION).documents().import(docs, { action: 'upsert' })
      const failed = result.filter((r: any) => !r.success).length
      console.log(`[Typesense] Bulk indexed ${docs.length - failed}/${docs.length} brands.`)
    } catch (err) {
      console.error('[Typesense] bulkIndexBrands error:', (err as Error)?.message)
    }
  }

  async indexCategory(category: any): Promise<void> {
    if (!this.isAvailable) return
    try {
      await client.collections(CATEGORIES_COLLECTION).documents().upsert(toCategoryDocument(category))
    } catch (err) {
      console.error('[Typesense] indexCategory error:', (err as Error)?.message)
    }
  }

  async removeCategory(mongoId: string): Promise<void> {
    if (!this.isAvailable) return
    try {
      await client.collections(CATEGORIES_COLLECTION).documents().delete({ filter_by: `mongoId:=${mongoId}` })
    } catch (err) {
      console.error('[Typesense] removeCategory error:', (err as Error)?.message)
    }
  }

  async bulkIndexCategories(categories: any[]): Promise<void> {
    if (!this.isAvailable || !categories.length) return
    try {
      const docs = categories.map(toCategoryDocument)
      const result = await client.collections(CATEGORIES_COLLECTION).documents().import(docs, { action: 'upsert' })
      const failed = result.filter((r: any) => !r.success).length
      console.log(`[Typesense] Bulk indexed ${docs.length - failed}/${docs.length} categories.`)
    } catch (err) {
      console.error('[Typesense] bulkIndexCategories error:', (err as Error)?.message)
    }
  }

  async suggest(q: string): Promise<any> {
    if (!this.isAvailable) return { products: [], brands: [], categories: [] }
    try {
      // Two-stage product search:
      // Stage 1: match by name/sku/brandName → "exact concept" matches
      // Stage 2: match by activeIngredients/indications → "ingredient" matches
      // Merge deduped, name-matches come first for relevance
      const results = await client.multiSearch.perform({
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
          }
        ]
      })

      // Merge products: name-matches first, then ingredient-matches, deduped by mongoId
      const seen = new Set<string>()
      const nameHits = results.results[0].hits || []
      const ingredientHits = results.results[1].hits || []

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

      // Stable sort: OTC (requiresPrescription=false) luôn lên trước kê đơn
      // Giữ nguyên thứ tự tương đối trong từng nhóm (stable sort)
      productHits.sort((a, b) => {
        const aRx = a.document.requiresPrescription ? 1 : 0
        const bRx = b.document.requiresPrescription ? 1 : 0
        return aRx - bRx
      })

      return {
        products: productHits,
        brands: results.results[2].hits || [],
        categories: results.results[3].hits || []
      }
    } catch (err) {
      console.error('[Typesense] suggest error:', (err as Error)?.message)
      return { products: [], brands: [], categories: [] }
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
    if (!this.isAvailable) return null

    const { q, page = 1, limit = 20, categoryId, brandId, requiresPrescription, inStock, priceMin, priceMax, ratingMin, sortBy } = params

    const filters: string[] = ['isActive:=true']
    if (categoryId) filters.push(`categoryId:=${categoryId}`)
    if (brandId) filters.push(`brandId:=${brandId}`)
    if (requiresPrescription !== undefined) filters.push(`requiresPrescription:=${requiresPrescription}`)
    if (inStock) filters.push('inStock:=true')
    if (priceMin !== undefined && priceMax !== undefined) filters.push(`price:[${priceMin}..${priceMax}]`)
    else if (priceMin !== undefined) filters.push(`price:>=${priceMin}`)
    else if (priceMax !== undefined) filters.push(`price:<=${priceMax}`)
    if (ratingMin !== undefined) filters.push(`rating:>=${ratingMin}`)

    // Mặc định: ưu tiên OTC trước kê đơn (requiresPrescription:asc → false=0 trước true=1)
    // Trừ khi user đã filter requiresPrescription cụ thể thì bỏ qua ưu tiên này
    const rxSort = requiresPrescription !== undefined ? '' : 'requiresPrescription:asc,'

    let sortByStr = `_text_match:desc,${rxSort}rating:desc,reviewCount:desc,stockQuantity:desc`
    if (sortBy === 'price_asc') sortByStr = `${rxSort}price:asc`
    else if (sortBy === 'price_desc') sortByStr = `${rxSort}price:desc`
    else if (sortBy === 'newest') sortByStr = `${rxSort}createdAt:desc`
    else if (sortBy === 'rating') sortByStr = `${rxSort}rating:desc,reviewCount:desc`

    try {
      return await client.collections(PRODUCTS_COLLECTION).documents().search({
        q: q || '*',
        query_by: 'name,shortDescription,sku,activeIngredients,indications,categoryName,brandName,dosageForm,strength,barcode',
        filter_by: filters.join(' && '),
        facet_by: 'categoryId,categoryName,brandId,brandName,requiresPrescription,inStock,manufacturer',
        sort_by: sortByStr,
        page,
        per_page: limit,
        num_typos: 2
      })
    } catch {
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
        query_by: 'title,excerpt,content,tags',
        filter_by: filters.join(' && '),
        sort_by: 'viewCount:desc',
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
}

const typesenseService = new TypesenseService()
export default typesenseService
