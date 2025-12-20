import { Router } from 'express'
import { vnpayReturnController, vnpayIpnController, momoReturnController, momoIpnController, payOSIpnController, payOSReturnController } from '~/controllers/payment.controllers'
import { wrapRequestHandler } from '~/utils/handlers'

const paymentRouter = Router()

// VNPay Routes
paymentRouter.get('/vnpay-return', wrapRequestHandler(vnpayReturnController))
paymentRouter.get('/vnpay-ipn', wrapRequestHandler(vnpayIpnController))

// Momo Routes
paymentRouter.get('/momo/return', wrapRequestHandler(momoReturnController))
paymentRouter.post('/momo/ipn', wrapRequestHandler(momoIpnController))

// PayOS Routes
paymentRouter.get('/payos/return', wrapRequestHandler(payOSReturnController))
paymentRouter.post('/payos/ipn', wrapRequestHandler(payOSIpnController))

export default paymentRouter
