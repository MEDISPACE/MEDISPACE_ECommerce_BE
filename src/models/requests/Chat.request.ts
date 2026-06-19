export interface ProductRef {
  productId: string
  name: string
  slug: string
  price: number
  unit: string
  imageUrl?: string
  requiresPrescription?: boolean
}

export interface SendMessageReqBody {
  conversationId?: string
  pharmacistId?: string
  content?: string
  type?: 'text' | 'image' | 'product'
  imageUrl?: string
  productRef?: ProductRef
}

export interface GetMessagesReqQuery {
  conversationId?: string
  page?: string
  limit?: string
}

export interface MarkAsReadReqBody {
  conversationId: string
}

export interface GetConversationsReqQuery {
  page?: string
  limit?: string
  status?: 'active' | 'closed'
  type?: 'ai' | 'pharmacist'
}

// ── AI Chat (Phase 3) ─────────────────────────────────────────────────────────

export interface AIChatContextProduct {
  mongoId: string
  name: string
  slug: string
  price: number
  imageUrl?: string
  unit?: string
  requiresPrescription?: boolean
}

/**
 * POST /api/chats/ai-message — Non-streaming AI chat
 */
export interface AIChatReqBody {
  /** Tin nhắn của user */
  message: string
  /** conversation_id (MongoDB ObjectId string) */
  conversation_id: string
  /** Sản phẩm đang xem (FE truyền từ trang product) */
  context_products?: AIChatContextProduct[]
  /** Vision: URL ảnh được upload lên Cloudinary (nếu user gửi ảnh) */
  image_url?: string
}

/**
 * GET /api/chats/ai-stream — SSE streaming AI chat
 */
export interface AIStreamReqQuery {
  message: string
  conversation_id: string
  context_products?: string // JSON string (query param)
}

