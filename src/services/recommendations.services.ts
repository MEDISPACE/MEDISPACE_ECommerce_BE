import axios from 'axios'
import { ObjectId } from 'mongodb'
import { randomUUID } from 'crypto'
import databaseService from './database.services'
import cacheService from './cache.services'
import recommendationPolicyService, {
  RecommendationCandidate,
  RecommendationPolicyContext
} from './recommendation-policy.services'

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8002'
const ML_SERVICE_TOKEN = process.env.ML_SERVICE_TOKEN || (process.env.NODE_ENV === 'production' ? '' : 'medispace-local-ml-token')
const ML_TIMEOUT_MS = 3000 // 3s timeout, sau đó dùng fallback
const CANDIDATE_POOL_MULTIPLIER = 3
const DEFAULT_EXPERIMENT_ID = process.env.RECOMMENDATION_EXPERIMENT_ID || 'recommendation-platform-v2-control'
const DEFAULT_MODEL_VERSION = process.env.RECOMMENDATION_MODEL_VERSION || 'fallback-v1'

interface MLRecommendationResponse {
  algorithm: string
  products: Array<string | RecommendationCandidate>
  model_version?: string
  source?: string
}

const normalizeCandidates = (products: Array<string | RecommendationCandidate> = []): RecommendationCandidate[] =>
  products.map((product, index) => typeof product === 'string'
    ? { productId: product, score: Math.max(0, 1 - index / Math.max(products.length, 1)) }
    : product)

const recommendationResult = (
  algorithm: string,
  products: any[],
  metadata: { modelVersion?: string; experimentId?: string } = {}
) => {
  const requestId = randomUUID()
  const attributionToken = randomUUID()
  const variant = parseInt(attributionToken.replace(/-/g, '').slice(-2), 16) % 2 === 0 ? 'control' : 'diversified'
  const rankedProducts = variant === 'diversified' ? diversifyByCategory(products) : products
  const uniqueCategories = new Set(rankedProducts.map((product) => product.category?.[0]?.name).filter(Boolean)).size
  const diversity = rankedProducts.length > 0 ? uniqueCategories / rankedProducts.length : 0
  const novelty = rankedProducts.length > 0
    ? rankedProducts.reduce((sum, product) => sum + 1 / (1 + Math.log1p(product.reviewCount || 0)), 0) / rankedProducts.length
    : 0
  void databaseService.db.collection('recommendationQualityEvents').insertOne({
    requestId,
    attributionToken,
    algorithm,
    modelVersion: metadata.modelVersion || DEFAULT_MODEL_VERSION,
    experimentId: metadata.experimentId || DEFAULT_EXPERIMENT_ID,
    variant,
    resultCount: rankedProducts.length,
    diversity,
    novelty,
    timestamp: new Date()
  }).catch(() => {})
  return {
    requestId,
    attributionToken,
    algorithm,
    modelVersion: metadata.modelVersion || DEFAULT_MODEL_VERSION,
    experiment: {
      id: metadata.experimentId || DEFAULT_EXPERIMENT_ID,
      variant
    },
    products: rankedProducts
  }
}

const diversifyByCategory = (products: any[]) => {
  const groups = new Map<string, any[]>()
  for (const product of products) {
    const category = product.category?.[0]?.name || 'uncategorized'
    groups.set(category, [...(groups.get(category) || []), product])
  }
  const diversified: any[] = []
  while (diversified.length < products.length) {
    for (const group of groups.values()) {
      const product = group.shift()
      if (product) diversified.push(product)
    }
  }
  return diversified
}

// ─── Circuit Breaker ────────────────────────────────────────────────────────
/**
 * Circuit breaker đơn giản để tránh tốn 3s timeout mỗi request
 * khi ML service đang down hoặc retraining.
 *
 * State machine:
 *   CLOSED  → gọi bình thường
 *   OPEN    → skip ML, dùng fallback ngay (tiết kiệm 3s/request)
 *   HALF_OPEN → thử lại 1 request để test ML đã recover chưa
 */
class MLCircuitBreaker {
  private failures = 0
  private readonly failureThreshold = 3
  private readonly cooldownMs = 30_000 // 30s
  private lastFailureAt = 0
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'

  async call<T>(fn: () => Promise<T>): Promise<T | null> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureAt > this.cooldownMs) {
        this.state = 'HALF_OPEN'
        console.info('[CircuitBreaker] ML service → HALF_OPEN, testing...')
      } else {
        return null // skip ML call, use fallback immediately
      }
    }

    try {
      const result = await fn()
      if (this.state === 'HALF_OPEN') {
        console.info('[CircuitBreaker] ML service recovered → CLOSED')
      }
      this.reset()
      return result
    } catch (err) {
      this.recordFailure()
      return null
    }
  }

  private recordFailure() {
    this.failures++
    this.lastFailureAt = Date.now()
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN'
      console.warn(`[CircuitBreaker] ML service → OPEN after ${this.failures} failures`)
    }
  }

  private reset() {
    this.failures = 0
    this.state = 'CLOSED'
  }

  get isOpen() {
    return this.state === 'OPEN'
  }
}

const circuitBreaker = new MLCircuitBreaker()

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Gọi ML service qua circuit breaker.
 * Nếu ML down/timeout → trả về null để trigger fallback.
 */
async function callML<T = string[]>(path: string): Promise<T | null> {
  return circuitBreaker.call(async () => {
    const res = await axios.get(`${ML_SERVICE_URL}${path}`, {
      timeout: ML_TIMEOUT_MS,
      headers: ML_SERVICE_TOKEN ? { 'x-service-token': ML_SERVICE_TOKEN } : undefined
    })
    return res.data as T
  }).catch(() => {
    console.warn(`[Recommendations] ML call failed: ${path}`)
    return null
  })
}

async function callMLPost<T>(path: string, body: unknown): Promise<T | null> {
  return circuitBreaker.call(async () => {
    const res = await axios.post(`${ML_SERVICE_URL}${path}`, body, {
      timeout: ML_TIMEOUT_MS,
      headers: ML_SERVICE_TOKEN ? { 'x-service-token': ML_SERVICE_TOKEN } : undefined
    })
    return res.data as T
  }).catch(() => null)
}

/**
 * Validate xem một string có phải ObjectId hợp lệ không.
 */
function isValidObjectId(id: string): boolean {
  try {
    new ObjectId(id)
    return true
  } catch {
    return false
  }
}

/**
 * Enrich danh sách productIds thành full product objects.
 * Giữ nguyên thứ tự từ ML service (đã rank theo relevance).
 */
async function enrichProductIds(
  rawCandidates: Array<string | RecommendationCandidate>,
  limit?: number,
  options: RecommendationPolicyContext = {}
): Promise<any[]> {
  const enriched = await recommendationPolicyService.apply(normalizeCandidates(rawCandidates), options)
  return limit === undefined ? enriched : enriched.slice(0, limit)
}

const productObjectId = (product: any) => product?._id?.toString?.() || String(product?._id || '')

async function getBackfillCandidates(
  needed: number,
  excludedProductIds: string[] = [],
  categoryId?: string
): Promise<RecommendationCandidate[]> {
  if (needed <= 0) return []
  try {
    const excludedObjectIds = excludedProductIds.filter(isValidObjectId).map((id) => new ObjectId(id))
    const filter: Record<string, unknown> = {
      isActive: true,
      stockQuantity: { $gt: 0 },
      requiresPrescription: { $ne: true }
    }
    if (excludedObjectIds.length > 0) filter._id = { $nin: excludedObjectIds }
    if (categoryId && isValidObjectId(categoryId)) filter.categoryId = new ObjectId(categoryId)

    const products = await databaseService.products
      .find(filter)
      .sort({ rating: -1, reviewCount: -1 })
      .limit(needed * CANDIDATE_POOL_MULTIPLIER)
      .project({ _id: 1 })
      .toArray()

    return products.map((product, index) => ({
      productId: productObjectId(product),
      score: Math.max(0, 0.05 - index * 0.001),
      reason: 'Catalog backfill after recommendation policy filtering',
      evidence: ['catalog_backfill']
    }))
  } catch {
    return []
  }
}

async function enrichAndBackfill(
  rawCandidates: Array<string | RecommendationCandidate>,
  limit: number,
  options: RecommendationPolicyContext = {},
  backfillCategoryId?: string
): Promise<any[]> {
  const enriched = await enrichProductIds(rawCandidates, undefined, options)
  if (enriched.length >= limit) return enriched.slice(0, limit)

  const excluded = new Set<string>([
    ...(options.excludedProductIds || []),
    ...normalizeCandidates(rawCandidates).map((candidate) => candidate.productId),
    ...enriched.map(productObjectId)
  ].filter(Boolean))
  const backfillCandidates = await getBackfillCandidates(limit - enriched.length, [...excluded], backfillCategoryId)
  const backfilled = await enrichProductIds(backfillCandidates, undefined, options)
  const seen = new Set<string>()
  return [...enriched, ...backfilled]
    .filter((product) => {
      const id = productObjectId(product)
      if (!id || seen.has(id)) return false
      seen.add(id)
      return true
    })
    .slice(0, limit)
}

/**
 * Fallback: lấy sản phẩm bán chạy theo rating khi ML service down.
 */
async function getFallbackTrending(limit: number = 12): Promise<any[]> {
  return databaseService.products
    .find({ isActive: true, stockQuantity: { $gt: 0 }, requiresPrescription: { $ne: true } })
    .sort({ rating: -1, reviewCount: -1 })
    .limit(limit)
    .project({
      _id: 1, name: 1, slug: 1, featuredImage: 1,
      priceVariants: 1, rating: 1, reviewCount: 1, stockQuantity: 1, requiresPrescription: 1
    })
    .toArray()
}

// ─── Service ──────────────────────────────────────────────────────────────────

class RecommendationsService {
  async recordRealtimeEvent(userId?: string) {
    if (!userId || !isValidObjectId(userId)) return
    await callMLPost('/events/invalidate-user', { user_id: userId })
  }

  async notifyCatalogChanged() {
    await callMLPost('/train', {})
    await cacheService.invalidate('recommendations:*')
  }

  async getPopular(limit: number = 12) {
    const products = await getFallbackTrending(limit)
    return recommendationResult('popular_rating_reviews', products)
  }

  /**
   * GET /recommendations/related/:productId
   * Sản phẩm liên quan — TF-IDF Content-Based
   */
  async getRelated(productId: string, limit: number = 8, diverse: boolean = true, lambdaMmr: number = 0.7) {
    if (!isValidObjectId(productId)) {
      return recommendationResult('fallback_invalid_id', [])
    }

    const poolLimit = Math.min(limit * CANDIDATE_POOL_MULTIPLIER, 36)
    const data = await callML<MLRecommendationResponse>(
      `/recommend/related/${productId}?limit=${poolLimit}&diverse=${diverse}&lambda_mmr=${lambdaMmr}`
    )

    if (!data || data.products.length === 0) {
      // Fallback: lấy sản phẩm cùng category
      const product = await databaseService.products.findOne({ _id: new ObjectId(productId) })
      if (!product) return recommendationResult('fallback_empty', [])

      const fallback = await databaseService.products
        .find({
          categoryId: product.categoryId,
          isActive: true,
          stockQuantity: { $gt: 0 },
          requiresPrescription: { $ne: true },
          _id: { $ne: product._id }
        })
        .limit(limit)
        .project({
          _id: 1, name: 1, slug: 1, featuredImage: 1, priceVariants: 1,
          rating: 1, reviewCount: 1, stockQuantity: 1, requiresPrescription: 1
        })
        .toArray()
      return recommendationResult('fallback_category', fallback)
    }

    const enriched = await enrichAndBackfill(data.products, limit)
    return recommendationResult(data.algorithm, enriched, { modelVersion: data.model_version })
  }

  /**
   * GET /recommendations/bought-together/:productId
   * Thường mua kèm — FP-Growth Association Rules
   */
  async getBoughtTogether(productId: string, limit: number = 6) {
    if (!isValidObjectId(productId)) {
      return recommendationResult('fallback_invalid_id', [])
    }

    const poolLimit = Math.min(limit * CANDIDATE_POOL_MULTIPLIER, 30)
    const data = await callML<MLRecommendationResponse>(
      `/recommend/bought-together/${productId}?limit=${poolLimit}`
    )

    if (!data || data.products.length === 0) {
      return recommendationResult('fallback_empty', [])
    }

    const enriched = await enrichAndBackfill(data.products, limit)
    return recommendationResult(data.algorithm, enriched, { modelVersion: data.model_version })
  }

  /**
   * GET /recommendations/trending
   * Xu hướng / bán chạy — NMF
   */
  async getTrending(categoryId?: string, limit: number = 12) {
    if (categoryId && !isValidObjectId(categoryId)) {
      return recommendationResult('fallback_invalid_category', [])
    }
    const cacheKey = `recommendations:trending:${categoryId || 'all'}:${limit}`
    const payload = await cacheService.getOrSet(cacheKey, async () => {
      const poolLimit = Math.min(limit * CANDIDATE_POOL_MULTIPLIER, 60)
      const query = categoryId ? `?category_id=${categoryId}&limit=${poolLimit}` : `?limit=${poolLimit}`
      const data = await callML<MLRecommendationResponse>(`/recommend/trending${query}`)

      if (!data || data.products.length === 0) {
        const filter: Record<string, unknown> = {
          isActive: true,
          stockQuantity: { $gt: 0 },
          requiresPrescription: { $ne: true }
        }
        if (categoryId && isValidObjectId(categoryId)) filter.categoryId = new ObjectId(categoryId)
        const fallback = await databaseService.products
          .find(filter)
          .sort({ rating: -1, reviewCount: -1 })
          .limit(limit)
          .project({
            _id: 1, name: 1, slug: 1, featuredImage: 1, priceVariants: 1,
            rating: 1, reviewCount: 1, stockQuantity: 1, requiresPrescription: 1
          })
          .toArray()
        return { algorithm: 'fallback_rating', products: fallback, modelVersion: DEFAULT_MODEL_VERSION }
      }

      const enriched = await enrichAndBackfill(data.products, limit, {}, categoryId)
      return { algorithm: data.algorithm, products: enriched, modelVersion: data.model_version }
    }, 300) // 5 phút
    return recommendationResult(payload.algorithm, payload.products, { modelVersion: payload.modelVersion })
  }

  /**
   * GET /recommendations/for-you
   * Dành cho bạn — SVD → NMF fallback (personalized)
   */
  async getForYou(userId: string, limit: number = 12) {
    if (!isValidObjectId(userId)) {
      const fallback = await getFallbackTrending(limit)
      return recommendationResult('fallback_invalid_user', fallback)
    }

    const poolLimit = Math.min(limit * CANDIDATE_POOL_MULTIPLIER, 60)
    const data = await callML<MLRecommendationResponse>(
      `/recommend/for-you/${userId}?limit=${poolLimit}`
    )

    if (!data || data.products.length === 0) {
      const fallback = await getFallbackTrending(limit)
      return recommendationResult('fallback_rating', fallback)
    }

    const enriched = await enrichAndBackfill(data.products, limit)
    return recommendationResult(data.algorithm, enriched, { modelVersion: data.model_version })
  }

  /**
   * POST /recommendations/post-purchase
   * Gợi ý sau đặt hàng — Hybrid (FP-Growth + TF-IDF)
   */
  async getPostPurchase(orderProductIds: string[], limit: number = 8) {
    if (!orderProductIds || orderProductIds.length === 0) {
      const fallback = await getFallbackTrending(limit)
      return recommendationResult('fallback_rating', fallback)
    }

    // Lọc các ID không hợp lệ trước khi gửi ML
    const validIds = orderProductIds.filter(isValidObjectId)
    if (validIds.length === 0) {
      return recommendationResult('fallback_empty', [])
    }

    const data = await callMLPost<MLRecommendationResponse>(
      '/recommend/post-purchase',
      { product_ids: validIds, limit: Math.min(limit * CANDIDATE_POOL_MULTIPLIER, 36) }
    )

    if (!data || data.products.length === 0) {
      return recommendationResult('fallback_empty', [])
    }

    const enriched = await enrichAndBackfill(data.products, limit, { excludedProductIds: validIds })
    return recommendationResult(data.algorithm, enriched, { modelVersion: data.model_version })
  }

  /**
   * POST /recommendations/pharmacist
   * Gợi ý cho Pharmacist — TF-IDF medical context
   */
  async getPharmacistSuggestions({
    chronicDiseases = [],
    allergies = [],
    currentMedications = [],
    prescriptionProductIds = [],
    limit = 10
  }: {
    chronicDiseases?: string[]
    allergies?: string[]
    currentMedications?: string[]
    prescriptionProductIds?: string[]
    limit?: number
  }) {
    const sanitizeMedicalTerms = (values: unknown) =>
      Array.isArray(values)
        ? values.filter((v): v is string => typeof v === 'string').map((v) => v.trim().slice(0, 100)).filter(Boolean).slice(0, 50)
        : []
    chronicDiseases = sanitizeMedicalTerms(chronicDiseases)
    allergies = sanitizeMedicalTerms(allergies)
    currentMedications = sanitizeMedicalTerms(currentMedications)
    prescriptionProductIds = Array.isArray(prescriptionProductIds)
      ? prescriptionProductIds.filter((v) => typeof v === 'string' && isValidObjectId(v)).slice(0, 50)
      : []
    const data = await callMLPost<MLRecommendationResponse>(
      '/recommend/pharmacist',
      {
        chronic_diseases: chronicDiseases,
        allergies,
        current_medications: currentMedications,
        prescription_product_ids: prescriptionProductIds,
        limit: Math.min(limit * CANDIDATE_POOL_MULTIPLIER, 45)
      }
    )

    if (!data || data.products.length === 0) {
      return recommendationResult('fallback_empty', [])
    }

    const enriched = await enrichAndBackfill(data.products, limit, {
      audience: 'pharmacist',
      allergies,
      chronicDiseases,
      currentMedications,
      excludedProductIds: prescriptionProductIds
    })
    return recommendationResult(data.algorithm, enriched, { modelVersion: data.model_version })
  }

  /**
   * GET /recommendations/replenishment
   * Predictive Replenishment — sản phẩm cần mua lại theo chu kỳ
   */
  async getReplenishment(userId: string, limit: number = 5) {
    if (!isValidObjectId(userId)) {
      return recommendationResult('fallback_invalid_user', [])
    }

    const poolLimit = Math.min(limit * CANDIDATE_POOL_MULTIPLIER, 24)
    const data = await callML<MLRecommendationResponse>(
      `/recommend/replenishment/${userId}?limit=${poolLimit}`
    )

    if (!data || data.products.length === 0) {
      return recommendationResult('fallback_empty', [])
    }

    const enriched = await enrichProductIds(data.products, limit)
    return recommendationResult(data.algorithm, enriched, { modelVersion: data.model_version })
  }

  /**
   * GET /recommendations/ml-status
   * Kiểm tra ML service status (admin/debug)
   */
  async getMLStatus() {
    const data = await callML<any>('/')
    return data || {
      status: 'unavailable',
      circuit_breaker: circuitBreaker.isOpen ? 'OPEN' : 'CLOSED',
      models: {}
    }
  }
}

const recommendationsService = new RecommendationsService()
export default recommendationsService
