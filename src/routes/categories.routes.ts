import { Router } from 'express'
import { wrapRequestHandler } from '~/utils/handlers'
import {
  createCategoryController,
  getCategoriesController,
  getCategoryTreeController,
  getAdminCategoryTreeController,
  getCategoryByIdController,
  getCategoryBySlugController,
  getCategoryBreadcrumbController,
  getCategoryChildrenController,
  updateCategoryController,
  toggleCategoryStatusController,
  deleteCategoryController
} from '~/controllers/categories.controllers'
import {
  createCategoryValidator,
  updateCategoryValidator,
  getCategoriesValidator,
  categoryIdValidator,
  toggleCategoryStatusValidator,
  adminRequired,
  pharmacistOrAdminRequired
} from '~/middlewares/categories.middlewares'

const categoriesRouter = Router()

/**
 * Description: Create a new category
 * Path: /categories
 * Method: POST
 * Body: CreateCategoryReqBody
 * Header: { Authorization: Bearer <access_token> }
 */
categoriesRouter.post('/', adminRequired, createCategoryValidator, wrapRequestHandler(createCategoryController))

/**
 * Description: Get categories with pagination and filters
 * Path: /categories
 * Method: GET
 * Query: GetCategoriesQuery
 */
categoriesRouter.get('/', getCategoriesValidator, wrapRequestHandler(getCategoriesController))

/**
 * Description: Get category tree (hierarchical structure)
 * Path: /categories/tree
 * Method: GET
 */
categoriesRouter.get('/tree', wrapRequestHandler(getCategoryTreeController))

/**
 * Description: Get admin category tree (includes inactive)
 * Path: /categories/admin-tree
 * Method: GET
 * Header: { Authorization: Bearer <access_token> }
 */
categoriesRouter.get('/admin-tree', adminRequired, wrapRequestHandler(getAdminCategoryTreeController))

/**
 * Description: Get category by ID
 * Path: /categories/:categoryId
 * Method: GET
 * Params: { categoryId: string }
 */
categoriesRouter.get('/:categoryId', categoryIdValidator, wrapRequestHandler(getCategoryByIdController))

/**
 * Description: Get category by slug
 * Path: /categories/slug/:slug
 * Method: GET
 * Params: { slug: string }
 */
categoriesRouter.get('/slug/:slug', wrapRequestHandler(getCategoryBySlugController))

/**
 * Description: Get category breadcrumb
 * Path: /categories/:categoryId/breadcrumb
 * Method: GET
 * Params: { categoryId: string }
 */
categoriesRouter.get(
  '/:categoryId/breadcrumb',
  categoryIdValidator,
  wrapRequestHandler(getCategoryBreadcrumbController)
)

/**
 * Description: Get category children
 * Path: /categories/:categoryId/children
 * Method: GET
 * Params: { categoryId: string }
 */
categoriesRouter.get('/:categoryId/children', categoryIdValidator, wrapRequestHandler(getCategoryChildrenController))

/**
 * Description: Update category
 * Path: /categories/:categoryId
 * Method: PATCH
 * Params: { categoryId: string }
 * Body: UpdateCategoryReqBody
 * Header: { Authorization: Bearer <access_token> }
 */
categoriesRouter.patch(
  '/:categoryId',
  adminRequired,
  updateCategoryValidator,
  wrapRequestHandler(updateCategoryController)
)

/**
 * Description: Toggle category status (active/inactive)
 * Path: /categories/:categoryId/toggle-status
 * Method: PATCH
 * Params: { categoryId: string }
 * Body: { isActive: boolean }
 * Header: { Authorization: Bearer <access_token> }
 */
categoriesRouter.patch(
  '/:categoryId/toggle-status',
  pharmacistOrAdminRequired,
  toggleCategoryStatusValidator,
  wrapRequestHandler(toggleCategoryStatusController)
)

/**
 * Description: Delete category
 * Path: /categories/:categoryId
 * Method: DELETE
 * Params: { categoryId: string }
 * Header: { Authorization: Bearer <access_token> }
 */
categoriesRouter.delete(
  '/:categoryId',
  adminRequired,
  categoryIdValidator,
  wrapRequestHandler(deleteCategoryController)
)

export default categoriesRouter
