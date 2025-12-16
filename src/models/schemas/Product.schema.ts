import { ObjectId } from 'mongodb'

interface ProductType {
  _id?: ObjectId
  name: string
  slug: string
  sku: string
  barcode?: string

  // Basic Information
  shortDescription: string
  categoryId: ObjectId
  brandId?: ObjectId

  // Pricing
  price: number

  // Inventory Summary
  stockQuantity: number
  maxOrderQuantity: number

  // Product Status & Classification
  status: string // 'active' | 'discontinued' | 'out_of_stock'
  isActive: boolean
  requiresPrescription: boolean

  // Featured Media
  featuredImage?: string

  // Review & Rating (cached from reviews collection)
  rating?: number
  reviewCount?: number
  ratingDistribution?: {
    1: number
    2: number
    3: number
    4: number
    5: number
  }

  // Audit Information
  createdAt?: Date
  updatedAt?: Date
  createdBy: ObjectId
  lastModifiedBy?: ObjectId
}

export default class Product {
  _id?: ObjectId
  name: string
  slug: string
  sku: string
  barcode?: string

  // Basic Information
  shortDescription: string
  categoryId: ObjectId
  brandId?: ObjectId

  // Pricing
  price: number

  // Inventory Summary
  stockQuantity: number
  maxOrderQuantity: number

  // Product Status & Classification
  status: string
  isActive: boolean
  requiresPrescription: boolean

  // Featured Media
  featuredImage?: string

  // Review & Rating
  rating?: number
  reviewCount?: number
  ratingDistribution?: {
    1: number
    2: number
    3: number
    4: number
    5: number
  }

  // Audit Information
  createdAt?: Date
  updatedAt?: Date
  createdBy: ObjectId
  lastModifiedBy?: ObjectId

  constructor(product: ProductType) {
    const date = new Date()
    this._id = product._id
    this.name = product.name
    this.slug = product.slug
    this.sku = product.sku
    this.barcode = product.barcode

    this.shortDescription = product.shortDescription
    this.categoryId = product.categoryId
    this.brandId = product.brandId

    this.price = product.price

    this.stockQuantity = product.stockQuantity || 0
    this.maxOrderQuantity = product.maxOrderQuantity || 10

    this.status = product.status || 'active'
    this.isActive = product.isActive !== undefined ? product.isActive : true
    this.requiresPrescription = product.requiresPrescription || false

    this.featuredImage = product.featuredImage

    // Initialize rating fields
    this.rating = product.rating || 0
    this.reviewCount = product.reviewCount || 0
    this.ratingDistribution = product.ratingDistribution || {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0
    }

    this.createdAt = product.createdAt || date
    this.updatedAt = product.updatedAt || date
    this.createdBy = product.createdBy
    this.lastModifiedBy = product.lastModifiedBy
  }
}
