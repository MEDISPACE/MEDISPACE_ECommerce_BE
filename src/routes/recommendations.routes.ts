import { Router } from 'express'
import {
  getRelatedController,
  getBoughtTogetherController,
  getTrendingController,
  getForYouController,
  getPostPurchaseController,
  getPharmacistSuggestionsController,
  getMLStatusController
} from '~/controllers/recommendations.controllers'
import { accessTokenValidator } from '~/middlewares/users.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const recommendationsRouter = Router()

/**
 * Description: San pham lien quan (TF-IDF)
 * Path: /recommendations/related/:productId
 * Method: GET
 * Params: { productId: string }
 * Query: { limit?: number }
 * Auth: Public
 */
recommendationsRouter.get('/related/:productId', wrapRequestHandler(getRelatedController))

/**
 * Description: Thuong mua kem (FP-Growth)
 * Path: /recommendations/bought-together/:productId
 * Method: GET
 * Params: { productId: string }
 * Query: { limit?: number }
 * Auth: Public
 */
recommendationsRouter.get('/bought-together/:productId', wrapRequestHandler(getBoughtTogetherController))

/**
 * Description: Xu huong / Ban chay (NMF)
 * Path: /recommendations/trending
 * Method: GET
 * Query: { categoryId?: string, limit?: number }
 * Auth: Public
 */
recommendationsRouter.get('/trending', wrapRequestHandler(getTrendingController))

/**
 * Description: Goi y ca nhan hoa (SVD / NMF fallback)
 * Path: /recommendations/for-you
 * Method: GET
 * Query: { limit?: number }
 * Auth: Required (can userId tu token)
 */
recommendationsRouter.get('/for-you', accessTokenValidator, wrapRequestHandler(getForYouController))

/**
 * Description: Goi y sau dat hang (Hybrid)
 * Path: /recommendations/post-purchase
 * Method: POST
 * Body: { productIds: string[] }
 * Query: { limit?: number }
 * Auth: Public (FE tu lay productIds tu order)
 */
recommendationsRouter.post('/post-purchase', wrapRequestHandler(getPostPurchaseController))

/**
 * Description: Goi y cho Pharmacist dua tren medical context
 * Path: /recommendations/pharmacist
 * Method: POST
 * Body: { chronicDiseases?, allergies?, currentMedications?, prescriptionProductIds? }
 * Query: { limit?: number }
 * Auth: Required (Pharmacist only)
 */
recommendationsRouter.post('/pharmacist', accessTokenValidator, wrapRequestHandler(getPharmacistSuggestionsController))

/**
 * Description: Kiem tra ML service status (debug)
 * Path: /recommendations/ml-status
 * Method: GET
 * Auth: Public
 */
recommendationsRouter.get('/ml-status', wrapRequestHandler(getMLStatusController))

export default recommendationsRouter
