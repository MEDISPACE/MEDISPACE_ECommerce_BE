import { Router } from 'express'
import {
  getCartController,
  addToCartController,
  updateCartItemController,
  updateCartItemUnitController,
  removeCartItemController,
  clearCartController,
  getCheckoutDataController
} from '~/controllers/carts.controllers'
import {
  addToCartValidator,
  updateCartItemValidator,
  cartItemValidator,
  optionalAuth
} from '~/middlewares/carts.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const cartsRouter = Router()

/**
 * Description: Get user's cart
 * Path: /cart
 * Method: GET
 * Headers: { Authorization: Bearer <access_token> } (optional for guest users)
 */
cartsRouter.get('/', optionalAuth, wrapRequestHandler(getCartController))

/**
 * Description: Add item to cart
 * Path: /cart/add
 * Method: POST
 * Body: { productId: string, quantity: number }
 * Headers: { Authorization: Bearer <access_token> } (optional for guest users)
 */
cartsRouter.post('/add', optionalAuth, addToCartValidator, wrapRequestHandler(addToCartController))

/**
 * Description: Update cart item quantity
 * Path: /cart/update/:productId
 * Method: PUT
 * Params: { productId: string }
 * Body: { quantity: number }
 * Headers: { Authorization: Bearer <access_token> } (optional for guest users)
 */
cartsRouter.put(
  '/update/:productId',
  optionalAuth,
  cartItemValidator,
  updateCartItemValidator,
  wrapRequestHandler(updateCartItemController)
)

/**
 * Description: Update cart item unit
 * Path: /cart/update-unit/:productId
 * Method: PUT
 * Params: { productId: string }
 * Body: { unit: string }
 * Headers: { Authorization: Bearer <access_token> } (optional for guest users)
 */
cartsRouter.put(
  '/update-unit/:productId',
  optionalAuth,
  cartItemValidator,
  wrapRequestHandler(updateCartItemUnitController)
)

/**
 * Description: Remove item from cart
 * Path: /cart/remove/:productId
 * Method: DELETE
 * Params: { productId: string }
 * Headers: { Authorization: Bearer <access_token> } (optional for guest users)
 */
cartsRouter.delete('/remove/:productId', optionalAuth, cartItemValidator, wrapRequestHandler(removeCartItemController))

/**
 * Description: Clear user's cart
 * Path: /cart/clear
 * Method: DELETE
 * Headers: { Authorization: Bearer <access_token> } (optional for guest users)
 */
cartsRouter.delete('/clear', optionalAuth, wrapRequestHandler(clearCartController))

/**
 * Description: Get checkout data
 * Path: /cart/checkout
 * Method: GET
 * Headers: { Authorization: Bearer <access_token> } (optional for guest users)
 */
cartsRouter.get('/checkout', optionalAuth, wrapRequestHandler(getCheckoutDataController))

export default cartsRouter
