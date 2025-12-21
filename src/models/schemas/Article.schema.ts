import { ObjectId } from 'mongodb'

interface ArticleType {
    _id?: ObjectId
    title: string
    slug: string
    excerpt: string
    content: string
    featuredImage?: string
    images?: string[]

    categoryId: ObjectId
    tags?: string[]

    authorId: ObjectId
    authorName: string
    authorTitle?: string

    viewCount: number

    metaTitle?: string
    metaDescription?: string
    metaKeywords?: string[]

    status: 'draft' | 'pending' | 'published' | 'archived'
    isPublished: boolean
    isFeatured: boolean
    isPinned: boolean

    publishedAt?: Date
    createdAt?: Date
    updatedAt?: Date

    readTime?: number
    relatedArticleIds?: ObjectId[]
    relatedProductIds?: ObjectId[]
}

export default class Article {
    _id?: ObjectId
    title: string
    slug: string
    excerpt: string
    content: string
    featuredImage?: string
    images?: string[]

    categoryId: ObjectId
    tags?: string[]

    authorId: ObjectId
    authorName: string
    authorTitle?: string

    viewCount: number

    metaTitle?: string
    metaDescription?: string
    metaKeywords?: string[]

    status: 'draft' | 'pending' | 'published' | 'archived'
    isPublished: boolean
    isFeatured: boolean
    isPinned: boolean

    publishedAt?: Date
    createdAt?: Date
    updatedAt?: Date

    readTime?: number
    relatedArticleIds?: ObjectId[]
    relatedProductIds?: ObjectId[]

    constructor(article: ArticleType) {
        const date = new Date()
        this._id = article._id
        this.title = article.title
        this.slug = article.slug
        this.excerpt = article.excerpt
        this.content = article.content
        this.featuredImage = article.featuredImage
        this.images = article.images || []

        this.categoryId = article.categoryId
        this.tags = article.tags || []

        this.authorId = article.authorId
        this.authorName = article.authorName
        this.authorTitle = article.authorTitle

        this.viewCount = article.viewCount || 0

        this.metaTitle = article.metaTitle
        this.metaDescription = article.metaDescription
        this.metaKeywords = article.metaKeywords || []

        this.status = article.status || 'draft'
        this.isPublished = article.isPublished || false
        this.isFeatured = article.isFeatured || false
        this.isPinned = article.isPinned || false

        this.publishedAt = article.publishedAt
        this.createdAt = article.createdAt || date
        this.updatedAt = article.updatedAt || date

        this.readTime = article.readTime || this.calculateReadTime(article.content)
        this.relatedArticleIds = article.relatedArticleIds || []
        this.relatedProductIds = article.relatedProductIds || []
    }

    // Calculate estimated read time (words per minute)
    private calculateReadTime(content: string): number {
        const wordsPerMinute = 200
        const wordCount = content.split(/\s+/).length
        return Math.ceil(wordCount / wordsPerMinute)
    }
}
