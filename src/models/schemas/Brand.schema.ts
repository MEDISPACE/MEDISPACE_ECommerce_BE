import { ObjectId } from 'mongodb'

interface BrandType {
  _id?: ObjectId
  name: string
  slug: string
  logo?: string
  description?: string
  website?: string
  country?: string
  isActive: boolean
  productCount: number
  createdAt?: Date
}

export default class Brand {
  _id?: ObjectId
  name: string
  slug: string
  logo?: string
  description?: string
  website?: string
  country?: string
  isActive: boolean
  productCount: number
  createdAt?: Date

  constructor(brand: BrandType) {
    const date = new Date()
    this._id = brand._id
    this.name = brand.name
    this.slug = brand.slug
    this.logo = brand.logo
    this.description = brand.description
    this.website = brand.website
    this.country = brand.country
    this.isActive = brand.isActive !== undefined ? brand.isActive : true
    this.productCount = brand.productCount || 0
    this.createdAt = brand.createdAt || date
  }
}
