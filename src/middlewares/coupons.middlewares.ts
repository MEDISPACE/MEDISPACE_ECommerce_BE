import { NextFunction, Request, Response } from 'express'
import HTTP_STATUS from '~/constants/httpStatus'
import { redis } from '~/services/cache.services'

const WINDOW_MS = 60_000
const WINDOW_SECONDS = Math.ceil(WINDOW_MS / 1000)
const MAX_REQUESTS = Number(process.env.COUPON_RATE_LIMIT_MAX || 10)
const attempts = new Map<string, { count: number; resetAt: number }>()

const rejectTooManyRequests = (res: Response) =>
  res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
    message: 'Bạn thao tác mã giảm giá quá nhanh. Vui lòng thử lại sau.'
  })

const applyInMemoryFallback = (key: string, res: Response, next: NextFunction) => {
  const now = Date.now()
  const current = attempts.get(key)

  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return next()
  }

  if (current.count >= MAX_REQUESTS) return rejectTooManyRequests(res)

  current.count += 1
  return next()
}

export const couponRateLimit = async (req: Request, res: Response, next: NextFunction) => {
  const identity = req.decoded_authorization?.userId || req.ip
  const key = `rate-limit:coupon:${identity}:${req.path}`

  if (redis.status === 'ready') {
    try {
      const count = await redis.incr(key)
      if (count === 1) await redis.expire(key, WINDOW_SECONDS)
      if (count > MAX_REQUESTS) return rejectTooManyRequests(res)
      return next()
    } catch {
      // Redis may become unavailable between the status check and command.
    }
  }

  return applyInMemoryFallback(key, res, next)
}
