import { Router } from 'express'
import {
  createOrderController,
  getOrdersController,
  getOrderController,
  updateOrderStatusController,
  updatePaymentStatusController,
  getAllOrdersController,
  getOrderStatsController,
  getPaymentUrlController,
  cancelOwnOrderController
} from '~/controllers/orders.controllers'
import {
  createOrderValidator,
  updateOrderStatusValidator,
  updatePaymentStatusValidator,
  orderIdValidator
} from '~/middlewares/orders.middlewares'
import { accessTokenValidator, verifiedUserValidator } from '~/middlewares/users.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'
import { adminValidator, pharmacistOrAdminValidator } from '~/middlewares/common.middlewares'

const ordersRouter = Router()

ordersRouter.post(
  '/',
  accessTokenValidator,
  verifiedUserValidator,
  createOrderValidator,
  wrapRequestHandler(createOrderController)
)
ordersRouter.get('/', accessTokenValidator, verifiedUserValidator, wrapRequestHandler(getOrdersController))
ordersRouter.get('/admin/all', accessTokenValidator, verifiedUserValidator, adminValidator, wrapRequestHandler(getAllOrdersController))
ordersRouter.get(
  '/admin/stats',
  accessTokenValidator,
  verifiedUserValidator,
  adminValidator,
  wrapRequestHandler(getOrderStatsController)
)
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
  pharmacistOrAdminValidator,
  orderIdValidator,
  updateOrderStatusValidator,
  wrapRequestHandler(updateOrderStatusController)
)
ordersRouter.put(
  '/:orderId/payment',
  accessTokenValidator,
  verifiedUserValidator,
  pharmacistOrAdminValidator,
  orderIdValidator,
  updatePaymentStatusValidator,
  wrapRequestHandler(updatePaymentStatusController)
)
ordersRouter.put(
  '/:orderId/cancel',
  accessTokenValidator,
  verifiedUserValidator,
  orderIdValidator,
  wrapRequestHandler(cancelOwnOrderController)
)
ordersRouter.post(
  '/:orderId/payment-url',
  accessTokenValidator,
  verifiedUserValidator,
  orderIdValidator,
  wrapRequestHandler(getPaymentUrlController)
)
export default ordersRouter
