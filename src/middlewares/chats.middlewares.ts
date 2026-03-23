import { Request, Response, NextFunction } from 'express'
import HTTP_STATUS from '~/constants/httpStatus'

// Rate limit: simple in-memory map per userId
const messageSendCounts = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 10_000 // 10 giây

export const sendMessageValidator = (req: Request, res: Response, next: NextFunction) => {
    const { content, type, imageUrl, conversationId } = req.body

    // Validate content
    if (!content && !imageUrl) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            message: 'Nội dung tin nhắn không được để trống'
        })
    }

    if (content && typeof content !== 'string') {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            message: 'Nội dung tin nhắn không hợp lệ'
        })
    }

    if (content && content.length > 2000) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            message: 'Nội dung tin nhắn không được vượt quá 2000 ký tự'
        })
    }

    // Validate type
    if (type && !['text', 'image', 'product'].includes(type)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            message: 'Loại tin nhắn không hợp lệ'
        })
    }

    // Validate productRef khi type là product
    if (type === 'product') {
        if (!req.body.productRef) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                message: 'Thông tin sản phẩm không được để trống'
            })
        }
        const { productId, name, price } = req.body.productRef
        if (!productId || !name || price === undefined) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                message: 'Thông tin sản phẩm thiếu các trường bắt buộc (productId, name, price)'
            })
        }
    }

    // Validate imageUrl format
    if (imageUrl) {
        try {
            new URL(imageUrl)
        } catch {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                message: 'URL ảnh không hợp lệ'
            })
        }
    }

    next()
}

export const rateLimitMessageValidator = (req: Request, res: Response, next: NextFunction) => {
    const { userId } = (req as any).decoded_authorization || {}
    if (!userId) return next()

    const now = Date.now()
    const record = messageSendCounts.get(userId)

    if (!record || now > record.resetAt) {
        messageSendCounts.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
        return next()
    }

    if (record.count >= RATE_LIMIT_MAX) {
        return res.status(429).json({
            message: `Bạn đang gửi tin nhắn quá nhanh. Vui lòng chờ vài giây.`
        })
    }

    record.count++
    next()
}
