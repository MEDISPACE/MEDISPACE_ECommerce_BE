import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'

const mockRedisSet = vi.fn()
const mockRedisDel = vi.fn()
const mockCreateOrder = vi.fn()
const mockGetOrderByIdempotencyKey = vi.fn()

vi.mock('~/services/cache.services', () => ({
  redis: {
    set: mockRedisSet,
    del: mockRedisDel
  }
}))

vi.mock('~/services/orders.services', () => ({
  default: {
    createOrder: mockCreateOrder,
    getOrderByIdempotencyKey: mockGetOrderByIdempotencyKey
  }
}))

const { createOrderController } = await import('~/controllers/orders.controllers')

describe('createOrderController idempotency', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns the existing order without creating another order when the lock is held', async () => {
    const userId = new ObjectId()
    const existing = {
      _id: new ObjectId(),
      userId,
      paymentMethod: 'vnpay',
      paymentStatus: 'pending'
    }
    mockRedisSet.mockResolvedValue(null)
    mockGetOrderByIdempotencyKey.mockResolvedValue(existing)

    const req = {
      decoded_authorization: { userId: userId.toString() },
      cookies: {},
      body: {},
      header: vi.fn(() => 'same-request')
    } as any
    const res = {
      json: vi.fn((body) => body)
    } as any

    const response = await createOrderController(req, res)

    expect(mockCreateOrder).not.toHaveBeenCalled()
    expect(response.result).toEqual({
      order: existing,
      orderId: existing._id,
      paymentUrlError: true
    })
  })
})
