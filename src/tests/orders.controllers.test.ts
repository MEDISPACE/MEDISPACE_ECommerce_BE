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
    mockRedisDel.mockResolvedValue(1)
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

  it('creates the order normally when Redis is unavailable', async () => {
    const userId = new ObjectId()
    const created = { order: { _id: new ObjectId() } }
    mockRedisSet.mockRejectedValue(new Error('Redis unavailable'))
    mockCreateOrder.mockResolvedValue(created)
    const req = {
      decoded_authorization: { userId: userId.toString() },
      cookies: { sessionId: 'session-1' },
      body: { paymentMethod: 'cod' },
      header: vi.fn(() => 'request-1')
    } as any
    const res = { json: vi.fn((body) => body) } as any

    const response = await createOrderController(req, res)

    expect(mockCreateOrder).toHaveBeenCalledWith(userId, expect.objectContaining({
      paymentMethod: 'cod',
      sessionId: 'session-1',
      idempotencyKey: 'request-1'
    }))
    expect(response.result).toBe(created)
    expect(mockRedisDel).not.toHaveBeenCalled()
  })

  it('creates the first request and releases its Redis lock', async () => {
    const userId = new ObjectId()
    mockRedisSet.mockResolvedValue('OK')
    mockCreateOrder.mockResolvedValue({ orderId: 'created' })
    const req = {
      decoded_authorization: { userId: userId.toString() },
      cookies: {},
      body: {},
      header: vi.fn(() => 'first-request')
    } as any
    const res = { json: vi.fn((body) => body) } as any

    await createOrderController(req, res)

    expect(mockCreateOrder).toHaveBeenCalledOnce()
    expect(mockRedisDel).toHaveBeenCalledWith(`order:create:${userId.toString()}:first-request`)
  })

  it('creates normally without touching Redis when no idempotency key is provided', async () => {
    const userId = new ObjectId()
    mockCreateOrder.mockResolvedValue({ orderId: 'created' })
    const req = {
      decoded_authorization: { userId: userId.toString() },
      cookies: {},
      body: {},
      header: vi.fn(() => undefined)
    } as any
    const res = { json: vi.fn((body) => body) } as any

    await createOrderController(req, res)

    expect(mockRedisSet).not.toHaveBeenCalled()
    expect(mockRedisDel).not.toHaveBeenCalled()
    expect(mockCreateOrder).toHaveBeenCalledWith(userId, expect.objectContaining({ idempotencyKey: undefined }))
  })
})
