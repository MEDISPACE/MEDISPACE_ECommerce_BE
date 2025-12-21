import { Router } from 'express'
import { ghnController } from '~/controllers/ghn.controllers'
import { wrapRequestHandler } from '~/utils/handlers'

const ghnRouter = Router()

ghnRouter.get('/provinces', wrapRequestHandler(ghnController.getProvinces))
ghnRouter.get('/districts', wrapRequestHandler(ghnController.getDistricts))
ghnRouter.get('/wards', wrapRequestHandler(ghnController.getWards))
ghnRouter.post('/calculate-fee', wrapRequestHandler(ghnController.calculateFee))

export default ghnRouter
