import { Request, Response } from 'express'
import { ObjectId } from 'mongodb'
import typesenseService from '~/services/typesense.services'
import databaseService from '~/services/database.services'
import HTTP_STATUS from '~/constants/httpStatus'

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ─── GET /search/suggest?q= ──────────────────────────────────────────────────
export const suggestController = async (req: Request, res: Response) => {
  const q = (req.query.q as string) || ''

  if (!q || q.trim().length < 2) {
    return res.json({ products: [], brands: [], categories: [], articles: [] })
  }

  // Returns { products, brands, categories } — each with .hits[]
  const result = await typesenseService.suggest(q.trim())
  return res.json(result)
}

// ─── GET /search/products?q=&page=&limit=&... ─────────────────────────────────
export const searchProductsController = async (req: Request, res: Response) => {
  const { q, page, limit, categoryId, brandId, requiresPrescription, inStock, priceMin, priceMax, ratingMin, sortBy } =
    req.query as Record<string, string>

  const params = {
    q: q || '*',
    page: page ? parseInt(page) : 1,
    limit: limit ? parseInt(limit) : 20,
    categoryId,
    brandId,
    requiresPrescription: requiresPrescription === 'true' ? true : requiresPrescription === 'false' ? false : undefined,
    inStock: inStock === 'true' ? true : undefined,
    priceMin: priceMin ? parseFloat(priceMin) : undefined,
    priceMax: priceMax ? parseFloat(priceMax) : undefined,
    ratingMin: ratingMin ? parseFloat(ratingMin) : undefined,
    sortBy
  }

  const tsResult = await typesenseService.searchProducts(params)

  // Typesense unavailable → fall back to MongoDB (với đầy đủ filters)
  if (!tsResult) {
    const mongoFilter: Record<string, unknown> = { isActive: true }
    if (q && q !== '*') {
      const safeQuery = escapeRegex(q)
      mongoFilter.$or = [{ name: { $regex: safeQuery, $options: 'i' } }, { sku: { $regex: safeQuery, $options: 'i' } }]
    }
    if (categoryId) {
      try {
        mongoFilter.categoryId = new ObjectId(categoryId)
      } catch {}
    }
    if (brandId) {
      try {
        mongoFilter.brandId = new ObjectId(brandId)
      } catch {}
    }
    if (params.requiresPrescription !== undefined) {
      mongoFilter.requiresPrescription = params.requiresPrescription
    }
    if (inStock === 'true') {
      mongoFilter.stockQuantity = { $gt: 0 }
    }
    if (params.priceMin !== undefined || params.priceMax !== undefined) {
      const priceFilter: Record<string, number> = {}
      if (params.priceMin !== undefined) priceFilter.$gte = params.priceMin
      if (params.priceMax !== undefined) priceFilter.$lte = params.priceMax
      mongoFilter['priceVariants.price'] = priceFilter
    }
    if (params.ratingMin !== undefined) {
      mongoFilter.rating = { $gte: params.ratingMin }
    }

    const products = await databaseService.products
      .find(mongoFilter)
      .sort({ rating: -1 })
      .skip(((params.page || 1) - 1) * (params.limit || 20))
      .limit(params.limit || 20)
      .toArray()
    const total = await databaseService.products.countDocuments(mongoFilter)

    return res.json({
      source: 'mongodb_fallback',
      hits: products.map((p) => ({ document: p })),
      found: total,
      page: params.page,
      facet_counts: []
    })
  }

  return res.json({ source: 'typesense', ...tsResult })
}

// ─── GET /search/articles?q=&page=&limit=&categoryId= ────────────────────────
export const searchArticlesController = async (req: Request, res: Response) => {
  const { q, page, limit, categoryId } = req.query as Record<string, string>

  const params = {
    q: q || '*',
    page: page ? parseInt(page) : 1,
    limit: limit ? parseInt(limit) : 10,
    categoryId
  }

  const tsResult = await typesenseService.searchArticles(params)

  if (!tsResult) {
    const filter: Record<string, unknown> = { isPublished: true }
    if (categoryId && ObjectId.isValid(categoryId)) {
      filter.categoryId = new ObjectId(categoryId)
    }
    if (q && q !== '*') {
      const safeQuery = escapeRegex(q)
      const queryRegex = new RegExp(safeQuery, 'i')
      filter.$or = [
        { title: { $regex: safeQuery, $options: 'i' } },
        { excerpt: { $regex: safeQuery, $options: 'i' } },
        { content: { $regex: safeQuery, $options: 'i' } },
        { tags: { $in: [queryRegex] } },
        { healthTopics: { $in: [queryRegex] } },
        { symptoms: { $in: [queryRegex] } },
        { activeIngredients: { $in: [queryRegex] } },
        { targetAudiences: { $in: [queryRegex] } }
      ]
    }
    const articles = await databaseService.articles
      .find(filter)
      .sort({ viewCount: -1 })
      .skip(((params.page || 1) - 1) * (params.limit || 10))
      .limit(params.limit || 10)
      .toArray()
    const total = await databaseService.articles.countDocuments(filter)

    return res.json({
      source: 'mongodb_fallback',
      hits: articles.map((a) => ({ document: a })),
      found: total,
      page: params.page
    })
  }

  return res.json({ source: 'typesense', ...tsResult })
}

// ─── GET /search/status ───────────────────────────────────────────────────────
export const searchStatusController = async (_req: Request, res: Response) => {
  return res.json({
    typesense: typesenseService.getAvailability(),
    message: typesenseService.getAvailability()
      ? 'Typesense is healthy'
      : 'Typesense unavailable, using MongoDB fallback'
  })
}
