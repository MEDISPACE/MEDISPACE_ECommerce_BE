import { Request, Response } from 'express'
import { ObjectId } from 'mongodb'
import typesenseService from '~/services/typesense.services'
import databaseService from '~/services/database.services'

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const parseIdList = (value: unknown): string[] => {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  return values.map((item) => String(item).trim()).filter((item) => item && ObjectId.isValid(item))
}

const firstQueryValue = (value: unknown): string | undefined => {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined
  return typeof value === 'string' ? value : undefined
}

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
    status: product.status || 'active',
    inStock: (product.status || 'active') === 'active' && (product.inStock ?? (product.stockQuantity || 0) > 0),
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
  const { q, page, limit, categoryId, brandId, brandIds, requiresPrescription, inStock, priceMin, priceMax, minPrice, maxPrice, ratingMin, sortBy, includeSubcategories } =
    req.query as Record<string, string | string[]>
  const qValue = firstQueryValue(q)
  const pageValue = firstQueryValue(page)
  const limitValue = firstQueryValue(limit)
  const categoryIdValue = firstQueryValue(categoryId)
  const brandIdValue = firstQueryValue(brandId)
  const requiresPrescriptionValue = firstQueryValue(requiresPrescription)
  const inStockValue = firstQueryValue(inStock)
  const effectivePriceMin = firstQueryValue(priceMin) ?? firstQueryValue(minPrice)
  const effectivePriceMax = firstQueryValue(priceMax) ?? firstQueryValue(maxPrice)
  const ratingMinValue = firstQueryValue(ratingMin)
  const sortByValue = firstQueryValue(sortBy)
  const shouldIncludeSubcategories = firstQueryValue(includeSubcategories) !== 'false'
  const selectedBrandIds = parseIdList(brandIds)

  let categoryIds: string[] | undefined
  if (shouldIncludeSubcategories && categoryIdValue && ObjectId.isValid(categoryIdValue)) {
    const category = await databaseService.categories.findOne({ _id: new ObjectId(categoryIdValue) })
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
    q: qValue || '*',
    page: Math.max(1, parseInt(pageValue || '1') || 1),
    limit: Math.min(100, Math.max(1, parseInt(limitValue || '20') || 20)),
    categoryId: categoryIdValue,
    categoryIds,
    brandId: brandIdValue,
    brandIds: selectedBrandIds,
    requiresPrescription: requiresPrescriptionValue === 'true' ? true : requiresPrescriptionValue === 'false' ? false : undefined,
    inStock: inStockValue === 'true' ? true : undefined,
    priceMin: effectivePriceMin ? parseFloat(effectivePriceMin) : undefined,
    priceMax: effectivePriceMax ? parseFloat(effectivePriceMax) : undefined,
    ratingMin: ratingMinValue ? parseFloat(ratingMinValue) : undefined,
    sortBy: sortByValue
  }

  const tsResult = await typesenseService.searchProducts(params)

  // Typesense unavailable → fall back to MongoDB (với đầy đủ filters)
  if (!tsResult) {
    const mongoFilter: Record<string, unknown> = { isActive: true }
    if (qValue && qValue !== '*') {
      const safeQuery = escapeRegex(qValue)
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
    } else if (categoryIdValue && ObjectId.isValid(categoryIdValue)) {
      mongoFilter.categoryId = new ObjectId(categoryIdValue)
    }
    if (selectedBrandIds.length > 0) {
      mongoFilter.brandId = { $in: selectedBrandIds.map((id) => new ObjectId(id)) }
    } else if (brandIdValue) {
      try {
        mongoFilter.brandId = new ObjectId(brandIdValue)
      } catch {
        // Ignore invalid brand id in fallback mode.
      }
    }
    if (params.requiresPrescription !== undefined) {
      mongoFilter.requiresPrescription = params.requiresPrescription
    } else if (params.priceMin !== undefined || params.priceMax !== undefined || sortByValue === 'price_asc' || sortByValue === 'price_desc') {
      mongoFilter.requiresPrescription = false
    }
    if (inStockValue === 'true') {
      mongoFilter.status = 'active'
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
  if (mismatchedCollections.length > 0) {
    await typesenseService.requestReconciliation(`count mismatch: ${mismatchedCollections.join(', ')}`)
  }

  return res.json({
    typesense: typesenseService.getAvailability(),
    consistency: { ...consistency, consistent: consistency.healthy === true && consistency.dirty !== true && mismatchedCollections.length === 0, mismatchedCollections },
    mongoCounts: mongoCountMap,
    message: typesenseService.getAvailability()
      ? 'Typesense is healthy'
      : 'Typesense unavailable, using MongoDB fallback'
  })
}
