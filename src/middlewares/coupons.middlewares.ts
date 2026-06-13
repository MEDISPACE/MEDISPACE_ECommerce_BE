import { NextFunction, Request, Response } from 'express'
import HTTP_STATUS from '~/constants/httpStatus'

const WINDOW_MS = 60_000
const MAX_REQUESTS = 10
const attempts = new Map<string, { count: number; resetAt: number }>()

export const couponRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const identity = req.decoded_authorization?.userId || req.ip
  const key = `${identity}:${req.path}`
  const now = Date.now()
  const current = attempts.get(key)

  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return next()
  }

  if (current.count >= MAX_REQUESTS) {
    return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
      message: 'Bạn thao tác mã giảm giá quá nhanh. Vui lòng thử lại sau.'
    })
  }

  current.count += 1
  next()
}
