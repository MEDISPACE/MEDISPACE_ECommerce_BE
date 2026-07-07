import { beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { ObjectId } from 'mongodb'

const mockGetOrSet = vi.hoisted(() => vi.fn())
const mockCollection = vi.hoisted(() => vi.fn())

const mockProducts = {
  aggregate: vi.fn(),
  find: vi.fn(),
  findOne: vi.fn()
}

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}))

vi.mock('~/services/database.services', () => ({
  default: {
    products: mockProducts,
    db: {
      collection: mockCollection.mockImplementation(() => ({
        find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
        insertOne: vi.fn().mockResolvedValue({})
      }))
    }
  }
}))

vi.mock('~/services/cache.services', () => ({
  default: {
    getOrSet: mockGetOrSet
  }
}))

const { default: recommendationsService } = await import('~/services/recommendations.services')

describe('RecommendationsService prescription policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOrSet.mockImplementation((_key: string, loader: () => unknown) => loader())
    mockCollection.mockImplementation(() => ({
      find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      insertOne: vi.fn().mockResolvedValue({})
    }))
  })

  it('filters prescription products from customer recommendations', async () => {
    const otcId = new ObjectId()
    const rxId = new ObjectId()
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { algorithm: 'tfidf', products: [rxId.toString(), otcId.toString()] }
    })
    mockProducts.aggregate.mockReturnValueOnce({
      toArray: vi.fn().mockResolvedValueOnce([{ _id: otcId, requiresPrescription: false }])
    })

    const result = await recommendationsService.getRelated(new ObjectId().toString(), 8)

    const pipeline = mockProducts.aggregate.mock.calls[0][0]
    expect(pipeline[0].$match.requiresPrescription).toEqual({ $ne: true })
    expect(result.products[0]).toMatchObject({ _id: otcId, requiresPrescription: false })
    expect(result.products[0].recommendation).toMatchObject({ requiresIndependentReview: false })
    expect(result.attributionToken).toBeTruthy()
  })

  it('blocks automatically suggested prescription products for pharmacists', async () => {
    const rxId = new ObjectId()
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { algorithm: 'tfidf_medical', products: [rxId.toString()] }
    })
    mockProducts.aggregate.mockReturnValueOnce({
      toArray: vi.fn().mockResolvedValueOnce([{ _id: rxId, requiresPrescription: true }])
    })

    const result = await recommendationsService.getPharmacistSuggestions({
      prescriptionProductIds: [rxId.toString()]
    })

    const pipeline = mockProducts.aggregate.mock.calls[0][0]
    expect(pipeline[0].$match.requiresPrescription).toEqual({ $ne: true })
    expect(result.products).toEqual([])
  })

  it('creates fresh attribution for cached trending payloads', async () => {
    const productId = new ObjectId()
    const cachedPayload = {
      algorithm: 'nmf',
      modelVersion: 'model-v1',
      products: [{ _id: productId, requiresPrescription: false }]
    }
    mockGetOrSet.mockResolvedValue(cachedPayload)

    const first = await recommendationsService.getTrending(undefined, 4)
    const second = await recommendationsService.getTrending(undefined, 4)

    expect(first.products).toHaveLength(1)
    expect(second.products).toHaveLength(1)
    expect(first.attributionToken).toBeTruthy()
    expect(second.attributionToken).toBeTruthy()
    expect(first.attributionToken).not.toBe(second.attributionToken)
    expect(first.requestId).not.toBe(second.requestId)
  })

  it('backfills after policy filters stale customer candidates', async () => {
    const staleRxId = new ObjectId()
    const backfillId = new ObjectId()
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { algorithm: 'svd', products: [{ productId: staleRxId.toString(), score: 9.5 }] }
    })
    mockProducts.aggregate
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValueOnce([]) })
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValueOnce([{ _id: backfillId, requiresPrescription: false }]) })
    mockProducts.find.mockReturnValueOnce({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      project: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValueOnce([{ _id: backfillId }])
    })

    const result = await recommendationsService.getForYou(new ObjectId().toString(), 1)

    expect(result.products).toHaveLength(1)
    expect(result.products[0]).toMatchObject({ _id: backfillId, requiresPrescription: false })
    expect(result.products[0].recommendation.evidence).toContain('catalog_backfill')
  })

  it('filters stale FP-Growth candidates and backfills bought-together results', async () => {
    const staleId = new ObjectId()
    const backfillId = new ObjectId()
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { algorithm: 'fpgrowth', products: [{ productId: staleId.toString(), score: 2.4 }] }
    })
    mockProducts.aggregate
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValueOnce([]) })
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValueOnce([{ _id: backfillId, requiresPrescription: false }]) })
    mockProducts.find.mockReturnValueOnce({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      project: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValueOnce([{ _id: backfillId }])
    })

    const result = await recommendationsService.getBoughtTogether(new ObjectId().toString(), 1)

    expect(result.products).toHaveLength(1)
    expect(result.products[0]._id).toEqual(backfillId)
    expect(result.products[0].recommendation.evidence).toContain('catalog_backfill')
  })

  it('blocks pharmacist candidates with validated contraindication rules before backfill', async () => {
    const blockedId = new ObjectId()
    const backfillId = new ObjectId()
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { algorithm: 'tfidf_medical', products: [{ productId: blockedId.toString(), score: 0.8 }] }
    })
    mockProducts.aggregate
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValueOnce([{ _id: blockedId, requiresPrescription: false }]) })
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValueOnce([{ _id: backfillId, requiresPrescription: false }]) })
    mockProducts.find.mockReturnValueOnce({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      project: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValueOnce([{ _id: backfillId }])
    })
    mockCollection.mockImplementation((name: string) => ({
      find: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue(
          name === 'drugSafetyRules'
            ? [{ productId: blockedId, status: 'validated', contraindicatedConditions: ['diabetes'], interactingMedications: [] }]
            : []
        )
      })),
      insertOne: vi.fn().mockResolvedValue({})
    }))

    const result = await recommendationsService.getPharmacistSuggestions({
      chronicDiseases: ['diabetes'],
      limit: 1
    })

    expect(result.products).toHaveLength(1)
    expect(result.products[0]._id).toEqual(backfillId)
    expect(result.products[0]._id).not.toEqual(blockedId)
    expect(result.products[0].recommendation.requiresIndependentReview).toBe(true)
  })
})
