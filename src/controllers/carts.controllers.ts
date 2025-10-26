import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import { ObjectId } from 'mongodb'
import cartService from '~/services/carts.services'
import { AddToCartReqBody, UpdateCartItemReqBody } from '~/models/requests/Cart.request'
import HTTP_STATUS from '~/constants/httpStatus'
import { CARTS_MESSAGES } from '~/constants/message'

// Helper function to get userId and sessionId from request
const getUserAndSession = (req: Request) => {
  const userId = req.decoded_authorization?.userId ? new ObjectId(req.decoded_authorization.userId) : undefined
  const sessionId = req.cookies?.sessionId || (req.headers['x-session-id'] as string)
  return { userId, sessionId }
}

// Get user's cart
export const getCartController = async (req: Request, res: Response) => {
  const { userId, sessionId } = getUserAndSession(req)
  const result = await cartService.getCart(userId, sessionId)

  // Set session cookie for guest users
  if (!userId && result.sessionId) {
    res.cookie('sessionId', result.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    })
  }

  return res.status(HTTP_STATUS.OK).json({
    message: CARTS_MESSAGES.GET_CART_SUCCESS,
    result: result.cart
  })
}

// Add item to cart
export const addToCartController = async (req: Request<ParamsDictionary, unknown, AddToCartReqBody>, res: Response) => {
  const { userId, sessionId } = getUserAndSession(req)
  const { productId, quantity } = req.body

  const result = await cartService.addItemToCart(new ObjectId(productId), quantity, userId, sessionId)

  return res.status(HTTP_STATUS.OK).json({
    message: CARTS_MESSAGES.ADD_TO_CART_SUCCESS,
    result
  })
}

// Update cart item quantity
export const updateCartItemController = async (
  req: Request<ParamsDictionary, unknown, UpdateCartItemReqBody>,
  res: Response
) => {
  const { userId, sessionId } = getUserAndSession(req)
  const { productId } = req.params as { productId: string }
  const { quantity } = req.body

  const result = await cartService.updateItemQuantity(new ObjectId(productId), quantity, userId, sessionId)

  return res.status(HTTP_STATUS.OK).json({
    message: CARTS_MESSAGES.UPDATE_CART_ITEM_SUCCESS,
    result
  })
}

// Remove item from cart
export const removeCartItemController = async (req: Request<ParamsDictionary>, res: Response) => {
  const { userId, sessionId } = getUserAndSession(req)
  const { productId } = req.params as { productId: string }

  const result = await cartService.removeItemFromCart(new ObjectId(productId), userId, sessionId)

  return res.status(HTTP_STATUS.OK).json({
    message: CARTS_MESSAGES.REMOVE_CART_ITEM_SUCCESS,
    result
  })
}

// Clear user's cart
export const clearCartController = async (req: Request, res: Response) => {
  const { userId, sessionId } = getUserAndSession(req)

  const result = await cartService.clearCart(userId, sessionId)

  return res.status(HTTP_STATUS.OK).json({
    message: CARTS_MESSAGES.CLEAR_CART_SUCCESS,
    result
  })
}

// Get checkout data
export const getCheckoutDataController = async (req: Request, res: Response) => {
  const { userId, sessionId } = getUserAndSession(req)

  const result = await cartService.getCheckoutData(userId, sessionId)

  return res.status(HTTP_STATUS.OK).json({
    message: CARTS_MESSAGES.GET_CHECKOUT_DATA_SUCCESS,
    result
  })
}
