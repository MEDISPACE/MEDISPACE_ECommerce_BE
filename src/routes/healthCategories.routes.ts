import { Router } from 'express'
import {
  createHealthCategoryController,
  getHealthCategoriesController,
  getHealthCategoryController,
  updateHealthCategoryController,
  deleteHealthCategoryController
} from '~/controllers/healthCategories.controllers'
import {
  createHealthCategoryValidator,
  updateHealthCategoryValidator,
  getHealthCategoriesValidator,
  healthCategoryIdValidator
} from '~/middlewares/healthCategories.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'
import { accessTokenValidator } from '~/middlewares/users.middlewares'
import { adminValidator } from '~/middlewares/common.middlewares'

const healthCategoriesRouter = Router()

/**
 * Description: Get health categories (Public)
 * Path: /health-categories
 * Method: GET
 * Query: { page?, limit?, isActive?, search?, sortBy?, sortOrder? }
 */
healthCategoriesRouter.get('/', getHealthCategoriesValidator, wrapRequestHandler(getHealthCategoriesController))

/**
 * Description: Get health category by ID or slug (Public)
 * Path: /health-categories/:categoryId
 * Method: GET
 * Params: { categoryId: string } (ObjectId or slug)
 */
healthCategoriesRouter.get('/:categoryId', healthCategoryIdValidator, wrapRequestHandler(getHealthCategoryController))

/**
 * Description: Create health category (Admin only)
 * Path: /health-categories
 * Method: POST
 * Body: CreateHealthCategoryReqBody
 * Headers: { Authorization: Bearer <access_token> }
 */
healthCategoriesRouter.post(
  '/',
  accessTokenValidator,
  adminValidator,
  createHealthCategoryValidator,
  wrapRequestHandler(createHealthCategoryController)
)

/**
 * Description: Update health category (Admin only)
 * Path: /health-categories/:categoryId
 * Method: PATCH
 * Params: { categoryId: string }
 * Body: UpdateHealthCategoryReqBody
 * Headers: { Authorization: Bearer <access_token> }
 */
healthCategoriesRouter.patch(
  '/:categoryId',
  accessTokenValidator,
  adminValidator,
  healthCategoryIdValidator,
  updateHealthCategoryValidator,
  wrapRequestHandler(updateHealthCategoryController)
)

/**
 * Description: Delete health category (Admin only)
 * Path: /health-categories/:categoryId
 * Method: DELETE
 * Params: { categoryId: string }
 * Headers: { Authorization: Bearer <access_token> }
 */
healthCategoriesRouter.delete(
  '/:categoryId',
  accessTokenValidator,
  adminValidator,
  healthCategoryIdValidator,
  wrapRequestHandler(deleteHealthCategoryController)
)

export default healthCategoriesRouter
