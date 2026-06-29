import { Request, Response, NextFunction } from 'express'
import HTTP_STATUS from '~/constants/httpStatus'
import { UserRole } from '~/constants/enum'

// Rate limit: simple in-memory map per userId
const messageSendCounts = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 10_000 // 10 giây
const conversationCreateCounts = new Map<string, { count: number; resetAt: number }>()
const CONVERSATION_CREATE_RATE_LIMIT_MAX = Number(process.env.CHAT_CONVERSATION_CREATE_LIMIT || 5)
const CONVERSATION_CREATE_RATE_LIMIT_WINDOW_MS = Number(process.env.CHAT_CONVERSATION_CREATE_WINDOW_MS || 60_000)
const CHAT_IMAGE_ALLOWED_HOSTS = (process.env.CHAT_IMAGE_ALLOWED_HOSTS || process.env.MEDIA_ALLOWED_HOSTS || '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean)

const validateTrustedImageUrl = (imageUrl: string): string | null => {
  let parsed: URL
  try {
    parsed = new URL(imageUrl)
  } catch {
    return 'URL ảnh không hợp lệ'
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return 'URL ảnh phải sử dụng http(s)'
  }

  if (CHAT_IMAGE_ALLOWED_HOSTS.length > 0 && !CHAT_IMAGE_ALLOWED_HOSTS.includes(parsed.hostname.toLowerCase())) {
    return 'URL ảnh không thuộc nguồn được phép'
  }

  return null
}

export const sendMessageValidator = (req: Request, res: Response, next: NextFunction) => {
  const { content, type, imageUrl, conversationId } = req.body
  const { role } = (req as any).decoded_authorization || {}

  // Validate content – product message không cần content/imageUrl
  if (!content && !imageUrl && type !== 'product') {
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
    if (role !== undefined && role !== UserRole.Pharmacist) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Chỉ dược sĩ mới có thể gửi thẻ sản phẩm'
      })
    }
    if (!req.body.productRef) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'Thông tin sản phẩm không được để trống'
      })
    }
    const { productId } = req.body.productRef
    if (!productId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'Thông tin sản phẩm thiếu productId'
      })
    }
  }

  // Validate imageUrl format and trusted origin before it can reach downstream services.
  if (imageUrl) {
    const imageUrlError = validateTrustedImageUrl(imageUrl)
    if (imageUrlError) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: imageUrlError
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

export const rateLimitConversationCreateValidator = (req: Request, res: Response, next: NextFunction) => {
  const { userId } = (req as any).decoded_authorization || {}
  if (!userId) return next()

  const now = Date.now()
  const record = conversationCreateCounts.get(userId)

  if (!record || now > record.resetAt) {
    conversationCreateCounts.set(userId, {
      count: 1,
      resetAt: now + CONVERSATION_CREATE_RATE_LIMIT_WINDOW_MS
    })
    return next()
  }

  if (record.count >= CONVERSATION_CREATE_RATE_LIMIT_MAX) {
    return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
      message: 'Bạn tạo cuộc tư vấn quá nhanh. Vui lòng chờ một chút trước khi thử lại.'
    })
  }

  record.count++
  next()
}
