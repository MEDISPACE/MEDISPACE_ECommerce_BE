import { NextFunction, Request, Response } from 'express'

const windows = new Map<string, { count: number; resetAt: number }>()

export const searchRateLimit = (maxRequests: number, windowMs: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now()
    if (windows.size > 10_000) {
      for (const [entryKey, entry] of windows) {
        if (now >= entry.resetAt) windows.delete(entryKey)
      }
    }
    const key = `${req.ip || 'unknown'}:${req.path}`
    const current = windows.get(key)

    if (!current || now >= current.resetAt) {
      windows.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }

    if (current.count >= maxRequests) {
      res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000))
      return res.status(429).json({ message: 'Bạn đang tìm kiếm quá nhanh. Vui lòng thử lại sau.' })
    }

    current.count += 1
    next()
  }
}
