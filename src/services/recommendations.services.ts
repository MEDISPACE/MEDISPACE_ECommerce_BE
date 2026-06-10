import axios from 'axios'
import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import cacheService from './cache.services'

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8002'
const ML_SERVICE_TOKEN = process.env.ML_SERVICE_TOKEN || 'medispace-local-ml-token'
const ML_TIMEOUT_MS = 3000 // 3s timeout, sau đó dùng fallback

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
  productIds: string[],
  limit?: number,
  options: { allowPrescription?: boolean } = {}
): Promise<any[]> {
  if (!productIds || productIds.length === 0) return []

  // Validate và convert sang ObjectId — loại bỏ ID không hợp lệ
  const ids = productIds.filter(isValidObjectId).map((id) => new ObjectId(id))

  if (ids.length === 0) return []

  const productFilter: Record<string, unknown> = {
    _id: { $in: ids },
    isActive: true,
    stockQuantity: { $gt: 0 }
  }
  if (!options.allowPrescription) {
    productFilter.requiresPrescription = { $ne: true }
  }

  const products = await databaseService.products
    .aggregate([
      { $match: productFilter },
      {
        $lookup: {
          from: 'categories',
          localField: 'categoryId',
          foreignField: '_id',
          as: 'category'
        }
      },
      {
        $lookup: {
          from: 'brands',
          localField: 'brandId',
          foreignField: '_id',
          as: 'brand'
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          slug: 1,
          featuredImage: 1,
          priceVariants: 1,
          rating: 1,
          reviewCount: 1,
          stockQuantity: 1,
          requiresPrescription: 1,
          'category.name': 1,
          'brand.name': 1
        }
      }
    ])
    .toArray()

  // Giữ nguyên thứ tự từ ML service (đã được rank theo relevance)
  const productMap = new Map(products.map((p) => [p._id.toString(), p]))
  const enriched = ids.map((id) => productMap.get(id.toString())).filter(Boolean)
  return limit === undefined ? enriched : enriched.slice(0, limit)
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
  /**
   * GET /recommendations/related/:productId
   * Sản phẩm liên quan — TF-IDF Content-Based
   */
  async getRelated(productId: string, limit: number = 8, diverse: boolean = true, lambdaMmr: number = 0.7) {
    if (!isValidObjectId(productId)) {
      return { algorithm: 'fallback_invalid_id', products: [] }
    }

    const data = await callML<{ algorithm: string; products: string[] }>(
      `/recommend/related/${productId}?limit=${limit}&diverse=${diverse}&lambda_mmr=${lambdaMmr}`
    )

    if (!data || data.products.length === 0) {
      // Fallback: lấy sản phẩm cùng category
      const product = await databaseService.products.findOne({ _id: new ObjectId(productId) })
      if (!product) return { algorithm: 'fallback_empty', products: [] }

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
      return { algorithm: 'fallback_category', products: fallback }
    }

    const enriched = await enrichProductIds(data.products, limit)
    return { algorithm: data.algorithm, products: enriched }
  }

  /**
   * GET /recommendations/bought-together/:productId
   * Thường mua kèm — FP-Growth Association Rules
   */
  async getBoughtTogether(productId: string, limit: number = 6) {
    if (!isValidObjectId(productId)) {
      return { algorithm: 'fallback_invalid_id', products: [] }
    }

    const data = await callML<{ algorithm: string; products: string[] }>(
      `/recommend/bought-together/${productId}?limit=${limit}`
    )

    if (!data || data.products.length === 0) {
      return { algorithm: 'fallback_empty', products: [] }
    }

    const enriched = await enrichProductIds(data.products, limit)
    return { algorithm: data.algorithm, products: enriched }
  }

  /**
   * GET /recommendations/trending
   * Xu hướng / bán chạy — NMF
   */
  async getTrending(categoryId?: string, limit: number = 12) {
    if (categoryId && !isValidObjectId(categoryId)) {
      return { algorithm: 'fallback_invalid_category', products: [] }
    }
    const cacheKey = `recommendations:trending:${categoryId || 'all'}:${limit}`
    return cacheService.getOrSet(cacheKey, async () => {
      const query = categoryId ? `?category_id=${categoryId}&limit=${limit}` : `?limit=${limit}`
      const data = await callML<{ algorithm: string; products: string[] }>(`/recommend/trending${query}`)

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
        return { algorithm: 'fallback_rating', products: fallback }
      }

      const enriched = await enrichProductIds(data.products, limit)
      return { algorithm: data.algorithm, products: enriched }
    }, 300) // 5 phút
  }

  /**
   * GET /recommendations/for-you
   * Dành cho bạn — SVD → NMF fallback (personalized)
   */
  async getForYou(userId: string, limit: number = 12) {
    if (!isValidObjectId(userId)) {
      const fallback = await getFallbackTrending(limit)
      return { algorithm: 'fallback_invalid_user', products: fallback }
    }

    const data = await callML<{ algorithm: string; products: string[] }>(
      `/recommend/for-you/${userId}?limit=${limit}`
    )

    if (!data || data.products.length === 0) {
      const fallback = await getFallbackTrending(limit)
      return { algorithm: 'fallback_rating', products: fallback }
    }

    const enriched = await enrichProductIds(data.products, limit)
    return { algorithm: data.algorithm, products: enriched }
  }

  /**
   * POST /recommendations/post-purchase
   * Gợi ý sau đặt hàng — Hybrid (FP-Growth + TF-IDF)
   */
  async getPostPurchase(orderProductIds: string[], limit: number = 8) {
    if (!orderProductIds || orderProductIds.length === 0) {
      const fallback = await getFallbackTrending(limit)
      return { algorithm: 'fallback_rating', products: fallback }
    }

    // Lọc các ID không hợp lệ trước khi gửi ML
    const validIds = orderProductIds.filter(isValidObjectId)
    if (validIds.length === 0) {
      return { algorithm: 'fallback_empty', products: [] }
    }

    const data = await callMLPost<{ algorithm: string; products: string[] }>(
      '/recommend/post-purchase',
      { product_ids: validIds, limit }
    )

    if (!data || data.products.length === 0) {
      return { algorithm: 'fallback_empty', products: [] }
    }

    const enriched = await enrichProductIds(data.products, limit)
    return { algorithm: data.algorithm, products: enriched }
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
    const data = await callMLPost<{ algorithm: string; products: string[] }>(
      '/recommend/pharmacist',
      {
        chronic_diseases: chronicDiseases,
        allergies,
        current_medications: currentMedications,
        prescription_product_ids: prescriptionProductIds,
        limit
      }
    )

    if (!data || data.products.length === 0) {
      return { algorithm: 'fallback_empty', products: [] }
    }

    const enriched = await enrichProductIds(data.products, limit, { allowPrescription: true })
    return { algorithm: data.algorithm, products: enriched }
  }

  /**
   * GET /recommendations/replenishment
   * Predictive Replenishment — sản phẩm cần mua lại theo chu kỳ
   */
  async getReplenishment(userId: string, limit: number = 5) {
    if (!isValidObjectId(userId)) {
      return { algorithm: 'fallback_invalid_user', products: [] }
    }

    const data = await callML<{ algorithm: string; products: string[] }>(
      `/recommend/replenishment/${userId}?limit=${limit}`
    )

    if (!data || data.products.length === 0) {
      return { algorithm: 'fallback_empty', products: [] }
    }

    const enriched = await enrichProductIds(data.products, limit)
    return { algorithm: data.algorithm, products: enriched }
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
