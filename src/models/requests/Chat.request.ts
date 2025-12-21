export interface SendMessageReqBody {
    conversationId?: string
    pharmacistId?: string
    content: string
    type?: 'text' | 'image'
    imageUrl?: string
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
