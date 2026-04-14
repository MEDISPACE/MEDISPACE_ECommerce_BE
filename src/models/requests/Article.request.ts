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
