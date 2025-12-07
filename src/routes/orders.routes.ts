import { Router } from 'express'
import {
  createOrderController,
  getOrdersController,
  getOrderController,
  updateOrderStatusController,
  updatePaymentStatusController,
  getAllOrdersController,
  getOrderStatsController,
  getPaymentUrlController
} from '~/controllers/orders.controllers'
import {
  createOrderValidator,
  updateOrderStatusValidator,
  updatePaymentStatusValidator,
  orderIdValidator
} from '~/middlewares/orders.middlewares'
import { accessTokenValidator, verifiedUserValidator } from '~/middlewares/users.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const ordersRouter = Router()

ordersRouter.post(
  '/',
  accessTokenValidator,
  verifiedUserValidator,
  createOrderValidator,
  wrapRequestHandler(createOrderController)
)
ordersRouter.get('/', accessTokenValidator, verifiedUserValidator, wrapRequestHandler(getOrdersController))
ordersRouter.get(
  '/:orderId',
  accessTokenValidator,
  verifiedUserValidator,
  orderIdValidator,
  wrapRequestHandler(getOrderController)
)
ordersRouter.put(
  '/:orderId/status',
  accessTokenValidator,
  verifiedUserValidator,
  orderIdValidator,
  updateOrderStatusValidator,
  wrapRequestHandler(updateOrderStatusController)
)
ordersRouter.put(
  '/:orderId/payment',
  accessTokenValidator,
  verifiedUserValidator,
  orderIdValidator,
  updatePaymentStatusValidator,
  wrapRequestHandler(updatePaymentStatusController)
)
ordersRouter.post(
  '/:orderId/payment-url',
  accessTokenValidator,
  verifiedUserValidator,
  orderIdValidator,
  wrapRequestHandler(getPaymentUrlController)
)
ordersRouter.get('/admin/all', accessTokenValidator, verifiedUserValidator, wrapRequestHandler(getAllOrdersController))
ordersRouter.get(
  '/admin/stats',
  accessTokenValidator,
  verifiedUserValidator,
  wrapRequestHandler(getOrderStatsController)
)

export default ordersRouter
