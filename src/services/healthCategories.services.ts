import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import HealthCategory from '~/models/schemas/HealthCategory.schema'
import { CreateHealthCategoryReqBody, UpdateHealthCategoryReqBody, GetHealthCategoriesQuery } from '~/models/requests/Article.request'
import { HEALTH_CATEGORIES_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'

class HealthCategoriesService {
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

    // Check if category exists by name or slug
    async checkCategoryExists(name: string, slug: string, excludeId?: ObjectId) {
        const query: { $or: Array<{ name?: string; slug?: string }>; _id?: { $ne: ObjectId } } = {
            $or: [{ name }, { slug }]
        }

        if (excludeId) {
            query._id = { $ne: excludeId }
        }

        const existingCategory = await databaseService.healthCategories.findOne(query)
        if (existingCategory) {
            throw new ErrorWithStatus({
                message: HEALTH_CATEGORIES_MESSAGES.CATEGORY_ALREADY_EXISTS,
                status: HTTP_STATUS.CONFLICT
            })
        }
    }

    // Create health category
    async createCategory(payload: CreateHealthCategoryReqBody) {
        const slug = payload.slug || this.generateSlug(payload.name)
        await this.checkCategoryExists(payload.name, slug)

        const category = new HealthCategory({
            name: payload.name,
            slug,
            description: payload.description,
            icon: payload.icon,
            color: payload.color,
            order: payload.order || 0,
            isActive: payload.isActive !== undefined ? payload.isActive : true,
            articleCount: 0
        })

        await databaseService.healthCategories.insertOne(category)
        return category
    }

    // Get categories with pagination and filters
    async getCategories(query: GetHealthCategoriesQuery) {
        const page = parseInt(query.page || '1')
        const limit = parseInt(query.limit || '100')
        const skip = (page - 1) * limit

        // Build filter
        const filter: Record<string, unknown> = {}

        if (query.isActive !== undefined) {
            filter.isActive = query.isActive === 'true'
        }

        if (query.search) {
            filter.$or = [
                { name: { $regex: query.search, $options: 'i' } },
                { description: { $regex: query.search, $options: 'i' } }
            ]
        }

        // Build sort
        const sortBy = query.sortBy || 'order'
        const sortOrder = query.sortOrder === 'desc' ? -1 : 1
        const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder }

        const [categories, totalCount] = await Promise.all([
            databaseService.healthCategories.find(filter).sort(sort).skip(skip).limit(limit).toArray(),
            databaseService.healthCategories.countDocuments(filter)
        ])

        return {
            categories,
            pagination: {
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit),
                totalCount
            }
        }
    }

    // Get category by ID
    async getCategoryById(categoryId: string) {
        const category = await databaseService.healthCategories.findOne({ _id: new ObjectId(categoryId) })
        if (!category) {
            throw new ErrorWithStatus({
                message: HEALTH_CATEGORIES_MESSAGES.CATEGORY_NOT_FOUND,
                status: HTTP_STATUS.NOT_FOUND
            })
        }
        return category
    }

    // Get category by slug
    async getCategoryBySlug(slug: string) {
        const category = await databaseService.healthCategories.findOne({ slug })
        if (!category) {
            throw new ErrorWithStatus({
                message: HEALTH_CATEGORIES_MESSAGES.CATEGORY_NOT_FOUND,
                status: HTTP_STATUS.NOT_FOUND
            })
        }
        return category
    }

    // Update category
    async updateCategory(categoryId: string, payload: UpdateHealthCategoryReqBody) {
        await this.getCategoryById(categoryId) // Check exists

        // Check name/slug uniqueness if changed
        if (payload.name || payload.slug) {
            const category = await this.getCategoryById(categoryId)
            const newName = payload.name || category.name
            const newSlug = payload.slug || (payload.name ? this.generateSlug(payload.name) : category.slug)
            await this.checkCategoryExists(newName, newSlug, new ObjectId(categoryId))
        }

        const updateData: Record<string, unknown> = {
            ...payload,
            updatedAt: new Date()
        }

        // Generate new slug if name changed and slug not provided
        if (payload.name && !payload.slug) {
            updateData.slug = this.generateSlug(payload.name)
        }

        await databaseService.healthCategories.updateOne({ _id: new ObjectId(categoryId) }, { $set: updateData })

        return await this.getCategoryById(categoryId)
    }

    // Delete category
    async deleteCategory(categoryId: string) {
        await this.getCategoryById(categoryId) // Check exists
        await databaseService.healthCategories.deleteOne({ _id: new ObjectId(categoryId) })
        return { message: HEALTH_CATEGORIES_MESSAGES.DELETE_CATEGORY_SUCCESS }
    }

    // Update article count
    async updateArticleCount(categoryId: ObjectId, increment: number) {
        await databaseService.healthCategories.updateOne(
            { _id: categoryId },
            { $inc: { articleCount: increment }, $set: { updatedAt: new Date() } }
        )
    }
}

const healthCategoriesService = new HealthCategoriesService()
export default healthCategoriesService
