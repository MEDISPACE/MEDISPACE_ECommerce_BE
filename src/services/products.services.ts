import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import cacheService from './cache.services'
import recommendationsService from './recommendations.services'
import Product from '~/models/schemas/Product.schema'
import { CreateProductReqBody, UpdateProductReqBody, GetProductsQuery } from '~/models/requests/Product.request'
import { PRODUCTS_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'
import brandsService from './brands.services'
import categoriesService from './categories.services'
import typesenseService from './typesense.services'
import notificationService from './notifications.services'
import { getIO } from '~/sockets/chat.socket'

const LOW_STOCK_THRESHOLD = 30

class ProductsService {
  // Generate slug from name
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove Vietnamese accents
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
  }

  // Generate SKU from name and brand
  private generateSKU(name: string, brandName?: string): string {
    const prefix = brandName ? brandName.substring(0, 3).toUpperCase() : 'MED'
    const productCode = name
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 6)
      .toUpperCase()
    const timestamp = Date.now().toString().slice(-6)
    return `${prefix}-${productCode}-${timestamp}`
  }

  // Check if product exists by name, slug, SKU, or barcode
  async checkProductExists(name: string, slug: string, sku: string, barcode?: string, excludeId?: ObjectId) {
    const query: { $or: Array<{ name?: string; slug?: string; sku?: string; barcode?: string }>; _id?: { $ne: ObjectId } } = {
      $or: [{ name }, { slug }, { sku }]
    }

    if (barcode) {
      query.$or.push({ barcode })
    }

    if (excludeId) {
      query._id = { $ne: excludeId }
    }

    const existingProduct = await databaseService.products.findOne(query)
    if (existingProduct) {
      if (existingProduct.name === name) {
        throw new ErrorWithStatus({
          message: PRODUCTS_MESSAGES.PRODUCT_ALREADY_EXISTS,
          status: HTTP_STATUS.CONFLICT
        })
      }
      if (existingProduct.slug === slug) {
        throw new ErrorWithStatus({
          message: PRODUCTS_MESSAGES.PRODUCT_SLUG_ALREADY_EXISTS,
          status: HTTP_STATUS.CONFLICT
        })
      }
      if (existingProduct.sku === sku) {
        throw new ErrorWithStatus({
          message: PRODUCTS_MESSAGES.SKU_ALREADY_EXISTS,
          status: HTTP_STATUS.CONFLICT
        })
      }
      if (barcode && existingProduct.barcode === barcode) {
        throw new ErrorWithStatus({
          message: PRODUCTS_MESSAGES.BARCODE_ALREADY_EXISTS,
          status: HTTP_STATUS.CONFLICT
        })
      }
    }
  }

  // Validate category exists and is active
  private async validateCategory(categoryId: string) {
    const category = await categoriesService.getCategoryById(categoryId)
    if (!category.isActive) {
      throw new ErrorWithStatus({
        message: PRODUCTS_MESSAGES.CATEGORY_NOT_FOUND,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }
    return category
  }

  // Validate brand exists and is active (if provided)
  private async validateBrand(brandId?: string) {
    if (!brandId) return null

    const brand = await brandsService.getBrandById(brandId)
    if (!brand.isActive) {
      throw new ErrorWithStatus({
        message: PRODUCTS_MESSAGES.BRAND_NOT_FOUND,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }
    return brand
  }

  private parseObjectIdList(value?: string): ObjectId[] {
    return (value || '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => ObjectId.isValid(item))
      .map((item) => new ObjectId(item))
  }

  // Create product
  async createProduct(payload: CreateProductReqBody, createdBy: ObjectId) {
    // Validate category and brand
    await this.validateCategory(payload.categoryId)
    const brand = await this.validateBrand(payload.brandId)

    // Generate slug and SKU if not provided
    const slug = payload.slug || this.generateSlug(payload.name)
    const sku = payload.sku || this.generateSKU(payload.name, brand?.name)

    // Check product exists
    await this.checkProductExists(payload.name, slug, sku, payload.barcode)

    const productId = new ObjectId()
    const product = new Product({
      _id: productId,
      name: payload.name,
      slug,
      sku,
      barcode: payload.barcode,
      shortDescription: payload.shortDescription,
      categoryId: new ObjectId(payload.categoryId),
      brandId: payload.brandId ? new ObjectId(payload.brandId) : undefined,
      priceVariants: payload.priceVariants || [{ unit: 'Sản phẩm', price: 0, isDefault: true, quantityPerUnit: 1 }],
      stockQuantity: payload.stockQuantity || 0,
      maxOrderQuantity: payload.maxOrderQuantity || 10,
      status: payload.status || 'active',
      isActive: payload.isActive !== undefined ? payload.isActive : true,
      requiresPrescription: payload.requiresPrescription || false,
      featuredImage: payload.featuredImage,
      createdBy,
      lastModifiedBy: createdBy
    })

    await databaseService.products.insertOne(product)

    // Sync to Typesense — fetch full product with details join để có activeIngredients, dosageForm, etc.
    this.getProductById(productId.toString())
      .then((full) => typesenseService.indexProduct(full))
      .catch(() => {})

    // Update category product count
    await categoriesService.updateProductCount(new ObjectId(payload.categoryId), 1)

    // Update brand product count if brand exists
    if (payload.brandId) {
      await brandsService.updateProductCount(new ObjectId(payload.brandId), 1)
    }

    return product
  }

  /**
   * Invalidate all product-related caches.
   * Called after product CRUD operations.
   */
  private async invalidateProductCache(slug?: string): Promise<void> {
    const patterns = ['products:*', 'pharmacist:drug-database:*']
    if (slug) patterns.push(`products:slug:${slug}`)
    await cacheService.invalidate(...patterns)
    void recommendationsService.notifyCatalogChanged()
  }

  // Get products with pagination and filters
  async getProducts(query: GetProductsQuery) {
    const page = parseInt(query.page || '1')
    const limit = parseInt(query.limit || '20') // Default 20 for pagination
    const skip = (page - 1) * limit

    const startTime = Date.now()

    // ─── TYPESENSE SEARCH DELEGATION ──────────────────────────────────────────
    if (query.search && query.bypassTypesense !== 'true' && typesenseService.getAvailability()) {
      try {
        let categoryIds: string[] | undefined
        if (query.categoryId) {
          try {
            let targetCategory
            if (ObjectId.isValid(query.categoryId)) {
              targetCategory = await categoriesService.getCategoryById(query.categoryId)
            } else {
              targetCategory = await categoriesService.getCategoryBySlug(query.categoryId)
            }
            if (targetCategory) {
              let categoryPath = targetCategory.path
              if (!categoryPath.startsWith('/')) {
                categoryPath = '/' + categoryPath
              }
              if (categoryPath === '/') {
                categoryPath = `/${targetCategory.slug}`
              } else if (!categoryPath.endsWith(`/${targetCategory.slug}`)) {
                categoryPath = `${categoryPath}/${targetCategory.slug}`
              }
              const escapedPath = categoryPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              const descendantCategories = await databaseService.categories
                .find({
                  $or: [
                    { _id: targetCategory._id },
                    { path: { $regex: `^${escapedPath}(?:/|$)` } }
                  ]
                })
                .toArray()
              categoryIds = descendantCategories.map((cat) => cat._id.toString())
            }
          } catch (error) {
            console.error('[Typesense Delegation] Error mapping category:', error)
          }
        }

        let tsSortBy: string | undefined
        if (query.sortBy === 'price') {
          tsSortBy = query.sortOrder === 'desc' ? 'price_desc' : 'price_asc'
        } else if (query.sortBy === 'createdAt') {
          tsSortBy = 'newest'
        } else if (query.sortBy === 'rating') {
          tsSortBy = 'rating'
        }

        const tsResult = await typesenseService.searchProducts({
          q: query.search,
          page,
          limit,
          categoryId: query.categoryId,
          categoryIds,
          brandId: query.brandId,
          brandIds: this.parseObjectIdList(query.brandIds).map((id) => id.toString()),
          requiresPrescription: query.requiresPrescription === 'true' ? true : query.requiresPrescription === 'false' ? false : undefined,
          inStock: query.inStock === 'true',
          priceMin: query.minPrice ? parseFloat(query.minPrice) : undefined,
          priceMax: query.maxPrice ? parseFloat(query.maxPrice) : undefined,
          ratingMin: query.ratingMin ? parseFloat(query.ratingMin) : undefined,
          sortBy: tsSortBy
        })

        if (tsResult && tsResult.hits && tsResult.hits.length > 0) {
          const mongoIds = tsResult.hits.map((hit: any) => new ObjectId(hit.document.mongoId))
          const products = await databaseService.products
            .aggregate([
              { $match: { _id: { $in: mongoIds } } },
              {
                $lookup: {
                  from: 'categories',
                  localField: 'categoryId',
                  foreignField: '_id',
                  as: 'category',
                  pipeline: [{ $project: { _id: 1, name: 1, slug: 1 } }]
                }
              },
              {
                $lookup: {
                  from: 'brands',
                  localField: 'brandId',
                  foreignField: '_id',
                  as: 'brand',
                  pipeline: [{ $project: { _id: 1, name: 1, slug: 1, logo: 1 } }]
                }
              },
              {
                $addFields: {
                  category: { $arrayElemAt: ['$category', 0] },
                  brand: { $arrayElemAt: ['$brand', 0] }
                }
              },
              {
                $project: {
                  _id: 1,
                  name: 1,
                  slug: 1,
                  sku: 1,
                  shortDescription: 1,
                  categoryId: 1,
                  brandId: 1,
                  priceVariants: 1,
                  stockQuantity: 1,
                  status: 1,
                  isActive: 1,
                  requiresPrescription: 1,
                  featuredImage: 1,
                  images: 1,
                  rating: 1,
                  reviewCount: 1,
                  createdAt: 1,
                  category: 1,
                  brand: 1,
                  packaging: 1
                }
              }
            ])
            .toArray()

          // Maintain Typesense ordering
          const productsMap = new Map(products.map((p) => [p._id.toString(), p]))
          const sortedProducts = tsResult.hits
            .map((hit: any) => productsMap.get(hit.document.mongoId))
            .filter(Boolean)

          console.log(`[Typesense Delegation] Search for "${query.search}" returned ${tsResult.found} documents (Page ${page}).`)

          return {
            products: sortedProducts,
            pagination: {
              page,
              limit,
              totalPages: Math.ceil(tsResult.found / limit),
              totalCount: tsResult.found
            }
          }
        } else if (tsResult && tsResult.hits && tsResult.hits.length === 0) {
          // If Typesense explicitly returned 0 results, return empty product list
          console.log(`[Typesense Delegation] Search for "${query.search}" returned 0 documents.`)
          return {
            products: [],
            pagination: {
              page,
              limit,
              totalPages: 0,
              totalCount: 0
            }
          }
        }
      } catch (error) {
        console.error('[Typesense Delegation] Failed, falling back to MongoDB search:', error)
      }
    }
    // ─── END TYPESENSE SEARCH DELEGATION ──────────────────────────────────────

    // Build filter
    const filter: Record<string, unknown> = {}

    if (query.categoryId) {
      try {
        // Find the target category and all its descendants
        let targetCategory
        if (ObjectId.isValid(query.categoryId)) {
          targetCategory = await categoriesService.getCategoryById(query.categoryId)
        } else {
          targetCategory = await categoriesService.getCategoryBySlug(query.categoryId)
        }

        // Category path should be used directly - path already represents the full hierarchy
        // For parent category with path '/thuc-pham-chuc-nang', we want to find:
        // - Categories with path STARTING with '/thuc-pham-chuc-nang' (subcategories)
        // - Or the parent category itself (by _id)
        let categoryPath = targetCategory.path
        if (!categoryPath.startsWith('/')) {
          categoryPath = '/' + categoryPath
        }
        if (categoryPath === '/') {
          categoryPath = `/${targetCategory.slug}`
        } else if (!categoryPath.endsWith(`/${targetCategory.slug}`)) {
          categoryPath = `${categoryPath}/${targetCategory.slug}`
        }

        // Escape special regex characters in the path
        const escapedPath = categoryPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

        // Find all categories whose path starts with this category's path
        const descendantCategories = await databaseService.categories
          .find({
            $or: [
              { _id: targetCategory._id }, // Include the category itself
              { path: { $regex: `^${escapedPath}(?:/|$)` } } // All descendants include this category in their ancestor path
            ]
          })
          .toArray()

        const categoryIds = descendantCategories.map((cat) => cat._id)

        // Filter products that belong to any of these categories
        filter.categoryId = { $in: categoryIds }
      } catch (error) {
        console.error('Error finding category:', error)
        // If category not found, return empty result (no products)
        filter.categoryId = null
      }
    }

    const brandIds = this.parseObjectIdList(query.brandIds)
    if (brandIds.length > 0) {
      filter.brandId = { $in: brandIds }
    } else if (query.brandId) {
      filter.brandId = new ObjectId(query.brandId)
    }

    if (query.status) {
      filter.status = query.status
    }

    if (query.isActive !== undefined) {
      filter.isActive = query.isActive === 'true'
    }

    if (query.requiresPrescription !== undefined) {
      filter.requiresPrescription = query.requiresPrescription === 'true'
    } else if (query.minPrice || query.maxPrice || query.sortBy === 'price') {
      filter.requiresPrescription = false
    }

    if (query.ratingMin) {
      filter.rating = { $gte: parseFloat(query.ratingMin) }
    }

    if (query.inStock === 'true') {
      if (!query.status) filter.status = 'active'
      filter.stockQuantity = { ...(filter.stockQuantity as Record<string, number>), $gt: 0 }
    }

    if (query.minPrice || query.maxPrice) {
      const priceFilter: Record<string, number> = {}
      if (query.minPrice) priceFilter.$gte = parseFloat(query.minPrice)
      if (query.maxPrice) priceFilter.$lte = parseFloat(query.maxPrice)
      filter['priceVariants.price'] = priceFilter
    }

    if (query.ratingMin) {
      filter.rating = { $gte: parseFloat(query.ratingMin) }
    }

    // Enhanced search - will be applied in aggregation pipeline for category/brand
    // Sanitize search query to prevent regex injection (ReDoS)
    const searchQuery = query.search
      ? query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      : undefined

    // Handle inStock filter: map to stockQuantity > 0
    if (query.inStock === 'true') {
      if (!query.status) filter.status = 'active'
      filter.stockQuantity = { ...(filter.stockQuantity as Record<string, number> || {}), $gt: 0 }
    }

    if (query.minStock || query.maxStock) {
      const stockFilter: Record<string, number> = { ...(filter.stockQuantity as Record<string, number> || {}) }
      if (query.minStock) {
        stockFilter.$gte = parseInt(query.minStock)
      }
      if (query.maxStock) {
        stockFilter.$lte = parseInt(query.maxStock)
      }
      filter.stockQuantity = stockFilter
    }

    // Build sort — handle 'price' specially since Product uses priceVariants[] not a flat price field
    const rawSortBy = query.sortBy || 'createdAt'
    const sortOrder = query.sortOrder === 'desc' ? -1 : 1
    // If sorting by 'price', we sort on computed 'calculatedPrice' field (added via $addFields)
    const sortField = rawSortBy === 'price' ? 'calculatedPrice' : rawSortBy
    const sort: Record<string, 1 | -1> = { [sortField]: sortOrder }

    // Optimize query - always use efficient aggregation with minimal fields

    // Get products with pagination - optimized with only needed fields
    const [products, totalCount] = await Promise.all([
      databaseService.products
        .aggregate([
          { $match: filter },
          {
            $lookup: {
              from: 'categories',
              localField: 'categoryId',
              foreignField: '_id',
              as: 'category',
              pipeline: [
                { $project: { _id: 1, name: 1, slug: 1 } } // Only needed fields
              ]
            }
          },
          {
            $lookup: {
              from: 'brands',
              localField: 'brandId',
              foreignField: '_id',
              as: 'brand',
              pipeline: [
                { $project: { _id: 1, name: 1, slug: 1, logo: 1 } } // Only needed fields
              ]
            }
          },
          {
            $addFields: {
              category: { $arrayElemAt: ['$category', 0] },
              brand: { $arrayElemAt: ['$brand', 0] },
              // Compute price from default priceVariant (isDefault=true) or first variant for sorting
              calculatedPrice: {
                $let: {
                  vars: {
                    defaultVariant: {
                      $ifNull: [
                        { $arrayElemAt: [{ $filter: { input: { $ifNull: ['$priceVariants', []] }, cond: { $eq: ['$$this.isDefault', true] } } }, 0] },
                        { $arrayElemAt: [{ $ifNull: ['$priceVariants', []] }, 0] }
                      ]
                    }
                  },
                  in: { $ifNull: ['$$defaultVariant.price', 0] }
                }
              }
            }
          },
          // Price range filter
          ...(query.minPrice || query.maxPrice
            ? [
                {
                  $match: {
                    calculatedPrice: {
                      ...(query.minPrice ? { $gte: parseFloat(query.minPrice) } : {}),
                      ...(query.maxPrice ? { $lte: parseFloat(query.maxPrice) } : {})
                    }
                  }
                }
              ]
            : []),
          // Enhanced search filter after lookup
          ...(searchQuery
            ? [
                {
                  $match: {
                    $or: [
                      { name: { $regex: searchQuery, $options: 'i' } },
                      { shortDescription: { $regex: searchQuery, $options: 'i' } },
                      { longDescription: { $regex: searchQuery, $options: 'i' } },
                      { sku: { $regex: searchQuery, $options: 'i' } },
                      { ingredients: { $regex: searchQuery, $options: 'i' } },
                      { 'category.name': { $regex: searchQuery, $options: 'i' } },
                      { 'brand.name': { $regex: searchQuery, $options: 'i' } }
                    ]
                  }
                }
              ]
            : []),
          {
            $project: {
              // Only select fields needed for product listing
              _id: 1,
              name: 1,
              slug: 1,
              sku: 1,
              shortDescription: 1,
              categoryId: 1,
              brandId: 1,
              priceVariants: 1,
              stockQuantity: 1,
              status: 1,
              isActive: 1,
              requiresPrescription: 1,
              featuredImage: 1,
              images: 1,
              rating: 1,
              reviewCount: 1,
              createdAt: 1,
              category: 1,
              brand: 1,
              packaging: 1
            }
          },
          { $sort: sort },
          { $skip: skip },
          { $limit: limit }
        ])
        .toArray(),
      // Count with search/price filters
      (searchQuery || query.minPrice || query.maxPrice)
        ? databaseService.products
            .aggregate([
              { $match: filter },
              // Compute calculatedPrice if price filters are applied
              ...(query.minPrice || query.maxPrice
                ? [
                    {
                      $addFields: {
                        calculatedPrice: {
                          $let: {
                            vars: {
                              defaultVariant: {
                                $ifNull: [
                                  { $arrayElemAt: [{ $filter: { input: { $ifNull: ['$priceVariants', []] }, cond: { $eq: ['$$this.isDefault', true] } } }, 0] },
                                  { $arrayElemAt: [{ $ifNull: ['$priceVariants', []] }, 0] }
                                ]
                              }
                            },
                            in: { $ifNull: ['$$defaultVariant.price', 0] }
                          }
                        }
                      }
                    },
                    {
                      $match: {
                        calculatedPrice: {
                          ...(query.minPrice ? { $gte: parseFloat(query.minPrice) } : {}),
                          ...(query.maxPrice ? { $lte: parseFloat(query.maxPrice) } : {})
                        }
                      }
                    }
                  ]
                : []),
              // Perform lookups only if searchQuery is present
              ...(searchQuery
                ? [
                    {
                      $lookup: {
                        from: 'categories',
                        localField: 'categoryId',
                        foreignField: '_id',
                        as: 'category',
                        pipeline: [{ $project: { name: 1 } }]
                      }
                    },
                    {
                      $lookup: {
                        from: 'brands',
                        localField: 'brandId',
                        foreignField: '_id',
                        as: 'brand',
                        pipeline: [{ $project: { name: 1 } }]
                      }
                    },
                    {
                      $addFields: {
                        category: { $arrayElemAt: ['$category', 0] },
                        brand: { $arrayElemAt: ['$brand', 0] }
                      }
                    },
                    {
                      $match: {
                        $or: [
                          { name: { $regex: searchQuery, $options: 'i' } },
                          { shortDescription: { $regex: searchQuery, $options: 'i' } },
                          { longDescription: { $regex: searchQuery, $options: 'i' } },
                          { sku: { $regex: searchQuery, $options: 'i' } },
                          { ingredients: { $regex: searchQuery, $options: 'i' } },
                          { 'category.name': { $regex: searchQuery, $options: 'i' } },
                          { 'brand.name': { $regex: searchQuery, $options: 'i' } }
                        ]
                      }
                    }
                  ]
                : []),
              { $count: 'total' }
            ])
            .toArray()
            .then((result) => result[0]?.total || 0)
        : databaseService.products.countDocuments(filter)
    ])

    const endTime = Date.now()

    return {
      products,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        totalCount
      }
    }
  }

  // Get product by ID with populated data
  async getProductById(productId: string) {
    const products = await databaseService.products
      .aggregate([
        { $match: { _id: new ObjectId(productId) } },
        {
          $lookup: {
            from: 'categories',
            localField: 'categoryId',
            foreignField: '_id',
            as: 'category'
          }
        },
        {
          $lookup: {
            from: 'brands',
            localField: 'brandId',
            foreignField: '_id',
            as: 'brand'
          }
        },
        {
          $lookup: {
            from: 'productDetails',
            localField: '_id',
            foreignField: 'productId',
            as: 'details'
          }
        },
        {
          $lookup: {
            from: 'productMedia',
            localField: '_id',
            foreignField: 'productId',
            as: 'media'
          }
        },
        {
          $addFields: {
            category: { $arrayElemAt: ['$category', 0] },
            brand: { $arrayElemAt: ['$brand', 0] },
            details: { $arrayElemAt: ['$details', 0] },
            media: { $arrayElemAt: ['$media', 0] }
          }
        }
      ])
      .toArray()

    if (!products.length) {
      throw new ErrorWithStatus({
        message: PRODUCTS_MESSAGES.PRODUCT_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    return { ...products[0], campaign: null }
  }

  // Get product by slug with populated category and brand data
  // ✅ CACHED: Product detail by slug (expensive 4-way $lookup)
  async getProductBySlug(slug: string) {
    return cacheService.getOrSet(`products:slug:${slug}`, async () => {
      const products = await databaseService.products
        .aggregate([
          { $match: { slug } },
          {
            $lookup: {
              from: 'categories',
              localField: 'categoryId',
              foreignField: '_id',
              as: 'category'
            }
          },
          {
            $lookup: {
              from: 'brands',
              localField: 'brandId',
              foreignField: '_id',
              as: 'brand'
            }
          },
          {
            $lookup: {
              from: 'productDetails',
              localField: '_id',
              foreignField: 'productId',
              as: 'details'
            }
          },
          {
            $lookup: {
              from: 'productMedia',
              localField: '_id',
              foreignField: 'productId',
              as: 'media'
            }
          },
          {
            $addFields: {
              category: { $arrayElemAt: ['$category', 0] },
              brand: { $arrayElemAt: ['$brand', 0] },
              details: { $arrayElemAt: ['$details', 0] },
              media: { $arrayElemAt: ['$media', 0] }
            }
          }
        ])
        .toArray()

      if (!products.length) {
        throw new ErrorWithStatus({
          message: PRODUCTS_MESSAGES.PRODUCT_NOT_FOUND,
          status: HTTP_STATUS.NOT_FOUND
        })
      }

      return { ...products[0], campaign: null }
    }, 120) // 2 minutes
  }

  // Update product
  async updateProduct(productId: string, payload: UpdateProductReqBody, lastModifiedBy: ObjectId) {
    const product = await this.getProductById(productId)

    // Validate new category and brand if changed
    if (payload.categoryId && payload.categoryId !== product.categoryId.toString()) {
      await this.validateCategory(payload.categoryId)
    }

    if (payload.brandId && payload.brandId !== product.brandId?.toString()) {
      await this.validateBrand(payload.brandId)
    }

    // Check name, slug, SKU, barcode uniqueness if changed
    if (payload.name || payload.slug || payload.sku || payload.barcode) {
      const newName = payload.name || product.name
      const newSlug = payload.slug || (payload.name ? this.generateSlug(payload.name) : product.slug)
      const newSKU = payload.sku || product.sku
      const newBarcode = payload.barcode || product.barcode
      await this.checkProductExists(newName, newSlug, newSKU, newBarcode, new ObjectId(productId))
    }

    const updateData: Record<string, unknown> = {
      ...payload,
      updatedAt: new Date(),
      lastModifiedBy
    }

    // Remove details from product updateData — details go to productDetails collection
    delete updateData.details

    // Generate new slug if name changed and slug not provided
    if (payload.name && !payload.slug) {
      updateData.slug = this.generateSlug(payload.name)
    }

    // Convert string IDs to ObjectIds
    if (payload.categoryId) {
      updateData.categoryId = new ObjectId(payload.categoryId)
    }
    if (payload.brandId) {
      updateData.brandId = new ObjectId(payload.brandId)
    }

    await databaseService.products.updateOne({ _id: new ObjectId(productId) }, { $set: updateData })

    // Upsert productDetails if details provided in payload
    if (payload.details && Object.keys(payload.details).length > 0) {
      await databaseService.productDetails.updateOne(
        { productId: new ObjectId(productId) },
        {
          $set: {
            ...payload.details,
            productId: new ObjectId(productId),
            updatedAt: new Date()
          },
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
      )
    }

    // Update product counts if category or brand changed
    if (payload.categoryId && payload.categoryId !== product.categoryId.toString()) {
      // Decrease old category count
      await categoriesService.updateProductCount(product.categoryId, -1)
      // Increase new category count
      await categoriesService.updateProductCount(new ObjectId(payload.categoryId), 1)
    }

    if (payload.brandId && payload.brandId !== product.brandId?.toString()) {
      // Decrease old brand count if exists
      if (product.brandId) {
        await brandsService.updateProductCount(product.brandId, -1)
      }
      // Increase new brand count
      await brandsService.updateProductCount(new ObjectId(payload.brandId), 1)
    }

    // Fetch full product with details join — ensures Typesense gets activeIngredients, dosageForm, etc.
    const updated = await this.getProductById(productId)

    // Sync to Typesense (fire-and-forget)
    typesenseService.indexProduct(updated).catch(() => {})

    // Invalidate cache
    this.invalidateProductCache(product.slug).catch(() => {})

    return updated
  }

  // Toggle product status
  async toggleProductStatus(productId: string, isActive: boolean, lastModifiedBy: ObjectId) {
    await this.getProductById(productId) // Check exists

    await databaseService.products.updateOne(
      { _id: new ObjectId(productId) },
      {
        $set: {
          isActive,
          updatedAt: new Date(),
          lastModifiedBy
        }
      }
    )

    const updated = await this.getProductById(productId)

    // Sync to Typesense (fire-and-forget)
    typesenseService.indexProduct(updated).catch(() => {})

    // Invalidate cache (fire-and-forget)
    this.invalidateProductCache().catch(() => {})

    return updated
  }

  // Update stock quantity
  async updateStock(productId: string, quantity: number, lastModifiedBy: ObjectId) {
    const product = await this.getProductById(productId) // Check product exists

    if (quantity < 0) {
      throw new ErrorWithStatus({
        message: PRODUCTS_MESSAGES.STOCK_QUANTITY_INVALID,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    await databaseService.products.updateOne(
      { _id: new ObjectId(productId) },
      {
        $set: {
          stockQuantity: quantity,
          status:
            product.status === 'discontinued' || product.status === 'out_of_stock'
              ? product.status
              : quantity === 0
                ? 'out_of_stock'
                : 'active',
          updatedAt: new Date(),
          lastModifiedBy
        }
      }
    )

    const updated = await this.getProductById(productId)

    // Sync to Typesense (fire-and-forget) — cập nhật inStock & stockQuantity
    typesenseService.indexProduct(updated).catch(() => {})

    // Low-stock alert: cảnh báo admin nếu tồn kho sau khi cập nhật ≤ 30 (fire-and-forget)
    if (quantity <= LOW_STOCK_THRESHOLD) {
      try {
        const io = getIO()
        notificationService.notifyLowStock(
          new ObjectId(productId),
          (updated as unknown as { name: string }).name,
          quantity,
          io
        ).catch(() => {})
      } catch { /* socket not ready */ }
    }

    this.invalidateProductCache(updated.slug).catch(() => {})

    return updated
  }

  // Delete product
  async deleteProduct(productId: string) {
    const product = await this.getProductById(productId)

    await databaseService.products.deleteOne({ _id: new ObjectId(productId) })

    // Remove from Typesense (fire-and-forget) — tránh ghost product
    typesenseService.removeProduct(productId).catch(() => {})

    // Update category product count
    await categoriesService.updateProductCount(product.categoryId, -1)

    // Update brand product count if exists
    if (product.brandId) {
      await brandsService.updateProductCount(product.brandId, -1)
    }

    // Invalidate cache
    await this.invalidateProductCache(product.slug)

    return { message: PRODUCTS_MESSAGES.DELETE_PRODUCT_SUCCESS }
  }
}

const productsService = new ProductsService()
export default productsService
