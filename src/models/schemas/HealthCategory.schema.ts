import { ObjectId } from 'mongodb'

interface HealthCategoryType {
    _id?: ObjectId
    name: string
    slug: string
    description: string
    icon?: string
    color?: string
    articleCount: number
    isActive: boolean
    order: number
    createdAt?: Date
    updatedAt?: Date
}

export default class HealthCategory {
    _id?: ObjectId
    name: string
    slug: string
    description: string
    icon?: string
    color?: string
    articleCount: number
    isActive: boolean
    order: number
    createdAt?: Date
    updatedAt?: Date

    constructor(category: HealthCategoryType) {
        const date = new Date()
        this._id = category._id
        this.name = category.name
        this.slug = category.slug
        this.description = category.description
        this.icon = category.icon
        this.color = category.color
        this.articleCount = category.articleCount || 0
        this.isActive = category.isActive !== undefined ? category.isActive : true
        this.order = category.order || 0
        this.createdAt = category.createdAt || date
        this.updatedAt = category.updatedAt || date
    }
}
