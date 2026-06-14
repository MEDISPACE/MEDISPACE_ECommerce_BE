import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'

const mockGetProductById = vi.fn()
const mockCartFindOne = vi.fn()
const mockCartUpdateOne = vi.fn()

vi.mock('~/services/products.services', () => ({
  default: { getProductById: mockGetProductById }
}))

vi.mock('~/services/database.services', () => ({
  default: {
    carts: {
      findOne: mockCartFindOne,
      updateOne: mockCartUpdateOne,
      insertOne: vi.fn(),
      deleteOne: vi.fn()
    }
  }
}))

vi.mock('~/services/campaigns.services', () => ({
  default: {
    getActiveCampaignForProduct: vi.fn(),
    applyDiscountToPrice: vi.fn((price) => price)
  }
}))

const { default: cartService } = await import('~/services/carts.services')

describe('CartService quantity safeguards', () => {
  beforeEach(() => vi.resetAllMocks())

  it('rejects cumulative quantity above maxOrderQuantity for the same product and unit', async () => {
    const productId = new ObjectId()
    const userId = new ObjectId()
    mockGetProductById.mockResolvedValue({
      _id: productId,
      name: 'Vitamin C',
      sku: 'VIT-C',
      stockQuantity: 100,
      maxOrderQuantity: 10,
      requiresPrescription: false,
      priceVariants: [{ unit: 'Hộp', price: 50_000, quantityPerUnit: 1, isDefault: true }]
    })
    mockCartFindOne.mockResolvedValue({
      _id: new ObjectId(),
      userId,
      items: [{
        productId,
        name: 'Vitamin C',
        sku: 'VIT-C',
        unit: 'Hộp',
        quantity: 8,
        unitPrice: 50_000,
        originalUnitPrice: 50_000,
        totalPrice: 400_000,
        prescriptionRequired: false
      }],
      itemCount: 8,
      uniqueProductCount: 1,
      subtotal: 400_000,
      totalAmount: 400_000,
      requiresPrescription: false,
      status: 'active'
    })

    await expect(cartService.addItemToCart(productId, 3, userId, undefined, 'Hộp'))
      .rejects.toThrow()

    expect(mockCartUpdateOne).not.toHaveBeenCalled()
  })
})
