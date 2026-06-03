// Article Request Types
export interface CreateArticleReqBody {
  title: string
  slug?: string
  excerpt: string
  content: string
  featuredImage?: string
  images?: string[]
  categoryId: string
  tags?: string[]
  metaTitle?: string
  metaDescription?: string
  metaKeywords?: string[]
  references?: Array<{ title: string; url?: string }>
  reviewedBy?: string
  reviewedByTitle?: string
  reviewedAt?: string
  lastMedicallyReviewedAt?: string
  contentVersion?: number
  riskLevel?: 'general' | 'medication' | 'disease' | 'emergency-sensitive'
  targetAudiences?: string[]
  symptoms?: string[]
  activeIngredients?: string[]
  healthTopics?: string[]
  status?: 'draft' | 'pending' | 'published' | 'archived'
  isFeatured?: boolean
  isPinned?: boolean
  relatedArticleIds?: string[]
  relatedProductIds?: string[]
}

export interface UpdateArticleReqBody {
  title?: string
  slug?: string
  excerpt?: string
  content?: string
  featuredImage?: string
  images?: string[]
  categoryId?: string
  tags?: string[]
  metaTitle?: string
  metaDescription?: string
  metaKeywords?: string[]
  references?: Array<{ title: string; url?: string }>
  reviewedBy?: string
  reviewedByTitle?: string
  reviewedAt?: string
  lastMedicallyReviewedAt?: string
  contentVersion?: number
  riskLevel?: 'general' | 'medication' | 'disease' | 'emergency-sensitive'
  targetAudiences?: string[]
  symptoms?: string[]
  activeIngredients?: string[]
  healthTopics?: string[]
  status?: 'draft' | 'pending' | 'published' | 'archived'
  isFeatured?: boolean
  isPinned?: boolean
  relatedArticleIds?: string[]
  relatedProductIds?: string[]
}

export interface GetArticlesQuery {
  page?: string
  limit?: string
  categoryId?: string
  status?: string
  isPublished?: string
  isFeatured?: string
  search?: string
  tags?: string
  sortBy?: 'createdAt' | 'publishedAt' | 'viewCount' | 'likeCount' | 'title'
  sortOrder?: 'asc' | 'desc'
  authorId?: string
}

// HealthCategory Request Types
export interface CreateHealthCategoryReqBody {
  name: string
  slug?: string
  description: string
  icon?: string
  color?: string
  order?: number
  isActive?: boolean
}

export interface UpdateHealthCategoryReqBody {
  name?: string
  slug?: string
  description?: string
  icon?: string
  color?: string
  order?: number
  isActive?: boolean
}

export interface GetHealthCategoriesQuery {
  page?: string
  limit?: string
  isActive?: string
  search?: string
  sortBy?: 'name' | 'order' | 'articleCount' | 'createdAt'
  sortOrder?: 'asc' | 'desc'
}

export interface TrackArticleJourneyEventReqBody {
  eventType:
    | 'cta_chat'
    | 'cta_prescription_upload'
    | 'cta_product_search'
    | 'related_product_click'
    | 'article_share'
    | 'source_click'
    | 'article_ai_ask'
    | 'article_save'
    | 'topic_follow'
  targetType?: 'chat' | 'prescription' | 'search' | 'product' | 'source' | 'article' | 'ai'
  targetId?: string
  targetUrl?: string
  sessionId?: string
  metadata?: Record<string, unknown>
}

export interface ArticleAiAssistReqBody {
  action: 'outline' | 'seo' | 'excerpt' | 'faq' | 'quality_check' | 'sources'
  title?: string
  excerpt?: string
  content?: string
  categoryName?: string
  tags?: string[]
}

export interface ArticleAskReqBody {
  question: string
}
