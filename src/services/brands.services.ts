import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import cacheService from './cache.services'
import typesenseService from './typesense.services'
import Brand from '~/models/schemas/Brand.schema'
import { CreateBrandReqBody, UpdateBrandReqBody, GetBrandsQuery } from '~/models/requests/Product.request'
import { BRANDS_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'

const BRAND_TTL = 600 // 10 minutes

class BrandsService {
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

  // Check if brand exists by name or slug
  async checkBrandExists(name: string, slug: string, excludeId?: ObjectId) {
    const query: { $or: Array<{ name?: string; slug?: string }>; _id?: { $ne: ObjectId } } = {
      $or: [{ name }, { slug }]
    }
    if (excludeId) {
      query._id = { $ne: excludeId }
    }

    const existingBrand = await databaseService.brands.findOne(query)
    if (existingBrand) {
      throw new ErrorWithStatus({
        message: BRANDS_MESSAGES.BRAND_ALREADY_EXISTS,
        status: HTTP_STATUS.CONFLICT
      })
    }
  }

  // Create brand
  async createBrand(payload: CreateBrandReqBody) {
    const slug = payload.slug || this.generateSlug(payload.name)

    // Check brand exists
    await this.checkBrandExists(payload.name, slug)

    const brandId = new ObjectId()
    const brand = new Brand({
      _id: brandId,
      name: payload.name,
      slug,
      logo: payload.logo,
      description: payload.description,
      website: payload.website,
      country: payload.country,
      isActive: payload.isActive !== undefined ? payload.isActive : true,
      productCount: 0
    })

    await databaseService.brands.insertOne(brand)
    await cacheService.invalidate('brands:*')
    // Sync to Typesense
    typesenseService.indexBrand(brand).catch(() => {})
    return brand
  }

  // Get brands with pagination and filters
  async getBrands(query: GetBrandsQuery) {
    const page = parseInt(query.page || '1')
    const limit = parseInt(query.limit || '20')
    const skip = (page - 1) * limit

    // Build filter
    const filter: Record<string, unknown> = {}

    if (query.isActive !== undefined) {
      filter.isActive = query.isActive === 'true'
    }

    if (query.country) {
      filter.country = { $regex: query.country, $options: 'i' }
    }

    if (query.search) {
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { description: { $regex: query.search, $options: 'i' } }
      ]
    }

    // Build sort
    const sortBy = query.sortBy || 'name'
    const sortOrder = query.sortOrder === 'desc' ? -1 : 1
    const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder }

    // Get brands with pagination
    const [brands, totalCount] = await Promise.all([
      databaseService.brands.find(filter).sort(sort).skip(skip).limit(limit).toArray(),
      databaseService.brands.countDocuments(filter)
    ])

    return {
      brands,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        totalCount
      }
    }
  }

  // Get brand by ID
  async getBrandById(brandId: string) {
    const brand = await databaseService.brands.findOne({ _id: new ObjectId(brandId) })
    if (!brand) {
      throw new ErrorWithStatus({
        message: BRANDS_MESSAGES.BRAND_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }
    return brand
  }

  // Update brand
  async updateBrand(brandId: string, payload: UpdateBrandReqBody) {
    const brand = await this.getBrandById(brandId)

    // Check name and slug uniqueness if changed
    if (payload.name || payload.slug) {
      const newName = payload.name || brand.name
      const newSlug = payload.slug || this.generateSlug(newName)
      await this.checkBrandExists(newName, newSlug, new ObjectId(brandId))
    }

    const updateData: Record<string, unknown> = {
      ...payload,
      updatedAt: new Date()
    }

    if (payload.name && !payload.slug) {
      updateData.slug = this.generateSlug(payload.name)
    }

    await databaseService.brands.updateOne({ _id: new ObjectId(brandId) }, { $set: updateData })
    await cacheService.invalidate('brands:*')

    const updated = await this.getBrandById(brandId)
    // Sync to Typesense
    typesenseService.indexBrand(updated).catch(() => {})
    return updated
  }

  // Toggle brand status
  async toggleBrandStatus(brandId: string, isActive: boolean) {
    await this.getBrandById(brandId) // Check exists

    await databaseService.brands.updateOne(
      { _id: new ObjectId(brandId) },
      {
        $set: {
          isActive,
          updatedAt: new Date()
        }
      }
    )
    await cacheService.invalidate('brands:*')

    const updated = await this.getBrandById(brandId)
    // Sync to Typesense
    typesenseService.indexBrand(updated).catch(() => {})
    return updated
  }

  // Delete brand
  async deleteBrand(brandId: string) {
    const brand = await this.getBrandById(brandId)

    // Check if brand has products
    if (brand.productCount > 0) {
      throw new ErrorWithStatus({
        message: BRANDS_MESSAGES.CANNOT_DELETE_BRAND_WITH_PRODUCTS,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    await databaseService.brands.deleteOne({ _id: new ObjectId(brandId) })
    await cacheService.invalidate('brands:*')
    // Sync to Typesense
    typesenseService.removeBrand(brandId).catch(() => {})
    return { message: BRANDS_MESSAGES.DELETE_BRAND_SUCCESS }
  }

  // Update product count (called when products are added/removed)
  async updateProductCount(brandId: ObjectId, increment: number) {
    await databaseService.brands.updateOne(
      { _id: brandId },
      { $inc: { productCount: increment }, $set: { updatedAt: new Date() } }
    )
  }
}

const brandsService = new BrandsService()
export default brandsService
