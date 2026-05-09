import axios from 'axios'
import { ObjectId } from 'mongodb'
import databaseService from './database.services'

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8002'
const ML_TIMEOUT_MS = 3000 // 3s timeout, sau do dung fallback

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Goi ML service. Neu that bai (down/timeout) → tra ve [] de fallback
 */
async function callML<T = string[]>(path: string): Promise<T | null> {
  try {
    const res = await axios.get(`${ML_SERVICE_URL}${path}`, {
      timeout: ML_TIMEOUT_MS
    })
    return res.data as T
  } catch {
    console.warn(`[Recommendations] ML service unavailable: ${path}`)
    return null
  }
}

/**
 * Enrich danh sach productIds thanh full product objects
 * Lay name, thumbnail, basePrice, rating, slug de FE hien thi
 */
async function enrichProductIds(productIds: string[], limit?: number): Promise<any[]> {
  if (!productIds || productIds.length === 0) return []

  const ids = (limit ? productIds.slice(0, limit) : productIds).map((id) => {
    try {
      return new ObjectId(id)
    } catch {
      return null
    }
  }).filter(Boolean) as ObjectId[]

  if (ids.length === 0) return []

  const products = await databaseService.products
    .aggregate([
      { $match: { _id: { $in: ids }, isActive: true } },
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

  // Giu nguyen thu tu tu ML service (da duoc rank theo relevance)
  const productMap = new Map(products.map((p) => [p._id.toString(), p]))
  return ids.map((id) => productMap.get(id.toString())).filter(Boolean)
}

/**
 * Fallback: Lay san pham ban chay theo rating khi ML service down
 */
async function getFallbackTrending(limit: number = 12): Promise<any[]> {
  return databaseService.products
    .find({ isActive: true, stockQuantity: { $gt: 0 } })
    .sort({ rating: -1, reviewCount: -1 })
    .limit(limit)
    .project({ _id: 1, name: 1, slug: 1, featuredImage: 1, priceVariants: 1, rating: 1, reviewCount: 1, stockQuantity: 1 })
    .toArray()
}

// ─── Service Methods ──────────────────────────────────────────────────────────

class RecommendationsService {
  /**
   * GET /recommendations/related/:productId
   * San pham lien quan — TF-IDF
   */
  async getRelated(productId: string, limit: number = 8) {
    const data = await callML<{ algorithm: string; products: string[] }>(
      `/recommend/related/${productId}?limit=${limit}`
    )

    if (!data || data.products.length === 0) {
      // Fallback: lay cung category
      const product = await databaseService.products.findOne({ _id: new ObjectId(productId) })
      if (!product) return { algorithm: 'fallback_empty', products: [] }

      const fallback = await databaseService.products
        .find({ categoryId: product.categoryId, isActive: true, _id: { $ne: product._id } })
        .limit(limit)
        .project({ _id: 1, name: 1, slug: 1, featuredImage: 1, priceVariants: 1, rating: 1, stockQuantity: 1 })
        .toArray()
      return { algorithm: 'fallback_category', products: fallback }
    }

    const enriched = await enrichProductIds(data.products, limit)
    return { algorithm: data.algorithm, products: enriched }
  }

  /**
   * GET /recommendations/bought-together/:productId
   * Thuong mua kem — FP-Growth
   */
  async getBoughtTogether(productId: string, limit: number = 6) {
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
   * Xu huong / ban chay — NMF
   */
  async getTrending(categoryId?: string, limit: number = 12) {
    const query = categoryId ? `?category_id=${categoryId}&limit=${limit}` : `?limit=${limit}`
    const data = await callML<{ algorithm: string; products: string[] }>(`/recommend/trending${query}`)

    if (!data || data.products.length === 0) {
      const fallback = await getFallbackTrending(limit)
      return { algorithm: 'fallback_rating', products: fallback }
    }

    const enriched = await enrichProductIds(data.products, limit)
    return { algorithm: data.algorithm, products: enriched }
  }

  /**
   * GET /recommendations/for-you/:userId
   * Danh cho ban — SVD / NMF fallback
   */
  async getForYou(userId: string, limit: number = 12) {
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
   * GET /recommendations/post-purchase
   * Goi y sau dat hang — Hybrid
   */
  async getPostPurchase(orderProductIds: string[], limit: number = 8) {
    if (!orderProductIds || orderProductIds.length === 0) {
      const fallback = await getFallbackTrending(limit)
      return { algorithm: 'fallback_rating', products: fallback }
    }

    const orderIdsParam = orderProductIds.join(',')
    const data = await callML<{ algorithm: string; products: string[] }>(
      `/recommend/post-purchase?order_ids=${orderIdsParam}&limit=${limit}`
    )

    if (!data || data.products.length === 0) {
      return { algorithm: 'fallback_empty', products: [] }
    }

    const enriched = await enrichProductIds(data.products, limit)
    return { algorithm: data.algorithm, products: enriched }
  }

  /**
   * GET /recommendations/pharmacist
   * Goi y cho Pharmacist — TF-IDF medical context
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
    const params = new URLSearchParams({
      chronic_diseases: chronicDiseases.join(','),
      allergies: allergies.join(','),
      current_medications: currentMedications.join(','),
      prescription_product_ids: prescriptionProductIds.join(','),
      limit: String(limit)
    })

    const data = await callML<{ algorithm: string; products: string[] }>(
      `/recommend/pharmacist?${params}`
    )

    if (!data || data.products.length === 0) {
      return { algorithm: 'fallback_empty', products: [] }
    }

    const enriched = await enrichProductIds(data.products, limit)
    return { algorithm: data.algorithm, products: enriched }
  }

  /**
   * GET /recommendations/ml-status
   * Kiem tra ML service status (admin/debug)
   */
  async getMLStatus() {
    const data = await callML<any>('/')
    return data || { status: 'unavailable', models: {} }
  }
}

const recommendationsService = new RecommendationsService()
export default recommendationsService
