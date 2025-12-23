import { ObjectId } from 'mongodb'

// Price Variant for multi-unit pricing (Viên, Vỉ, Hộp, Tuýp, Chai...)
export interface PriceVariant {
  unit: string           // Đơn vị: "Viên", "Vỉ", "Hộp", "Tuýp", "Chai", "Gói", "Túi", "Cái", "Thùng"...
  price: number          // Giá bán (bắt buộc)
  originalPrice?: number // Giá niêm yết/gốc (trước giảm giá)
  costPrice?: number     // Giá vốn (nội bộ, chỉ admin/pharmacist thấy)
  isDefault: boolean     // Đơn vị mặc định hiển thị
  quantityPerUnit: number // Số lượng đơn vị nhỏ nhất trong 1 đơn vị này (dùng để tính stock)
}

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

  // Pricing - Multi-unit pricing (REQUIRED, at least 1 variant)
  priceVariants: PriceVariant[]

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

  // Pricing - Multi-unit pricing (REQUIRED)
  priceVariants: PriceVariant[]

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

    this.priceVariants = product.priceVariants

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
