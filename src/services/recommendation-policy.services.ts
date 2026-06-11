import { ObjectId } from 'mongodb'
import databaseService from './database.services'

export type RecommendationAudience = 'customer' | 'pharmacist'

export interface RecommendationPolicyContext {
  audience?: RecommendationAudience
  excludedProductIds?: string[]
  allergies?: string[]
  chronicDiseases?: string[]
  currentMedications?: string[]
}

export interface RecommendationCandidate {
  productId: string
  score?: number
  reason?: string
  evidence?: string[]
}

const normalizeTerms = (values: string[] = []) =>
  values.map((value) => value.trim().toLowerCase()).filter((value) => value.length >= 3)

class RecommendationPolicyService {
  private recordSafetyBlock(productId: string, reason: string) {
    void databaseService.db.collection('recommendationSafetyEvents').insertOne({
      productId: new ObjectId(productId),
      reason,
      timestamp: new Date()
    }).catch(() => {})
  }

  async apply(candidates: RecommendationCandidate[], context: RecommendationPolicyContext = {}) {
    const validCandidates = candidates.filter((candidate) => ObjectId.isValid(candidate.productId))
    if (validCandidates.length === 0) return []

    const excludedIds = new Set(context.excludedProductIds || [])
    const blockedTerms = normalizeTerms([...(context.allergies || []), ...(context.currentMedications || [])])
    const chronicDiseases = normalizeTerms(context.chronicDiseases || [])
    const productIds = validCandidates.map((candidate) => new ObjectId(candidate.productId))

    const products = await databaseService.products
      .aggregate([
        {
          $match: {
            _id: { $in: productIds },
            isActive: true,
            stockQuantity: { $gt: 0 },
            // Automatic recommendations are merchandising assistance only.
            // Prescription products must be selected explicitly by a pharmacist.
            requiresPrescription: { $ne: true }
          }
        },
        {
          $lookup: {
            from: 'productDetails',
            localField: '_id',
            foreignField: 'productId',
            as: 'details'
          }
        },
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
            'details.activeIngredients': 1,
            'category.name': 1,
            'category.isActive': 1,
            'brand.name': 1,
            'brand.isActive': 1
          }
        }
      ])
      .toArray()

    const safetyRules = await databaseService.db.collection('drugSafetyRules').find({
      productId: { $in: productIds },
      status: 'validated'
    }).toArray()
    const safetyRuleMap = new Map(safetyRules.map((rule) => [rule.productId.toString(), rule]))
    const productMap = new Map(products.map((product) => [product._id.toString(), product]))
    return validCandidates.flatMap((candidate) => {
      const product = productMap.get(candidate.productId)
      if (!product || excludedIds.has(candidate.productId)) return []
      if (product.category?.[0]?.isActive === false || product.brand?.[0]?.isActive === false) return []
      if (product.requiresPrescription === true) {
        this.recordSafetyBlock(candidate.productId, 'automatic_prescription_recommendation_blocked')
        return []
      }

      const safetyText = [
        product.name,
        ...(product.details || []).map((detail: { activeIngredients?: string }) => detail.activeIngredients || '')
      ].join(' ').toLowerCase()
      if (blockedTerms.some((term) => safetyText.includes(term))) {
        this.recordSafetyBlock(candidate.productId, 'allergy_or_current_medication_keyword_blocked')
        return []
      }
      const safetyRule = safetyRuleMap.get(candidate.productId)
      const contraindications = normalizeTerms(safetyRule?.contraindicatedConditions || [])
      const interactions = normalizeTerms(safetyRule?.interactingMedications || [])
      if (chronicDiseases.some((condition) => contraindications.some((term) => condition.includes(term) || term.includes(condition)))) {
        this.recordSafetyBlock(candidate.productId, 'validated_contraindication_blocked')
        return []
      }
      if ((context.currentMedications || []).some((medication) => interactions.some((term) => medication.toLowerCase().includes(term)))) {
        this.recordSafetyBlock(candidate.productId, 'validated_interaction_blocked')
        return []
      }

      return [{
        ...product,
        recommendation: {
          score: Number.isFinite(candidate.score) ? candidate.score : null,
          reason: candidate.reason || 'Được xếp hạng phù hợp với ngữ cảnh hiện tại',
          evidence: [...(candidate.evidence || []), ...(safetyRule ? ['validated_safety_rule'] : [])],
          requiresIndependentReview: context.audience === 'pharmacist'
        }
      }]
    })
  }
}

export default new RecommendationPolicyService()
