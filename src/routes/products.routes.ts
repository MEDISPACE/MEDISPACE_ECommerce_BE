import { Router } from 'express'
import {
  createProductController,
  getProductsController,
  getProductByIdController,
  updateProductController,
  toggleProductStatusController,
  updateStockController,
  deleteProductController
} from '~/controllers/products.controllers'
import {
  createProductValidator,
  updateProductValidator,
  getProductsValidator,
  productIdValidator,
  toggleProductStatusValidator,
  updateStockValidator
} from '~/middlewares/products.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'
import { accessTokenValidator } from '~/middlewares/users.middlewares'

const productsRouter = Router()

/**
 * Description: Create a new product
 * Path: /products
 * Method: POST
 * Body: CreateProductReqBody
 * Headers: { Authorization: Bearer <access_token> } (Admin/Pharmacist)
 */
productsRouter.post(
  '/',
  accessTokenValidator,
  createProductValidator,
  wrapRequestHandler(createProductController)
)

/**
 * Description: Get products with pagination and filters
 * Path: /products
 * Method: GET
 * Query: { page?, limit?, categoryId?, brandId?, status?, isActive?, requiresPrescription?, search?, sortBy?, sortOrder?, minStock?, maxStock? }
 */
productsRouter.get('/', getProductsValidator, wrapRequestHandler(getProductsController))

/**
 * Description: Get product by ID with populated category and brand data
 * Path: /products/:productId
 * Method: GET
 * Params: { productId: string }
 */
productsRouter.get('/:productId', productIdValidator, wrapRequestHandler(getProductByIdController))

/**
 * Description: Update product
 * Path: /products/:productId
 * Method: PATCH
 * Params: { productId: string }
 * Body: UpdateProductReqBody
 * Headers: { Authorization: Bearer <access_token> } (Admin/Pharmacist)
 */
productsRouter.patch(
  '/:productId',
  accessTokenValidator,
  productIdValidator,
  updateProductValidator,
  wrapRequestHandler(updateProductController)
)

/**
 * Description: Toggle product status (active/inactive)
 * Path: /products/:productId/toggle-status
 * Method: PATCH
 * Params: { productId: string }
 * Body: { isActive: boolean }
 * Headers: { Authorization: Bearer <access_token> } (Admin/Pharmacist)
 */
productsRouter.patch(
  '/:productId/toggle-status',
  accessTokenValidator,
  productIdValidator,
  toggleProductStatusValidator,
  wrapRequestHandler(toggleProductStatusController)
)

/**
 * Description: Update product stock quantity
 * Path: /products/:productId/stock
 * Method: PATCH
 * Params: { productId: string }
 * Body: { stockQuantity: number }
 * Headers: { Authorization: Bearer <access_token> } (Admin/Pharmacist)
 */
productsRouter.patch(
  '/:productId/stock',
  accessTokenValidator,
  productIdValidator,
  updateStockValidator,
  wrapRequestHandler(updateStockController)
)

/**
 * Description: Delete product
 * Path: /products/:productId
 * Method: DELETE
 * Params: { productId: string }
 * Headers: { Authorization: Bearer <access_token> } (Admin only)
 */
productsRouter.delete(
  '/:productId',
  accessTokenValidator,
  productIdValidator,
  wrapRequestHandler(deleteProductController)
)

export default productsRouter
