import { Router } from 'express'
import {
  createOrderController,
  getOrdersController,
  getOrderController,
  updateOrderStatusController,
  updatePaymentStatusController,
  getAllOrdersController,
  getOrderStatsController
} from '~/controllers/orders.controllers'
import { accessTokenValidator, verifiedUserValidator } from '~/middlewares/users.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const ordersRouter = Router()

ordersRouter.post('/', accessTokenValidator, verifiedUserValidator, wrapRequestHandler(createOrderController))
ordersRouter.get('/', accessTokenValidator, verifiedUserValidator, wrapRequestHandler(getOrdersController))
ordersRouter.get('/:orderId', accessTokenValidator, verifiedUserValidator, wrapRequestHandler(getOrderController))
ordersRouter.put(
  '/:orderId/status',
  accessTokenValidator,
  verifiedUserValidator,
  wrapRequestHandler(updateOrderStatusController)
)
ordersRouter.put(
  '/:orderId/payment',
  accessTokenValidator,
  verifiedUserValidator,
  wrapRequestHandler(updatePaymentStatusController)
)
ordersRouter.get('/admin/all', accessTokenValidator, verifiedUserValidator, wrapRequestHandler(getAllOrdersController))
ordersRouter.get(
  '/admin/stats',
  accessTokenValidator,
  verifiedUserValidator,
  wrapRequestHandler(getOrderStatsController)
)

export default ordersRouter
