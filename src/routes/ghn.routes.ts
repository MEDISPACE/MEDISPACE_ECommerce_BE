import { Router } from 'express'
import { ghnController } from '~/controllers/ghn.controllers'

const ghnRouter = Router()

ghnRouter.get('/provinces', ghnController.getProvinces)
ghnRouter.get('/districts', ghnController.getDistricts)
ghnRouter.get('/wards', ghnController.getWards)
ghnRouter.post('/calculate-fee', ghnController.calculateFee)
ghnRouter.post('/shipping-options', ghnController.getShippingOptions)

export default ghnRouter
