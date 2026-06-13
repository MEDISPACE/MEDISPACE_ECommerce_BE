import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import { ObjectId } from 'mongodb'
import orderService from '~/services/orders.services'
import {
  CreateOrderReqBody,
  UpdateOrderStatusReqBody,
  UpdatePaymentStatusReqBody,
  GetOrdersQuery
} from '~/models/requests/Order.request'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'
import { ORDERS_MESSAGES } from '~/constants/message'
import { PaymentMethod } from '~/constants/enum'
import { redis } from '~/services/cache.services'

// Create order from cart
export const createOrderController = async (
  req: Request<ParamsDictionary, unknown, CreateOrderReqBody>,
  res: Response
) => {
  const userId = new ObjectId(req.decoded_authorization?.userId)
  const sessionId = req.cookies?.sessionId
  const idempotencyKey = req.header('x-idempotency-key')?.trim()
  const lockKey = idempotencyKey ? `order:create:${userId.toString()}:${idempotencyKey}` : undefined
  let locked = false
  let lockAvailable = false

  try {
    if (lockKey) {
      try {
        locked = (await redis.set(lockKey, '1', 'EX', 60, 'NX')) === 'OK'
        lockAvailable = true
      } catch {
        lockAvailable = false
      }
      if (lockAvailable && !locked) {
        const existing = await orderService.getOrderByIdempotencyKey(userId, idempotencyKey!)
        if (existing) {
          const result = {
            order: existing,
            orderId: existing._id,
            paymentUrlError: existing.paymentMethod !== PaymentMethod.COD && existing.paymentStatus !== 'paid'
          }
          return res.json({ message: ORDERS_MESSAGES.CREATE_ORDER_SUCCESS, result })
        }
        throw new ErrorWithStatus({ message: 'Đơn hàng đang được xử lý.', status: HTTP_STATUS.CONFLICT })
      }
    }

    const result = await orderService.createOrder(userId, {
      ...req.body,
      sessionId,
      idempotencyKey,
      req
    })

    return res.json({
      message: ORDERS_MESSAGES.CREATE_ORDER_SUCCESS,
      result
    })
  } finally {
    if (lockKey && locked) await redis.del(lockKey).catch(() => undefined)
  }
}

// Get user's orders
export const getOrdersController = async (
  req: Request<ParamsDictionary, unknown, unknown, GetOrdersQuery>,
  res: Response
) => {
  const userId = new ObjectId(req.decoded_authorization?.userId)
  const page = Number(req.query.page) || 1
  const limit = Number(req.query.limit) || 10

  const result = await orderService.getOrders(userId, page, limit)

  return res.status(HTTP_STATUS.OK).json({
    message: ORDERS_MESSAGES.GET_ORDERS_SUCCESS,
    result
  })
}

// Get order by ID
export const getOrderController = async (req: Request, res: Response) => {
  const userId = new ObjectId(req.decoded_authorization?.userId)
  const orderId = new ObjectId(req.params.orderId)

  const result = await orderService.getOrderById(orderId, userId)

  return res.status(HTTP_STATUS.OK).json({
    message: ORDERS_MESSAGES.GET_ORDER_SUCCESS,
    result
  })
}

// Update order status (admin only)
export const updateOrderStatusController = async (req: Request, res: Response) => {
  const orderId = new ObjectId(req.params.orderId)
  const { status, trackingNumber } = req.body

  const result = await orderService.updateOrderStatus(orderId, status, trackingNumber)

  return res.status(HTTP_STATUS.OK).json({
    message: ORDERS_MESSAGES.UPDATE_ORDER_STATUS_SUCCESS,
    result
  })
}

// Update payment status
export const updatePaymentStatusController = async (req: Request, res: Response) => {
  const orderId = new ObjectId(req.params.orderId)
  const { paymentStatus } = req.body

  const result = await orderService.updatePaymentStatus(orderId, paymentStatus)

  return res.status(HTTP_STATUS.OK).json({
    message: ORDERS_MESSAGES.UPDATE_PAYMENT_STATUS_SUCCESS,
    result
  })
}

export const cancelOwnOrderController = async (req: Request, res: Response) => {
  const userId = new ObjectId(req.decoded_authorization?.userId)
  const orderId = new ObjectId(req.params.orderId)
  const result = await orderService.cancelOwnOrder(orderId, userId)

  return res.status(HTTP_STATUS.OK).json({
    message: ORDERS_MESSAGES.UPDATE_ORDER_STATUS_SUCCESS,
    result
  })
}

// Get all orders (admin only)
export const getAllOrdersController = async (
  req: Request<ParamsDictionary, unknown, unknown, GetOrdersQuery>,
  res: Response
) => {
  const page = Number(req.query.page) || 1
  const limit = Number(req.query.limit) || 20
  const status = req.query.status

  const result = await orderService.getAllOrders(page, limit, status)

  return res.status(HTTP_STATUS.OK).json({
    message: ORDERS_MESSAGES.GET_ORDERS_SUCCESS,
    result
  })
}

// Get order statistics (admin only)
export const getOrderStatsController = async (req: Request, res: Response) => {
  const result = await orderService.getOrderStats()

  return res.status(HTTP_STATUS.OK).json({
    message: ORDERS_MESSAGES.GET_ORDER_STATS_SUCCESS,
    result
  })
}

// Get payment URL for order
export const getPaymentUrlController = async (req: Request, res: Response) => {
  const userId = new ObjectId(req.decoded_authorization?.userId)
  const orderId = new ObjectId(req.params.orderId)

  const result = await orderService.getPaymentUrl(orderId, userId, req)

  return res.status(HTTP_STATUS.OK).json({
    message: ORDERS_MESSAGES.GET_PAYMENT_URL_SUCCESS,
    result
  })
}
