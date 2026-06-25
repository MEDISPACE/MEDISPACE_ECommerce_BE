import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import { ObjectId } from 'mongodb'
import cartService from '~/services/carts.services'
import { AddToCartReqBody, UpdateCartItemReqBody } from '~/models/requests/Cart.request'
import HTTP_STATUS from '~/constants/httpStatus'
import { CARTS_MESSAGES } from '~/constants/message'
import recommendationsService from '~/services/recommendations.services'

const setGuestCartSessionCookie = (res: Response, sessionId?: string) => {
  if (!sessionId) return

  res.cookie('sessionId', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  })
}

// Helper function to get userId and sessionId from request
const getUserAndSession = (req: Request) => {
  let userId: ObjectId | undefined = undefined

  if (req.decoded_authorization?.userId) {
    try {
      userId = new ObjectId(req.decoded_authorization.userId)
    } catch {
      throw new Error('Invalid userId in token')
    }
  }

  const sessionId = req.cookies?.sessionId
  return { userId, sessionId }
}

// Get user's cart
export const getCartController = async (req: Request, res: Response) => {
  const { userId, sessionId } = getUserAndSession(req)
  const result = await cartService.getCart(userId, sessionId)

  // Set session cookie for guest users
  if (!userId && result.sessionId) {
    setGuestCartSessionCookie(res, result.sessionId)
  }

  return res.status(HTTP_STATUS.OK).json({
    message: CARTS_MESSAGES.GET_CART_SUCCESS,
    result: result.cart
  })
}

// Add item to cart
export const addToCartController = async (req: Request<ParamsDictionary, unknown, AddToCartReqBody>, res: Response) => {
  const { userId, sessionId } = getUserAndSession(req)
  const { productId, quantity, unit, price } = req.body

  const result = await cartService.addItemToCart(new ObjectId(productId), quantity, userId, sessionId, unit, price)
  void recommendationsService.recordRealtimeEvent(userId?.toString())

  if (!userId) {
    setGuestCartSessionCookie(res, result.sessionId)
  }

  return res.status(HTTP_STATUS.OK).json({
    message: CARTS_MESSAGES.ADD_TO_CART_SUCCESS,
    result
  })
}

// Update cart item quantity
export const updateCartItemController = async (
  req: Request<ParamsDictionary, unknown, UpdateCartItemReqBody & { unit?: string }>,
  res: Response
) => {
  const { userId, sessionId } = getUserAndSession(req)
  const { productId } = req.params as { productId: string }
  const { quantity, unit } = req.body

  const result = await cartService.updateItemQuantity(new ObjectId(productId), quantity, userId, sessionId, unit)

  if (!userId) {
    setGuestCartSessionCookie(res, result.sessionId)
  }

  return res.status(HTTP_STATUS.OK).json({
    message: CARTS_MESSAGES.UPDATE_CART_ITEM_SUCCESS,
    result
  })
}

// Update cart item unit
export const updateCartItemUnitController = async (
  req: Request<ParamsDictionary, unknown, { unit: string; currentUnit?: string }>,
  res: Response
) => {
  const { userId, sessionId } = getUserAndSession(req)
  const { productId } = req.params as { productId: string }
  const { unit, currentUnit } = req.body

  const result = await cartService.updateItemUnit(new ObjectId(productId), unit, userId, sessionId, currentUnit)

  if (!userId) {
    setGuestCartSessionCookie(res, result.sessionId)
  }

  return res.status(HTTP_STATUS.OK).json({
    message: CARTS_MESSAGES.UPDATE_CART_ITEM_SUCCESS,
    result
  })
}

// Remove item from cart
export const removeCartItemController = async (
  req: Request<ParamsDictionary, unknown, unknown, { unit?: string }>,
  res: Response
) => {
  const { userId, sessionId } = getUserAndSession(req)
  const { productId } = req.params as { productId: string }
  const { unit } = req.query

  const result = await cartService.removeItemFromCart(new ObjectId(productId), userId, sessionId, unit as string)

  if (!userId) {
    setGuestCartSessionCookie(res, result.sessionId)
  }

  return res.status(HTTP_STATUS.OK).json({
    message: CARTS_MESSAGES.REMOVE_CART_ITEM_SUCCESS,
    result
  })
}

// Clear user's cart
export const clearCartController = async (req: Request, res: Response) => {
  const { userId, sessionId } = getUserAndSession(req)

  const result = await cartService.clearCart(userId, sessionId)

  if (!userId) {
    setGuestCartSessionCookie(res, result.sessionId)
  }

  return res.status(HTTP_STATUS.OK).json({
    message: CARTS_MESSAGES.CLEAR_CART_SUCCESS,
    result
  })
}

// Get checkout data
export const getCheckoutDataController = async (req: Request, res: Response) => {
  const { userId, sessionId } = getUserAndSession(req)

  const result = await cartService.getCheckoutData(userId, sessionId)

  if (!userId) {
    setGuestCartSessionCookie(res, result.sessionId)
  }

  return res.status(HTTP_STATUS.OK).json({
    message: CARTS_MESSAGES.GET_CHECKOUT_DATA_SUCCESS,
    result
  })
}
