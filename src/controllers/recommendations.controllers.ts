import { Request, Response } from 'express'
import { ObjectId } from 'mongodb'
import { randomUUID } from 'crypto'
import recommendationsService from '~/services/recommendations.services'
import databaseService from '~/services/database.services'

const parseLimit = (value: unknown, fallback: number, max: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.trunc(parsed), 1), max)
}

/**
 * GET /recommendations/related/:productId
 * San pham lien quan — dung tren ProductDetailPage
 */
export const getRelatedController = async (req: Request, res: Response) => {
  const productId = Array.isArray(req.params.productId) ? req.params.productId[0] : req.params.productId
  const limit = parseLimit(req.query.limit, 8, 12)
  const diverse = req.query.diverse !== 'false'
  const rawLambda = Number(req.query.lambda_mmr)
  const lambdaMmr = Number.isFinite(rawLambda) ? Math.min(Math.max(rawLambda, 0), 1) : 0.7
  const result = await recommendationsService.getRelated(productId, limit, diverse, lambdaMmr)
  return res.json({ message: 'Get related products success', data: result })
}

/**
 * GET /recommendations/bought-together/:productId
 * Thuong mua kem — dung tren ProductDetailPage
 */
export const getBoughtTogetherController = async (req: Request, res: Response) => {
  const productId = Array.isArray(req.params.productId) ? req.params.productId[0] : req.params.productId
  const limit = parseLimit(req.query.limit, 6, 10)
  const result = await recommendationsService.getBoughtTogether(productId, limit)
  return res.json({ message: 'Get bought together success', data: result })
}

/**
 * GET /recommendations/trending
 * Xu huong / ban chay — dung tren HomePage
 */
export const getTrendingController = async (req: Request, res: Response) => {
  const categoryId = req.query.categoryId as string | undefined
  const limit = parseLimit(req.query.limit, 12, 20)
  const result = await recommendationsService.getTrending(categoryId, limit)
  return res.json({ message: 'Get trending products success', data: result })
}

export const getPopularController = async (req: Request, res: Response) => {
  const limit = parseLimit(req.query.limit, 12, 20)
  const result = await recommendationsService.getPopular(limit)
  return res.json({ message: 'Get popular products success', data: result })
}

/**
 * GET /recommendations/for-you
 * Danh cho ban — dung tren HomePage (authenticated user)
 */
export const getForYouController = async (req: Request, res: Response) => {
  const userId = req.decoded_authorization?.userId as string
  const limit = parseLimit(req.query.limit, 12, 20)
  const result = await recommendationsService.getForYou(userId, limit)
  return res.json({ message: 'Get personalized recommendations success', data: result })
}

/**
 * POST /recommendations/post-purchase
 * Goi y sau dat hang — dung tren OrderSuccessPage
 * Body: { productIds: string[] }
 */
export const getPostPurchaseController = async (req: Request, res: Response) => {
  const productIds = Array.isArray(req.body?.productIds)
    ? req.body.productIds.filter((id: unknown): id is string => typeof id === 'string').slice(0, 50)
    : []
  const limit = parseLimit(req.query.limit, 8, 12)
  const result = await recommendationsService.getPostPurchase(productIds, limit)
  return res.json({ message: 'Get post-purchase recommendations success', data: result })
}

/**
 * POST /recommendations/pharmacist
 * Goi y cho Pharmacist — dung tren Pharmacist Panel
 * Body: { chronicDiseases, allergies, currentMedications, prescriptionProductIds }
 */
export const getPharmacistSuggestionsController = async (req: Request, res: Response) => {
  const { chronicDiseases, allergies, currentMedications, prescriptionProductIds } = req.body
  const limit = parseLimit(req.query.limit, 10, 15)
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
  const limit = parseLimit(req.query.limit, 5, 8)
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
  const { productId, algorithm, section, position, eventType, requestId, attributionToken, modelVersion, experimentId, experimentVariant, value } = req.body as {
    productId: string
    algorithm: string
    section: string   // 'trending' | 'related' | 'bought-together' | 'for-you' | 'post-purchase' | 'replenishment'
    position: number  // index trong carousel (0-based)
    eventType?: string
    requestId?: string
    attributionToken?: string
    modelVersion?: string
    experimentId?: string
    experimentVariant?: string
    value?: number
  }
  const userId = req.decoded_authorization?.userId

  // Validate productId
  if (!productId || !ObjectId.isValid(productId)) {
    return res.status(400).json({ message: 'A valid productId is required' })
  }

  try {
    const allowedSections = new Set([
      'trending', 'related', 'bundle', 'bought-together', 'for-you',
      'post-purchase', 'replenishment', 'recommendation'
    ])
    const allowedEventTypes = new Set(['impression', 'click', 'add_to_cart', 'purchase', 'dismiss', 'snooze'])
    await databaseService.db.collection('recommendationEvents').insertOne({
      userId: userId ? new ObjectId(userId as string) : null,
      productId: new ObjectId(productId),
      algorithm: typeof algorithm === 'string' ? algorithm.slice(0, 64) : 'unknown',
      section: allowedSections.has(section) ? section : 'unknown',
      position: typeof position === 'number' ? Math.min(Math.max(Math.trunc(position), 0), 100) : -1,
      eventType: allowedEventTypes.has(eventType || '') ? eventType : 'click',
      requestId: typeof requestId === 'string' ? requestId.slice(0, 128) : null,
      attributionToken: typeof attributionToken === 'string' ? attributionToken.slice(0, 256) : null,
      modelVersion: typeof modelVersion === 'string' ? modelVersion.slice(0, 128) : null,
      experimentId: typeof experimentId === 'string' ? experimentId.slice(0, 128) : null,
      experimentVariant: typeof experimentVariant === 'string' ? experimentVariant.slice(0, 64) : null,
      value: Number.isFinite(value) ? Math.max(Number(value), 0) : null,
      timestamp: new Date()
    })
    void recommendationsService.recordRealtimeEvent(userId as string | undefined)
  } catch {
    // Graceful — tracking failure không được ảnh hưởng UX
  }

  return res.json({ message: 'tracked' })
}

export const getRecommendationMetricsController = async (_req: Request, res: Response) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const rows = await databaseService.db.collection('recommendationEvents').aggregate([
    { $match: { timestamp: { $gte: since } } },
    {
      $group: {
        _id: { section: '$section', experimentId: '$experimentId', experimentVariant: '$experimentVariant', eventType: '$eventType' },
        count: { $sum: 1 },
        value: { $sum: { $cond: [{ $eq: ['$eventType', 'purchase'] }, { $ifNull: ['$value', 0] }, 0] } }
      }
    }
  ]).toArray()
  const safetyIncidents = await databaseService.db.collection('recommendationSafetyEvents').aggregate([
    { $match: { timestamp: { $gte: since } } },
    { $group: { _id: '$reason', count: { $sum: 1 } } }
  ]).toArray()
  const quality = await databaseService.db.collection('recommendationQualityEvents').aggregate([
    { $match: { timestamp: { $gte: since } } },
    {
      $group: {
        _id: { algorithm: '$algorithm', variant: '$variant' },
        requests: { $sum: 1 },
        averageResultCount: { $avg: '$resultCount' },
        averageDiversity: { $avg: '$diversity' },
        averageNovelty: { $avg: '$novelty' }
      }
    }
  ]).toArray()
  const bySegment = new Map<string, Record<string, number>>()
  for (const row of rows) {
    const key = `${row._id.section}:${row._id.experimentId || 'none'}:${row._id.experimentVariant || 'unknown'}`
    const segment = bySegment.get(key) || { impression: 0, click: 0, add_to_cart: 0, purchase: 0, revenue: 0 }
    segment[row._id.eventType] = row.count
    segment.revenue += row.value || 0
    bySegment.set(key, segment)
  }
  const metrics = [...bySegment.entries()].map(([segment, values]) => ({
    segment,
    ...values,
    ctr: values.impression > 0 ? values.click / values.impression : 0,
    addToCartRate: values.impression > 0 ? values.add_to_cart / values.impression : 0,
    conversionRate: values.impression > 0 ? values.purchase / values.impression : 0
  }))
  return res.json({ message: 'Recommendation metrics', data: { requestId: randomUUID(), since, metrics, quality, safetyIncidents } })
}
