import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import categoriesService from '~/services/categories.services'
import { CreateCategoryReqBody, UpdateCategoryReqBody, GetCategoriesQuery } from '~/models/requests/Category.request'
import { CATEGORIES_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'

// Create category
export const createCategoryController = async (
  req: Request<ParamsDictionary, unknown, CreateCategoryReqBody>,
  res: Response
) => {
  const result = await categoriesService.createCategory(req.body)
  return res.status(HTTP_STATUS.CREATED).json({
    message: CATEGORIES_MESSAGES.CREATE_CATEGORY_SUCCESS,
    result
  })
}

// Get categories with pagination and filters
export const getCategoriesController = async (
  req: Request<ParamsDictionary, unknown, unknown, GetCategoriesQuery>,
  res: Response
) => {
  const result = await categoriesService.getCategories(req.query)
  return res.status(HTTP_STATUS.OK).json({
    message: CATEGORIES_MESSAGES.GET_CATEGORIES_SUCCESS,
    result
  })
}

// Get category tree (hierarchical)
export const getCategoryTreeController = async (req: Request, res: Response) => {
  const result = await categoriesService.getCategoryTree()
  return res.status(HTTP_STATUS.OK).json({
    message: CATEGORIES_MESSAGES.GET_CATEGORY_TREE_SUCCESS,
    result
  })
}

// Get category by ID
export const getCategoryByIdController = async (req: Request<{ categoryId: string }>, res: Response) => {
  const result = await categoriesService.getCategoryById(req.params.categoryId)
  return res.status(HTTP_STATUS.OK).json({
    message: CATEGORIES_MESSAGES.GET_CATEGORY_SUCCESS,
    result
  })
}

// Get category breadcrumb
export const getCategoryBreadcrumbController = async (req: Request<{ categoryId: string }>, res: Response) => {
  const result = await categoriesService.getCategoryBreadcrumb(req.params.categoryId)
  return res.status(HTTP_STATUS.OK).json({
    message: CATEGORIES_MESSAGES.GET_CATEGORY_BREADCRUMB_SUCCESS,
    result
  })
}

// Get category children
export const getCategoryChildrenController = async (req: Request<{ categoryId: string }>, res: Response) => {
  const result = await categoriesService.getCategoryChildren(req.params.categoryId)
  return res.status(HTTP_STATUS.OK).json({
    message: CATEGORIES_MESSAGES.GET_CATEGORY_CHILDREN_SUCCESS,
    result
  })
}

// Update category
export const updateCategoryController = async (
  req: Request<{ categoryId: string }, any, UpdateCategoryReqBody>,
  res: Response
) => {
  const result = await categoriesService.updateCategory(req.params.categoryId, req.body)
  return res.status(HTTP_STATUS.OK).json({
    message: CATEGORIES_MESSAGES.UPDATE_CATEGORY_SUCCESS,
    result
  })
}

// Toggle category status (active/inactive)
export const toggleCategoryStatusController = async (
  req: Request<{ categoryId: string }, any, { isActive: boolean }>,
  res: Response
) => {
  const result = await categoriesService.toggleCategoryStatus(req.params.categoryId, req.body.isActive)
  return res.status(HTTP_STATUS.OK).json({
    message: CATEGORIES_MESSAGES.TOGGLE_CATEGORY_STATUS_SUCCESS,
    result
  })
}

// Delete category
export const deleteCategoryController = async (req: Request<{ categoryId: string }>, res: Response) => {
  const result = await categoriesService.deleteCategory(req.params.categoryId)
  return res.status(HTTP_STATUS.OK).json(result)
}
