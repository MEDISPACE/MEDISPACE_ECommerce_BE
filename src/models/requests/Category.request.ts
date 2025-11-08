import { ParamsDictionary } from 'express-serve-static-core'

export interface CreateCategoryReqBody {
  name: string
  slug: string
  description?: string
  parentId?: string
  icon?: string
  thumbnailImage?: string
  sortOrder?: number
  isActive?: boolean
}

export interface UpdateCategoryReqBody {
  name?: string
  slug?: string
  description?: string
  parentId?: string
  icon?: string
  thumbnailImage?: string
  sortOrder?: number
  isActive?: boolean
}

export interface GetCategoryParams extends ParamsDictionary {
  categoryId: string
}

export interface GetCategoriesQuery {
  page?: string
  limit?: string
  parentId?: string
  level?: string
  isActive?: string
  search?: string
}

export interface ToggleCategoryStatusReqBody {
  isActive: boolean
}
