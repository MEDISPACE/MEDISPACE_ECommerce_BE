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
import { ORDERS_MESSAGES } from '~/constants/message'
import { PaymentMethod } from '~/constants/enum'

// Create order from cart
export const createOrderController = async (
  req: Request<ParamsDictionary, unknown, CreateOrderReqBody>,
  res: Response
) => {
  const userId = new ObjectId(req.decoded_authorization?.userId)
  const sessionId = req.cookies?.sessionId

  console.log('createOrderController - userId:', userId)

  console.log('createOrderController body:', req.body)
  console.log('createOrderController user_id:', userId)
  const { shippingAddress, paymentMethod, notes } = req.body
  const result = await orderService.createOrder(userId, shippingAddress, paymentMethod as PaymentMethod, notes, sessionId, req)

  return res.json({
    message: ORDERS_MESSAGES.CREATE_ORDER_SUCCESS,
    result
  })
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
    message: 'Get order statistics successfully',
    result
  })
}

// Get payment URL for order
export const getPaymentUrlController = async (req: Request, res: Response) => {
  const userId = new ObjectId(req.decoded_authorization?.userId)
  const orderId = new ObjectId(req.params.orderId)

  const result = await orderService.getPaymentUrl(orderId, userId, req)

  return res.status(HTTP_STATUS.OK).json({
    message: 'Get payment URL successfully',
    result
  })
}
