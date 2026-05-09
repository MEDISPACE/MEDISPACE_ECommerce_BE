import { Request, Response } from 'express'
import recommendationsService from '~/services/recommendations.services'

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
