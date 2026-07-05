import { Request, Response } from 'express'
import { ObjectId } from 'mongodb'
import typesenseService from '~/services/typesense.services'
import databaseService from '~/services/database.services'

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function toSearchProductDocument(product: any) {
  const defaultVariant = product.priceVariants?.find((variant: any) => variant.isDefault) || product.priceVariants?.[0]
  const mongoId = product._id?.toString?.() || product.mongoId || ''

  return {
    ...product,
    id: mongoId,
    mongoId,
    categoryId: product.categoryId?.toString?.() || product.categoryId || '',
    categoryName: product.category?.name || product.categoryName || '',
    brandId: product.brandId?.toString?.() || product.brandId || '',
    brandName: product.brand?.name || product.brandName || '',
    price: product.price ?? defaultVariant?.price ?? 0,
    inStock: product.inStock ?? (product.stockQuantity || 0) > 0,
    activeIngredients: product.details?.activeIngredients || product.activeIngredients || '',
    indications: product.details?.indications || product.indications || ''
  }
}

// ─── GET /search/suggest?q= ──────────────────────────────────────────────────
export const suggestController = async (req: Request, res: Response) => {
  const q = (req.query.q as string) || ''

  if (!q || q.trim().length < 2) {
    return res.json({ products: [], brands: [], categories: [], articles: [], querySuggestions: [] })
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
  console.log('[SearchController] searchProductsController called with query:', req.query)
  const { q, page, limit, categoryId, brandId, requiresPrescription, inStock, priceMin, priceMax, minPrice, maxPrice, ratingMin, sortBy } =
    req.query as Record<string, string>
  const effectivePriceMin = priceMin ?? minPrice
  const effectivePriceMax = priceMax ?? maxPrice

  let categoryIds: string[] | undefined
  if (categoryId && ObjectId.isValid(categoryId)) {
    const category = await databaseService.categories.findOne({ _id: new ObjectId(categoryId) })
    if (category) {
      let fullPath = category.path
      if (!fullPath.startsWith('/')) {
        fullPath = '/' + fullPath
      }
      if (fullPath === '/') {
        fullPath = `/${category.slug}`
      } else if (!fullPath.endsWith(`/${category.slug}`)) {
        fullPath = `${fullPath}/${category.slug}`
      }
      const escapedPath = escapeRegex(fullPath)
      categoryIds = (
        await databaseService.categories
          .find({ $or: [{ _id: category._id }, { path: { $regex: `^${escapedPath}(?:/|$)` } }] }, { projection: { _id: 1 } })
          .toArray()
      ).map((item) => item._id.toString())
    }
  }

  const params = {
    q: q || '*',
    page: Math.max(1, parseInt(page) || 1),
    limit: Math.min(100, Math.max(1, parseInt(limit) || 20)),
    categoryId,
    categoryIds,
    brandId,
    requiresPrescription: requiresPrescription === 'true' ? true : requiresPrescription === 'false' ? false : undefined,
    inStock: inStock === 'true' ? true : undefined,
    priceMin: effectivePriceMin ? parseFloat(effectivePriceMin) : undefined,
    priceMax: effectivePriceMax ? parseFloat(effectivePriceMax) : undefined,
    ratingMin: ratingMin ? parseFloat(ratingMin) : undefined,
    sortBy
  }

  const tsResult = await typesenseService.searchProducts(params)

  // Typesense unavailable → fall back to MongoDB (với đầy đủ filters)
  if (!tsResult) {
    const mongoFilter: Record<string, unknown> = { isActive: true }
    if (q && q !== '*') {
      const safeQuery = escapeRegex(q)
      const detailProductIds = await databaseService.productDetails
        .find(
          {
            $or: [
              { activeIngredients: { $regex: safeQuery, $options: 'i' } },
              { indications: { $regex: safeQuery, $options: 'i' } },
              { manufacturer: { $regex: safeQuery, $options: 'i' } }
            ]
          },
          { projection: { productId: 1 } }
        )
        .limit(500)
        .toArray()
      mongoFilter.$or = [
        { name: { $regex: safeQuery, $options: 'i' } },
        { sku: { $regex: safeQuery, $options: 'i' } },
        { shortDescription: { $regex: safeQuery, $options: 'i' } },
        { _id: { $in: detailProductIds.map((detail) => detail.productId) } }
      ]
    }
    if (categoryIds?.length) {
      mongoFilter.categoryId = { $in: categoryIds.map((id) => new ObjectId(id)) }
    } else if (categoryId && ObjectId.isValid(categoryId)) {
      mongoFilter.categoryId = new ObjectId(categoryId)
    }
    if (brandId) {
      try {
        mongoFilter.brandId = new ObjectId(brandId)
      } catch {
        // Ignore invalid brand id in fallback mode.
      }
    }
    if (params.requiresPrescription !== undefined) {
      mongoFilter.requiresPrescription = params.requiresPrescription
    } else if (params.priceMin !== undefined || params.priceMax !== undefined || sortBy === 'price_asc' || sortBy === 'price_desc') {
      mongoFilter.requiresPrescription = false
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
      .aggregate([
        { $match: mongoFilter },
        {
          $lookup: {
            from: process.env.DB_CATEGORIES_COLLECTION || 'categories',
            localField: 'categoryId',
            foreignField: '_id',
            as: 'category',
            pipeline: [{ $project: { _id: 1, name: 1, slug: 1 } }]
          }
        },
        {
          $lookup: {
            from: process.env.DB_BRANDS_COLLECTION || 'brands',
            localField: 'brandId',
            foreignField: '_id',
            as: 'brand',
            pipeline: [{ $project: { _id: 1, name: 1, slug: 1, logo: 1 } }]
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
        },
        { $sort: { rating: -1 } },
        { $skip: ((params.page || 1) - 1) * (params.limit || 20) },
        { $limit: params.limit || 20 }
      ])
      .toArray()
    const total = await databaseService.products.countDocuments(mongoFilter)

    return res.json({
      source: 'mongodb_fallback',
      hits: products.map((p) => ({ document: toSearchProductDocument(p) })),
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
  const [consistency, mongoCounts] = await Promise.all([
    typesenseService.getConsistencyStatus(),
    Promise.all([
      databaseService.products.countDocuments({}),
      databaseService.articles.countDocuments({}),
      databaseService.brands.countDocuments({}),
      databaseService.categories.countDocuments({})
    ])
  ])
  const mongoCountMap = { products: mongoCounts[0], articles: mongoCounts[1], brands: mongoCounts[2], categories: mongoCounts[3] }
  const typesenseCounts = (consistency.counts || {}) as Record<string, number>
  const mismatchedCollections = Object.entries(mongoCountMap)
    .filter(([name, count]) => typesenseCounts[name] !== undefined && typesenseCounts[name] !== count)
    .map(([name]) => name)

  return res.json({
    typesense: typesenseService.getAvailability(),
    consistency: { ...consistency, consistent: consistency.healthy === true && consistency.dirty !== true && mismatchedCollections.length === 0, mismatchedCollections },
    mongoCounts: mongoCountMap,
    message: typesenseService.getAvailability()
      ? 'Typesense is healthy'
      : 'Typesense unavailable, using MongoDB fallback'
  })
}
