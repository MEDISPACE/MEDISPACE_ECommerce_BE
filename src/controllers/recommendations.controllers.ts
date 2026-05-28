import { Request, Response } from 'express'
import { ObjectId } from 'mongodb'
import recommendationsService from '~/services/recommendations.services'
import databaseService from '~/services/database.services'

/**
 * GET /recommendations/related/:productId
 * San pham lien quan — dung tren ProductDetailPage
 */
export const getRelatedController = async (req: Request, res: Response) => {
  const { productId } = req.params
  const limit = Number(req.query.limit) || 8
  const result = await recommendationsService.getRelated(productId, limit)
  return res.json({ message: 'Get related products success', data: result })
}

/**
 * GET /recommendations/bought-together/:productId
 * Thuong mua kem — dung tren ProductDetailPage
 */
export const getBoughtTogetherController = async (req: Request, res: Response) => {
  const { productId } = req.params
  const limit = Number(req.query.limit) || 6
  const result = await recommendationsService.getBoughtTogether(productId, limit)
  return res.json({ message: 'Get bought together success', data: result })
}

/**
 * GET /recommendations/trending
 * Xu huong / ban chay — dung tren HomePage
 */
export const getTrendingController = async (req: Request, res: Response) => {
  const categoryId = req.query.categoryId as string | undefined
  const limit = Number(req.query.limit) || 12
  const result = await recommendationsService.getTrending(categoryId, limit)
  return res.json({ message: 'Get trending products success', data: result })
}

/**
 * GET /recommendations/for-you
 * Danh cho ban — dung tren HomePage (authenticated user)
 */
export const getForYouController = async (req: Request, res: Response) => {
  const userId = req.decoded_authorization?.userId as string
  const limit = Number(req.query.limit) || 12
  const result = await recommendationsService.getForYou(userId, limit)
  return res.json({ message: 'Get personalized recommendations success', data: result })
}

/**
 * POST /recommendations/post-purchase
 * Goi y sau dat hang — dung tren OrderSuccessPage
 * Body: { productIds: string[] }
 */
export const getPostPurchaseController = async (req: Request, res: Response) => {
  const { productIds } = req.body as { productIds: string[] }
  const limit = Number(req.query.limit) || 8
  const result = await recommendationsService.getPostPurchase(productIds || [], limit)
  return res.json({ message: 'Get post-purchase recommendations success', data: result })
}

/**
 * POST /recommendations/pharmacist
 * Goi y cho Pharmacist — dung tren Pharmacist Panel
 * Body: { chronicDiseases, allergies, currentMedications, prescriptionProductIds }
 */
export const getPharmacistSuggestionsController = async (req: Request, res: Response) => {
  const { chronicDiseases, allergies, currentMedications, prescriptionProductIds } = req.body
  const limit = Number(req.query.limit) || 10
  const result = await recommendationsService.getPharmacistSuggestions({
    chronicDiseases,
    allergies,
    currentMedications,
    prescriptionProductIds,
    limit
  })
  return res.json({ message: 'Get pharmacist suggestions success', data: result })
}

/**
 * GET /recommendations/ml-status
 * Kiem tra ML service status (admin debug)
 */
export const getMLStatusController = async (req: Request, res: Response) => {
  const status = await recommendationsService.getMLStatus()
  return res.json({ message: 'ML service status', data: status })
}

/**
 * GET /recommendations/replenishment
 * Gợi ý mua lại theo chu kỳ — Predictive Replenishment (requires auth)
 */
export const getReplenishmentController = async (req: Request, res: Response) => {
  const userId = req.decoded_authorization?.userId as string
  const limit = Number(req.query.limit) || 5
  const result = await recommendationsService.getReplenishment(userId, limit)
  return res.json({ message: 'Get replenishment recommendations success', data: result })
}

/**
 * POST /recommendations/track
 * Ghi nhận sự kiện click vào một recommendation (analytics).
 * Fire-and-forget — FE không cần đợi response.
 * Body: { productId, algorithm, section, position }
 */
export const trackRecommendationEventController = async (req: Request, res: Response) => {
  const { productId, algorithm, section, position } = req.body as {
    productId: string
    algorithm: string
    section: string   // 'trending' | 'related' | 'bought-together' | 'for-you' | 'post-purchase' | 'replenishment'
    position: number  // index trong carousel (0-based)
  }
  const userId = req.decoded_authorization?.userId

  // Validate productId
  if (!productId) {
    return res.status(400).json({ message: 'productId is required' })
  }

  try {
    await databaseService.db.collection('recommendationEvents').insertOne({
      userId: userId ? new ObjectId(userId as string) : null,
      productId: new ObjectId(productId),
      algorithm: algorithm || 'unknown',
      section: section || 'unknown',
      position: typeof position === 'number' ? position : -1,
      eventType: 'click',
      timestamp: new Date()
    })
  } catch {
    // Graceful — tracking failure không được ảnh hưởng UX
  }

  return res.json({ message: 'tracked' })
}
