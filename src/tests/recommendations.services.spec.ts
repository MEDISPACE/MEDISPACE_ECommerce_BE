import { beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { ObjectId } from 'mongodb'

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
      collection: vi.fn(() => ({
        find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
        insertOne: vi.fn().mockResolvedValue({})
      }))
    }
  }
}))

vi.mock('~/services/cache.services', () => ({
  default: {
    getOrSet: vi.fn((_key: string, loader: () => unknown) => loader())
  }
}))

const { default: recommendationsService } = await import('~/services/recommendations.services')

describe('RecommendationsService prescription policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
