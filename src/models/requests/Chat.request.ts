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
}
