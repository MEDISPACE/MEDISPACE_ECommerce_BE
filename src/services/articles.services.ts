import { ObjectId } from 'mongodb'
import axios from 'axios'
import databaseService from './database.services'
import Article from '~/models/schemas/Article.schema'
import {
  CreateArticleReqBody,
  UpdateArticleReqBody,
  GetArticlesQuery,
  TrackArticleJourneyEventReqBody,
  ArticleAiAssistReqBody,
  ArticleAskReqBody
} from '~/models/requests/Article.request'
import { ARTICLES_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'
import healthCategoriesService from './healthCategories.services'
import typesenseService from './typesense.services'

class ArticlesService {
  private normalizeReferences(references?: Array<{ title: string; url?: string }>) {
    if (!Array.isArray(references)) return []
    return references
      .map((reference) => ({
        title: String(reference.title || '').trim(),
        url: reference.url ? String(reference.url).trim() : undefined
      }))
      .filter((reference) => reference.title.length > 0)
  }

  private normalizeStringList(values?: string[]) {
    if (!Array.isArray(values)) return []
    return Array.from(
      new Set(
        values
          .map((value) => String(value || '').trim())
          .filter((value) => value.length > 0)
      )
    )
  }

  private getArticleObjectId(article: { _id?: ObjectId }) {
    if (!article._id) {
      throw new ErrorWithStatus({
        message: ARTICLES_MESSAGES.ARTICLE_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }
    return article._id instanceof ObjectId ? article._id : new ObjectId(article._id)
  }

  private compactUpdateData(updateData: Record<string, unknown>) {
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) {
        delete updateData[key]
      }
    })
    return updateData
  }

  private safeObjectIds(ids: unknown[]) {
    return ids
      .map((id) => String(id))
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id))
  }

  private normalizeReviewMetadata(payload: CreateArticleReqBody | UpdateArticleReqBody) {
    const metadata: Record<string, unknown> = {}
    if (payload.references !== undefined) {
      metadata.references = this.normalizeReferences(payload.references)
    }
    if (payload.reviewedBy !== undefined) {
      metadata.reviewedBy = payload.reviewedBy.trim() || undefined
    }
    if (payload.reviewedByTitle !== undefined) {
      metadata.reviewedByTitle = payload.reviewedByTitle.trim() || undefined
    }
    if (payload.reviewedAt !== undefined) {
      metadata.reviewedAt = payload.reviewedAt ? new Date(payload.reviewedAt) : undefined
    }
    if (payload.lastMedicallyReviewedAt !== undefined) {
      metadata.lastMedicallyReviewedAt = payload.lastMedicallyReviewedAt
        ? new Date(payload.lastMedicallyReviewedAt)
        : undefined
    }
    if (payload.contentVersion !== undefined) {
      metadata.contentVersion = payload.contentVersion
    }
    if (payload.riskLevel !== undefined) {
      metadata.riskLevel = payload.riskLevel
    }
    if (payload.targetAudiences !== undefined) {
      metadata.targetAudiences = this.normalizeStringList(payload.targetAudiences)
    }
    if (payload.symptoms !== undefined) {
      metadata.symptoms = this.normalizeStringList(payload.symptoms)
    }
    if (payload.activeIngredients !== undefined) {
      metadata.activeIngredients = this.normalizeStringList(payload.activeIngredients)
    }
    if (payload.healthTopics !== undefined) {
      metadata.healthTopics = this.normalizeStringList(payload.healthTopics)
    }
    return metadata
  }

  private isArticleOwner(article: any, userId: ObjectId): boolean {
    return article.authorId?.toString() === userId.toString()
  }

  private assertCanManageArticle(article: any, userId: ObjectId, isAdmin: boolean) {
    if (isAdmin) return
    if (!this.isArticleOwner(article, userId) || !['draft', 'pending'].includes(article.status)) {
      throw new ErrorWithStatus({
        message: ARTICLES_MESSAGES.ARTICLE_PERMISSION_DENIED,
        status: HTTP_STATUS.FORBIDDEN
      })
    }
  }

  private assertAdminOnlyArticleFields(payload: UpdateArticleReqBody | CreateArticleReqBody, isAdmin: boolean) {
    if (isAdmin) return

    const touchesAdminOnlyStatus = payload.status === 'published' || payload.status === 'archived'
    const touchesAdminOnlyFlags = payload.isFeatured === true || payload.isPinned === true
    if (touchesAdminOnlyStatus || touchesAdminOnlyFlags) {
      throw new ErrorWithStatus({
        message: ARTICLES_MESSAGES.ARTICLE_PUBLISH_PERMISSION_DENIED,
        status: HTTP_STATUS.FORBIDDEN
      })
    }
  }

  private getPublicationState(status: string) {
    return {
      status,
      isPublished: status === 'published'
    }
  }

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
  async createArticle(
    payload: CreateArticleReqBody,
    authorId: ObjectId,
    authorName: string,
    authorTitle?: string,
    isAdmin = false
  ) {
    this.assertAdminOnlyArticleFields(payload, isAdmin)
    // Validate category
    await this.validateCategory(payload.categoryId)

    // Generate slug
    const slug = payload.slug || this.generateSlug(payload.title)
    await this.checkSlugExists(slug)

    const requestedStatus = payload.status || 'draft'
    const publication = this.getPublicationState(requestedStatus)
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
      ...this.normalizeReviewMetadata(payload),
      status: publication.status as Article['status'],
      isPublished: publication.isPublished,
      isFeatured: isAdmin ? payload.isFeatured || false : false,
      isPinned: isAdmin ? payload.isPinned || false : false,
      publishedAt: publication.isPublished ? new Date() : undefined,
      relatedArticleIds: payload.relatedArticleIds ? this.safeObjectIds(payload.relatedArticleIds) : [],
      relatedProductIds: payload.relatedProductIds ? this.safeObjectIds(payload.relatedProductIds) : []
    })

    await databaseService.articles.insertOne(article)

    // Sync to Typesense với dữ liệu đã join category (fire-and-forget)
    this.getArticle(articleId.toString())
      .then((indexed) => typesenseService.indexArticle(indexed))
      .catch(() => {})

    // Update category article count if published
    if (article.isPublished) {
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
      const safeSearch = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const searchRegex = new RegExp(safeSearch, 'i')
      filter.$or = [
        { title: { $regex: safeSearch, $options: 'i' } },
        { excerpt: { $regex: safeSearch, $options: 'i' } },
        { content: { $regex: safeSearch, $options: 'i' } },
        { tags: { $in: [searchRegex] } },
        { healthTopics: { $in: [searchRegex] } },
        { symptoms: { $in: [searchRegex] } },
        { activeIngredients: { $in: [searchRegex] } },
        { targetAudiences: { $in: [searchRegex] } }
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
  async updateArticle(articleId: string, payload: UpdateArticleReqBody, userId: ObjectId, isAdmin = false) {
    const article = await this.getArticle(articleId)
    const articleObjectId = this.getArticleObjectId(article)
    this.assertCanManageArticle(article, userId, isAdmin)
    this.assertAdminOnlyArticleFields(payload, isAdmin)

    // Validate category if changed
    if (payload.categoryId && payload.categoryId !== article.categoryId.toString()) {
      await this.validateCategory(payload.categoryId)
    }

    // Check slug if changed
    if (payload.title || payload.slug) {
      const newSlug = payload.slug || (payload.title ? this.generateSlug(payload.title) : article.slug)
      await this.checkSlugExists(newSlug, articleObjectId)
    }

    const updateData = this.compactUpdateData({
      ...payload,
      ...this.normalizeReviewMetadata(payload),
      updatedAt: new Date()
    })
    const unsetData: Record<string, ''> = {}

    if (!isAdmin) {
      delete updateData.isFeatured
      delete updateData.isPinned
    }

    if (payload.status) {
      const publication = this.getPublicationState(payload.status)
      updateData.isPublished = publication.isPublished
      if (publication.isPublished && !article.isPublished) {
        updateData.publishedAt = new Date()
      }
      if (!publication.isPublished && article.isPublished) {
        delete updateData.publishedAt
        unsetData.publishedAt = ''
      }
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
      updateData.relatedArticleIds = this.safeObjectIds(payload.relatedArticleIds)
    }
    if (payload.relatedProductIds) {
      updateData.relatedProductIds = this.safeObjectIds(payload.relatedProductIds)
    }

    await databaseService.articles.updateOne(
      { _id: articleObjectId },
      Object.keys(unsetData).length > 0 ? { $set: updateData, $unset: unsetData } : { $set: updateData }
    )

    const result = await this.getArticle(articleObjectId.toString())

    const oldPublished = Boolean(article.isPublished)
    const newPublished = Boolean(result.isPublished)
    const oldCategoryId = article.categoryId.toString()
    const newCategoryId = result.categoryId.toString()

    if (oldPublished && (!newPublished || oldCategoryId !== newCategoryId)) {
      await healthCategoriesService.updateArticleCount(article.categoryId, -1)
    }
    if (newPublished && (!oldPublished || oldCategoryId !== newCategoryId)) {
      await healthCategoriesService.updateArticleCount(result.categoryId, 1)
    }

    // Sync to Typesense (fire-and-forget)
    typesenseService.indexArticle(result).catch(() => {})

    return result
  }

  // Delete article
  async deleteArticle(articleId: string, userId?: ObjectId, isAdmin = false) {
    const article = await this.getArticle(articleId)
    const articleObjectId = this.getArticleObjectId(article)
    if (userId) {
      this.assertCanManageArticle(article, userId, isAdmin)
    }

    await databaseService.articles.deleteOne({ _id: articleObjectId })

    // Remove from Typesense (fire-and-forget)
    typesenseService.removeArticle(articleObjectId.toString()).catch(() => {})

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
    const articleObjectId = this.getArticleObjectId(article)

    await databaseService.articles.updateOne(
      { _id: articleObjectId },
      { $set: { status: 'published', isPublished: true, publishedAt: new Date(), updatedAt: new Date() } }
    )

    // Update category count if not already published
    if (!article.isPublished) {
      await healthCategoriesService.updateArticleCount(article.categoryId, 1)
    }

    const result = await this.getArticle(articleObjectId.toString())

    // Sync to Typesense (fire-and-forget)
    typesenseService.indexArticle(result).catch(() => {})

    return result
  }

  // Archive article
  async archiveArticle(articleId: string) {
    const article = await this.getArticle(articleId)
    const articleObjectId = this.getArticleObjectId(article)

    await databaseService.articles.updateOne(
      { _id: articleObjectId },
      { $set: { status: 'archived', isPublished: false, updatedAt: new Date() }, $unset: { publishedAt: '' } }
    )

    // Update category count if was published
    if (article.isPublished) {
      await healthCategoriesService.updateArticleCount(article.categoryId, -1)
    }

    const result = await this.getArticle(articleObjectId.toString())

    // Sync to Typesense (fire-and-forget)
    typesenseService.indexArticle(result).catch(() => {})

    return result
  }

  // Get related articles
  async getRelatedArticles(articleId: string, limit = 6) {
    const article = await this.getArticle(articleId)
    const safeLimit = Math.min(Math.max(Number(limit) || 6, 1), 12)

    // Find articles in same category, exclude current
    const relatedArticles = await databaseService.articles
      .find({
        categoryId: article.categoryId,
        _id: { $ne: article._id }, // Use article._id directly
        status: 'published',
        isPublished: true
      })
      .sort({ viewCount: -1, createdAt: -1 })
      .limit(safeLimit)
      .toArray()

    return relatedArticles
  }

  async getRelatedProducts(articleId: string, limit = 8) {
    const article = await this.getArticle(articleId)
    const safeLimit = Math.min(Math.max(Number(limit) || 8, 1), 16)
    const explicitProductIds = Array.isArray(article.relatedProductIds)
      ? this.safeObjectIds(article.relatedProductIds)
      : []

    const pipeline: Record<string, unknown>[] = []

    if (explicitProductIds.length > 0) {
      pipeline.push({ $match: { _id: { $in: explicitProductIds }, isActive: true } })
      pipeline.push({
        $addFields: {
          relatedOrder: { $indexOfArray: [explicitProductIds, '$_id'] }
        }
      })
      pipeline.push({ $sort: { relatedOrder: 1 } })
    } else {
      const searchTerms = [
        article.category?.name,
        ...(Array.isArray(article.tags) ? article.tags : []),
        ...String(article.title || '').split(/\s+/).slice(0, 6)
      ]
        .map((term) => String(term).trim())
        .filter((term) => term.length >= 3)
        .slice(0, 10)

      const fallbackFilter: Record<string, unknown> = {
        isActive: true,
        stockQuantity: { $gt: 0 }
      }

      if (searchTerms.length > 0) {
        fallbackFilter.$or = searchTerms.flatMap((term) => [
          { name: { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, ' '), $options: 'i' } },
          { shortDescription: { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, ' '), $options: 'i' } }
        ])
      }

      pipeline.push({ $match: fallbackFilter })
      pipeline.push({ $sort: { rating: -1, reviewCount: -1, createdAt: -1 } })
    }

    pipeline.push(
      { $limit: safeLimit },
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
        $addFields: {
          category: { $arrayElemAt: ['$category', 0] },
          brand: { $arrayElemAt: ['$brand', 0] }
        }
      },
      {
        $project: {
          relatedOrder: 0,
          costPrice: 0,
          createdBy: 0,
          lastModifiedBy: 0
        }
      }
    )

    return databaseService.products.aggregate(pipeline).toArray()
  }

  async trackJourneyEvent(
    articleId: string,
    payload: TrackArticleJourneyEventReqBody,
    context?: { ip?: string; userAgent?: string }
  ) {
    const article = await this.getArticle(articleId)
    const event = {
      articleId: article._id,
      articleSlug: article.slug,
      categoryId: article.categoryId,
      eventType: payload.eventType,
      targetType: payload.targetType,
      targetId: payload.targetId,
      targetUrl: payload.targetUrl,
      sessionId: payload.sessionId,
      metadata: payload.metadata || {},
      ip: context?.ip,
      userAgent: context?.userAgent,
      createdAt: new Date()
    }

    await databaseService.articleJourneyEvents.insertOne(event)
    return { tracked: true }
  }

  async getJourneyAnalytics(articleId: string) {
    const article = await this.getArticle(articleId)
    const articleObjectId = article._id

    const [eventCounts, recentEvents, uniqueSessions] = await Promise.all([
      databaseService.articleJourneyEvents
        .aggregate([
          { $match: { articleId: articleObjectId } },
          { $group: { _id: '$eventType', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ])
        .toArray(),
      databaseService.articleJourneyEvents
        .find({ articleId: articleObjectId })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray(),
      databaseService.articleJourneyEvents.distinct('sessionId', { articleId: articleObjectId, sessionId: { $exists: true } })
    ])

    const counts = eventCounts.reduce<Record<string, number>>((acc, item) => {
      acc[item._id] = item.count
      return acc
    }, {})

    return {
      articleId: article._id,
      articleSlug: article.slug,
      title: article.title,
      counts,
      uniqueSessions: uniqueSessions.length,
      recentEvents
    }
  }

  async getArticlePreferences(userId: ObjectId) {
    const user = await databaseService.users.findOne(
      { _id: userId },
      { projection: { savedArticleIds: 1, followedHealthTopics: 1 } as any }
    )
    return {
      savedArticleIds: (user as any)?.savedArticleIds || [],
      followedHealthTopics: (user as any)?.followedHealthTopics || []
    }
  }

  async setSavedArticle(userId: ObjectId, articleId: string, saved: boolean) {
    const article = await this.getArticle(articleId)
    const articleObjectId = this.getArticleObjectId(article)
    await databaseService.users.updateOne(
      { _id: userId },
      saved
        ? { $addToSet: { savedArticleIds: articleObjectId } as any }
        : { $pull: { savedArticleIds: articleObjectId } as any }
    )
    return { articleId: articleObjectId, saved }
  }

  async setFollowedHealthTopic(userId: ObjectId, topicId: string, following: boolean) {
    const topic = String(topicId || '').trim()
    if (!topic) {
      throw new ErrorWithStatus({
        message: 'Topic is required',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }
    await databaseService.users.updateOne(
      { _id: userId },
      following
        ? { $addToSet: { followedHealthTopics: topic } as any }
        : { $pull: { followedHealthTopics: topic } as any }
    )
    return { topic, following }
  }

  async generateAiAssistance(payload: ArticleAiAssistReqBody) {
    const aiServiceUrl = process.env.CHAT_AI_URL || 'http://localhost:8003'
    const response = await axios.post(
      `${aiServiceUrl}/article/assist`,
      {
        action: payload.action,
        title: payload.title,
        excerpt: payload.excerpt,
        content: payload.content,
        category_name: payload.categoryName,
        tags: payload.tags || []
      },
      { timeout: 50000 }
    )
    return response.data
  }

  async askArticle(articleId: string, payload: ArticleAskReqBody) {
    const article = await this.getArticle(articleId)
    const aiServiceUrl = process.env.CHAT_AI_URL || 'http://localhost:8003'
    const response = await axios.post(
      `${aiServiceUrl}/article/ask`,
      {
        question: payload.question,
        title: article.title,
        excerpt: article.excerpt,
        content: article.content,
        category_name: article.category?.name,
        tags: article.tags || []
      },
      { timeout: 50000 }
    )
    return response.data
  }

  async getPersonalizedArticles(userId?: ObjectId, limit = 8) {
    const safeLimit = Math.min(Math.max(Number(limit) || 8, 1), 20)
    const baseFilter: Record<string, unknown> = { status: 'published', isPublished: true }
    const preferredCategoryIds = new Set<string>()
    const preferredTerms = new Set<string>()
    const reasons = new Set<string>()

    if (userId) {
      const [user, medicalInfo, orders, prescriptions] = await Promise.all([
        databaseService.users.findOne({ _id: userId }),
        databaseService.patientMedicalInfos.findOne({ customer_id: userId }),
        databaseService.orders.find({ userId }).sort({ createdAt: -1 }).limit(8).toArray(),
        databaseService.prescriptions.find({ customerId: userId }).sort({ createdAt: -1 }).limit(6).toArray()
      ])

      user?.medicalProfile?.chronicConditions?.forEach((term: string) => {
        preferredTerms.add(term)
        reasons.add('medical_profile')
      })
      user?.medicalProfile?.allergies?.forEach((term: string) => {
        preferredTerms.add(term)
        reasons.add('medical_profile')
      })
      medicalInfo?.chronic_diseases?.forEach((term: string) => {
        preferredTerms.add(term)
        reasons.add('medical_info')
      })
      medicalInfo?.allergies?.forEach((term: string) => {
        preferredTerms.add(term)
        reasons.add('medical_info')
      })
      medicalInfo?.current_medications?.forEach((term: string) => {
        preferredTerms.add(term)
        reasons.add('current_medications')
      })

      prescriptions.forEach((prescription: any) => {
        ;(prescription.medications || []).forEach((medication: any) => {
          if (medication.productName) {
            preferredTerms.add(medication.productName)
            reasons.add('prescriptions')
          }
        })
      })

      const orderProductIds = orders.flatMap((order: any) =>
        (order.items || order.orderItems || []).map((item: any) => item.productId).filter(Boolean)
      )
      const wishlistProductIds = Array.isArray(user?.wishlist) ? user.wishlist : []
      const productIds = this.safeObjectIds([...orderProductIds, ...wishlistProductIds])
      if (productIds.length > 0) {
        const products = await databaseService.products
          .find({ _id: { $in: productIds } })
          .project({ categoryId: 1, name: 1, shortDescription: 1, tags: 1 })
          .toArray()
        products.forEach((product: any) => {
          if (product.categoryId) preferredCategoryIds.add(product.categoryId.toString())
          if (product.name) preferredTerms.add(product.name)
          if (Array.isArray(product.tags)) {
            product.tags.forEach((tag: string) => preferredTerms.add(tag))
          }
          reasons.add('commerce_history')
        })
      }
    }

    const personalizedOr: Record<string, unknown>[] = []
    if (preferredCategoryIds.size > 0) {
      personalizedOr.push({
        categoryId: { $in: this.safeObjectIds(Array.from(preferredCategoryIds)) }
      })
    }
    Array.from(preferredTerms)
      .filter((term) => term.length >= 3)
      .slice(0, 8)
      .forEach((term) => {
        personalizedOr.push({ title: { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, ' '), $options: 'i' } })
        personalizedOr.push({ excerpt: { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, ' '), $options: 'i' } })
        personalizedOr.push({ tags: { $in: [term] } })
        personalizedOr.push({ targetAudiences: { $in: [term] } })
        personalizedOr.push({ symptoms: { $in: [term] } })
        personalizedOr.push({ activeIngredients: { $in: [term] } })
        personalizedOr.push({ healthTopics: { $in: [term] } })
      })

    const filter = personalizedOr.length > 0 ? { ...baseFilter, $or: personalizedOr } : baseFilter
    const articles = await databaseService.articles
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
        { $addFields: { category: { $arrayElemAt: ['$category', 0] } } },
        { $sort: { isPinned: -1, isFeatured: -1, viewCount: -1, publishedAt: -1 } },
        { $limit: safeLimit }
      ])
      .toArray()

    if (articles.length > 0) {
      return {
        source: personalizedOr.length > 0 ? 'personalized' : 'fallback',
        reasons: Array.from(reasons),
        articles
      }
    }

    const fallback = await this.getArticles({
      isPublished: 'true',
      status: 'published',
      limit: String(safeLimit),
      sortBy: 'publishedAt',
      sortOrder: 'desc'
    })
    return { source: 'fallback', reasons: [], articles: fallback.articles }
  }
}

const articlesService = new ArticlesService()
export default articlesService
