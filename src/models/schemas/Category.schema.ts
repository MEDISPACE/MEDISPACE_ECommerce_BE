import { ObjectId } from 'mongodb'

interface CategoryType {
  _id?: ObjectId
  name: string
  slug: string
  description?: string
  parentId?: ObjectId

  // Hierarchy Management
  level: number
  path: string
  productCount: number

  // Display Properties
  icon?: string
  thumbnailImage?: string
  sortOrder: number
  isActive: boolean

  // Timestamps
  createdAt?: Date
  updatedAt?: Date
}

export default class Category {
  _id?: ObjectId
  name: string
  slug: string
  description?: string
  parentId?: ObjectId

  // Hierarchy Management
  level: number
  path: string
  productCount: number

  // Display Properties
  icon?: string
  thumbnailImage?: string
  sortOrder: number
  isActive: boolean

  // Timestamps
  createdAt?: Date
  updatedAt?: Date

  constructor(category: CategoryType) {
    const date = new Date()
    this._id = category._id
    this.name = category.name
    this.slug = category.slug
    this.description = category.description || ''
    this.parentId = category.parentId

    // Hierarchy Management
    this.level = category.level || 0
    this.path = category.path || ''
    this.productCount = category.productCount || 0

    // Display Properties
    this.icon = category.icon || ''
    this.thumbnailImage = category.thumbnailImage || ''
    this.sortOrder = category.sortOrder || 0
    this.isActive = category.isActive !== undefined ? category.isActive : true

    // Timestamps
    this.createdAt = category.createdAt || date
    this.updatedAt = category.updatedAt || date
  }
}
