import { Router } from 'express'
import {
  getRelatedController,
  getBoughtTogetherController,
  getTrendingController,
  getForYouController,
  getPostPurchaseController,
  getPharmacistSuggestionsController,
  getMLStatusController,
  getReplenishmentController,
  trackRecommendationEventController
} from '~/controllers/recommendations.controllers'
import { accessTokenValidator } from '~/middlewares/users.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const recommendationsRouter = Router()

/**
 * Description: Sản phẩm liên quan (TF-IDF + MMR diversity)
 * Path: /recommendations/related/:productId
 * Method: GET
 * Query: { limit?: number, diverse?: boolean, lambda_mmr?: number }
 * Auth: Public
 */
recommendationsRouter.get('/related/:productId', wrapRequestHandler(getRelatedController))

/**
 * Description: Thường mua kèm (FP-Growth → TF-IDF MMR fallback)
 * Path: /recommendations/bought-together/:productId
 * Method: GET
 * Query: { limit?: number }
 * Auth: Public
 */
recommendationsRouter.get('/bought-together/:productId', wrapRequestHandler(getBoughtTogetherController))

/**
 * Description: Xu hướng / Bán chạy (NMF)
 * Path: /recommendations/trending
 * Method: GET
 * Query: { categoryId?: string, limit?: number }
 * Auth: Public
 */
recommendationsRouter.get('/trending', wrapRequestHandler(getTrendingController))

/**
 * Description: Gợi ý cá nhân hoá (SVD → NMF fallback)
 * Path: /recommendations/for-you
 * Method: GET
 * Query: { limit?: number }
 * Auth: Required
 */
recommendationsRouter.get('/for-you', accessTokenValidator, wrapRequestHandler(getForYouController))

/**
 * Description: Gợi ý sau đặt hàng (Hybrid FP-Growth + TF-IDF MMR)
 * Path: /recommendations/post-purchase
 * Method: POST
 * Body: { productIds: string[] }
 * Auth: Public
 */
recommendationsRouter.post('/post-purchase', wrapRequestHandler(getPostPurchaseController))

/**
 * Description: Gợi ý cho Pharmacist (TF-IDF medical context + chronic disease boost + allergy filter)
 * Path: /recommendations/pharmacist
 * Method: POST
 * Body: { chronicDiseases?, allergies?, currentMedications?, prescriptionProductIds? }
 * Auth: Required (Pharmacist)
 */
recommendationsRouter.post('/pharmacist', accessTokenValidator, wrapRequestHandler(getPharmacistSuggestionsController))

/**
 * Description: Predictive Replenishment — sản phẩm cần mua lại theo chu kỳ
 * Path: /recommendations/replenishment
 * Method: GET
 * Query: { limit?: number }
 * Auth: Required
 */
recommendationsRouter.get('/replenishment', accessTokenValidator, wrapRequestHandler(getReplenishmentController))

/**
 * Description: Track recommendation click event (analytics, fire-and-forget)
 * Path: /recommendations/track
 * Method: POST
 * Body: { productId, algorithm, section, position }
 * Auth: Optional (userId từ token nếu có)
 */
recommendationsRouter.post('/track', wrapRequestHandler(trackRecommendationEventController))

/**
 * Description: ML service status (admin debug)
 * Path: /recommendations/ml-status
 * Method: GET
 * Auth: Public
 */
recommendationsRouter.get('/ml-status', wrapRequestHandler(getMLStatusController))

export default recommendationsRouter
