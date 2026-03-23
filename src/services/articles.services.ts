import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import Article from '~/models/schemas/Article.schema'
import { CreateArticleReqBody, UpdateArticleReqBody, GetArticlesQuery } from '~/models/requests/Article.request'
import { ARTICLES_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'
import healthCategoriesService from './healthCategories.services'
import typesenseService from './typesense.services'

class ArticlesService {
    // Generate slug from title
    private generateSlug(title: string): string {
        return title
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
    }

    // Check if slug exists
    async checkSlugExists(slug: string, excludeId?: ObjectId) {
        const query: { slug: string; _id?: { $ne: ObjectId } } = { slug }
        if (excludeId) {
            query._id = { $ne: excludeId }
        }

        const existingArticle = await databaseService.articles.findOne(query)
        if (existingArticle) {
            throw new ErrorWithStatus({
                message: ARTICLES_MESSAGES.SLUG_ALREADY_EXISTS,
                status: HTTP_STATUS.CONFLICT
            })
        }
    }

    // Validate category exists
    private async validateCategory(categoryId: string) {
        const category = await healthCategoriesService.getCategoryById(categoryId)
        if (!category.isActive) {
            throw new ErrorWithStatus({
                message: ARTICLES_MESSAGES.CATEGORY_ID_INVALID,
                status: HTTP_STATUS.BAD_REQUEST
            })
        }
        return category
    }

    // Create article
    async createArticle(payload: CreateArticleReqBody, authorId: ObjectId, authorName: string, authorTitle?: string) {
        // Validate category
        await this.validateCategory(payload.categoryId)

        // Generate slug
        const slug = payload.slug || this.generateSlug(payload.title)
        await this.checkSlugExists(slug)

        const articleId = new ObjectId()
        const article = new Article({
            _id: articleId,
            title: payload.title,
            slug,
            excerpt: payload.excerpt,
            content: payload.content,
            featuredImage: payload.featuredImage,
            images: payload.images,
            categoryId: new ObjectId(payload.categoryId),
            tags: payload.tags,
            authorId,
            authorName,
            authorTitle,
            viewCount: 0,
            metaTitle: payload.metaTitle,
            metaDescription: payload.metaDescription,
            metaKeywords: payload.metaKeywords,
            status: payload.status || 'draft',
            isPublished: false,
            isFeatured: payload.isFeatured || false,
            isPinned: payload.isPinned || false,
            relatedArticleIds: payload.relatedArticleIds?.map((id) => new ObjectId(id)),
            relatedProductIds: payload.relatedProductIds?.map((id) => new ObjectId(id))
        })

        await databaseService.articles.insertOne(article)

        // Sync to Typesense với dữ liệu đã join category (fire-and-forget)
        this.getArticle(articleId.toString())
          .then((indexed) => typesenseService.indexArticle(indexed))
          .catch(() => {})

        // Update category article count if published
        if (article.status === 'published') {
            await healthCategoriesService.updateArticleCount(article.categoryId, 1)
        }

        return article
    }

    // Get articles with pagination and filters
    async getArticles(query: GetArticlesQuery) {
        const page = parseInt(query.page || '1')
        const limit = parseInt(query.limit || '20')
        const skip = (page - 1) * limit

        // Build filter
        const filter: Record<string, unknown> = {}

        if (query.categoryId) {
            try {
                if (ObjectId.isValid(query.categoryId)) {
                    filter.categoryId = new ObjectId(query.categoryId)
                } else {
                    const category = await healthCategoriesService.getCategoryBySlug(query.categoryId)
                    filter.categoryId = category._id
                }
            } catch (error) {
                filter.categoryId = null
            }
        }

        if (query.status) {
            filter.status = query.status
        }

        if (query.isPublished !== undefined) {
            filter.isPublished = query.isPublished === 'true'
        }

        if (query.isFeatured !== undefined) {
            filter.isFeatured = query.isFeatured === 'true'
        }

        if (query.authorId) {
            filter.authorId = new ObjectId(query.authorId)
        }

        if (query.search) {
            filter.$or = [
                { title: { $regex: query.search, $options: 'i' } },
                { excerpt: { $regex: query.search, $options: 'i' } },
                { content: { $regex: query.search, $options: 'i' } }
            ]
        }

        if (query.tags) {
            filter.tags = { $in: query.tags.split(',') }
        }

        // Build sort
        const sortBy = query.sortBy || 'createdAt'
        const sortOrder = query.sortOrder === 'desc' ? -1 : 1
        const sort: Record<string, 1 | -1> = { isPinned: -1, [sortBy]: sortOrder }

        // Get articles with populated category
        const [articles, totalCount] = await Promise.all([
            databaseService.articles
                .aggregate([
                    { $match: filter },
                    {
                        $lookup: {
                            from: 'healthCategories',
                            localField: 'categoryId',
                            foreignField: '_id',
                            as: 'category'
                        }
                    },
                    {
                        $addFields: {
                            category: { $arrayElemAt: ['$category', 0] }
                        }
                    },
                    { $sort: sort },
                    { $skip: skip },
                    { $limit: limit }
                ])
                .toArray(),
            databaseService.articles.countDocuments(filter)
        ])

        return {
            articles,
            pagination: {
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit),
                totalCount
            }
        }
    }

    // Get article by ID or slug
    async getArticle(identifier: string) {
        const isObjectId = ObjectId.isValid(identifier)
        const matchStage = isObjectId ? { _id: new ObjectId(identifier) } : { slug: identifier }

        const articles = await databaseService.articles
            .aggregate([
                { $match: matchStage },
                {
                    $lookup: {
                        from: 'healthCategories',
                        localField: 'categoryId',
                        foreignField: '_id',
                        as: 'category'
                    }
                },
                {
                    $addFields: {
                        category: { $arrayElemAt: ['$category', 0] }
                    }
                }
            ])
            .toArray()

        if (!articles.length) {
            throw new ErrorWithStatus({
                message: ARTICLES_MESSAGES.ARTICLE_NOT_FOUND,
                status: HTTP_STATUS.NOT_FOUND
            })
        }

        return articles[0]
    }

    // Update article
    async updateArticle(articleId: string, payload: UpdateArticleReqBody, userId: ObjectId) {
        const article = await this.getArticle(articleId)

        // Validate category if changed
        if (payload.categoryId && payload.categoryId !== article.categoryId.toString()) {
            await this.validateCategory(payload.categoryId)
        }

        // Check slug if changed
        if (payload.title || payload.slug) {
            const newSlug = payload.slug || (payload.title ? this.generateSlug(payload.title) : article.slug)
            await this.checkSlugExists(newSlug, new ObjectId(articleId))
        }

        const updateData: Record<string, unknown> = {
            ...payload,
            updatedAt: new Date()
        }

        // Generate slug if title changed
        if (payload.title && !payload.slug) {
            updateData.slug = this.generateSlug(payload.title)
        }

        // Convert IDs
        if (payload.categoryId) {
            updateData.categoryId = new ObjectId(payload.categoryId)
        }
        if (payload.relatedArticleIds) {
            updateData.relatedArticleIds = payload.relatedArticleIds.map((id) => new ObjectId(id))
        }
        if (payload.relatedProductIds) {
            updateData.relatedProductIds = payload.relatedProductIds.map((id) => new ObjectId(id))
        }

        // If article was published and category changed, update counts
        if (article.isPublished && payload.categoryId && payload.categoryId !== article.categoryId.toString()) {
            await healthCategoriesService.updateArticleCount(article.categoryId, -1)
            await healthCategoriesService.updateArticleCount(new ObjectId(payload.categoryId), 1)
        }

        await databaseService.articles.updateOne({ _id: new ObjectId(articleId) }, { $set: updateData })

        const result = await this.getArticle(articleId)

        // Sync to Typesense (fire-and-forget)
        typesenseService.indexArticle(result).catch(() => {})

        return result
    }

    // Delete article
    async deleteArticle(articleId: string) {
        const article = await this.getArticle(articleId)

        await databaseService.articles.deleteOne({ _id: new ObjectId(articleId) })

        // Remove from Typesense (fire-and-forget)
        typesenseService.removeArticle(articleId).catch(() => {})

        // Update category count if was published
        if (article.isPublished) {
            await healthCategoriesService.updateArticleCount(article.categoryId, -1)
        }

        return { message: ARTICLES_MESSAGES.DELETE_ARTICLE_SUCCESS }
    }

    // Increment view count
    async incrementView(articleId: string) {
        const article = await this.getArticle(articleId)
        await databaseService.articles.updateOne({ _id: article._id }, { $inc: { viewCount: 1 } })
    }

    // Publish article (admin only)
    async publishArticle(articleId: string) {
        const article = await this.getArticle(articleId)

        await databaseService.articles.updateOne(
            { _id: new ObjectId(articleId) },
            { $set: { status: 'published', isPublished: true, publishedAt: new Date(), updatedAt: new Date() } }
        )

        // Update category count if not already published
        if (!article.isPublished) {
            await healthCategoriesService.updateArticleCount(article.categoryId, 1)
        }

        const result = await this.getArticle(articleId)

        // Sync to Typesense (fire-and-forget)
        typesenseService.indexArticle(result).catch(() => {})

        return result
    }

    // Archive article
    async archiveArticle(articleId: string) {
        const article = await this.getArticle(articleId)

        await databaseService.articles.updateOne(
            { _id: new ObjectId(articleId) },
            { $set: { status: 'archived', isPublished: false, updatedAt: new Date() } }
        )

        // Update category count if was published
        if (article.isPublished) {
            await healthCategoriesService.updateArticleCount(article.categoryId, -1)
        }

        const result = await this.getArticle(articleId)

        // Sync to Typesense (fire-and-forget)
        typesenseService.indexArticle(result).catch(() => {})

        return result
    }

    // Get related articles
    async getRelatedArticles(articleId: string, limit = 6) {
        const article = await this.getArticle(articleId)

        // Find articles in same category, exclude current
        const relatedArticles = await databaseService.articles
            .find({
                categoryId: article.categoryId,
                _id: { $ne: article._id }, // Use article._id directly
                status: 'published',
                isPublished: true
            })
            .sort({ viewCount: -1, createdAt: -1 })
            .limit(limit)
            .toArray()

        return relatedArticles
    }
}

const articlesService = new ArticlesService()
export default articlesService
