import { Request, Response } from 'express'
import { ObjectId } from 'mongodb'
import typesenseService from '~/services/typesense.services'
import databaseService from '~/services/database.services'
import HTTP_STATUS from '~/constants/httpStatus'

// ─── GET /search/suggest?q= ──────────────────────────────────────────────────
export const suggestController = async (req: Request, res: Response) => {
  const q = (req.query.q as string) || ''

  if (!q || q.trim().length < 2) {
    return res.json({ products: [], brands: [], categories: [], querySuggestions: [] })
  }

  // Chạy song song: product/brand/category results + query text completions
  const [result, querySuggestions] = await Promise.all([
    typesenseService.suggest(q.trim()),
    typesenseService.suggestQueries(q.trim())
  ])

  return res.json({ ...result, querySuggestions })
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
      mongoFilter.$or = [{ name: { $regex: q, $options: 'i' } }, { sku: { $regex: q, $options: 'i' } }]
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
    if (q && q !== '*') {
      filter.$or = [{ title: { $regex: q, $options: 'i' } }, { excerpt: { $regex: q, $options: 'i' } }]
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
