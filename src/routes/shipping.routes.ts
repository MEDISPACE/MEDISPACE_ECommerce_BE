import { Router } from 'express'
import { shippingController } from '~/controllers/shipping.controllers'
import { accessTokenValidator } from '~/middlewares/users.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const shippingRouter = Router()

shippingRouter.post('/rates', accessTokenValidator, wrapRequestHandler(shippingController.getRates))

export default shippingRouter
