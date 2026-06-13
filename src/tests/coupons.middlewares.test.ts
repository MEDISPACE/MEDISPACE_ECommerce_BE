import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockIncr = vi.fn()
const mockExpire = vi.fn()
const redisMock = {
  status: 'ready',
  incr: mockIncr,
  expire: mockExpire
}

vi.mock('~/services/cache.services', () => ({
  redis: redisMock
}))

const { couponRateLimit } = await import('~/middlewares/coupons.middlewares')

function response() {
  const res: any = {}
  res.status = vi.fn(() => res)
  res.json = vi.fn((body) => body)
  return res
}

describe('couponRateLimit', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    redisMock.status = 'ready'
  })

  it('uses a shared Redis counter and sets TTL for the first request', async () => {
    mockIncr.mockResolvedValue(1)
    mockExpire.mockResolvedValue(1)
    const next = vi.fn()

    await couponRateLimit({
      decoded_authorization: { userId: 'user-1' },
      path: '/validate',
      ip: '127.0.0.1'
    } as any, response(), next)

    expect(mockIncr).toHaveBeenCalledWith('rate-limit:coupon:user-1:/validate')
    expect(mockExpire).toHaveBeenCalledWith('rate-limit:coupon:user-1:/validate', 60)
    expect(next).toHaveBeenCalledOnce()
  })

  it('rejects requests above the distributed Redis limit', async () => {
    mockIncr.mockResolvedValue(11)
    const next = vi.fn()
    const res = response()

    await couponRateLimit({
      decoded_authorization: { userId: 'user-2' },
      path: '/validate',
      ip: '127.0.0.1'
    } as any, res, next)

    expect(res.status).toHaveBeenCalledWith(429)
    expect(next).not.toHaveBeenCalled()
  })

  it('falls back to an in-memory limiter when Redis is unavailable', async () => {
    redisMock.status = 'end'
    const next = vi.fn()

    await couponRateLimit({
      decoded_authorization: { userId: 'fallback-user' },
      path: '/apply',
      ip: '127.0.0.1'
    } as any, response(), next)

    expect(mockIncr).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()
  })
})
