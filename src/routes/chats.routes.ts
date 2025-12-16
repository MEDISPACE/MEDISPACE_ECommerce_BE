import { Router } from 'express'
import {
    getConversationsController,
    getOrCreateConversationController,
    sendMessageController,
    getMessagesController,
    markAsReadController,
    getConversationController,
    getAvailablePharmacistController,
    deleteConversationController
} from '~/controllers/chats.controllers'
import { accessTokenValidator, verifiedUserValidator } from '~/middlewares/users.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const chatsRouter = Router()

/**
 * Get available pharmacist
 * Path: /available-pharmacist
 * Method: GET
 * Header: { Authorization: Bearer <access_token> }
 */
chatsRouter.get(
    '/available-pharmacist',
    accessTokenValidator,
    verifiedUserValidator,
    wrapRequestHandler(getAvailablePharmacistController)
)

/**
 * Get all conversations for current user
 * Path: /conversations
 * Method: GET
 * Header: { Authorization: Bearer <access_token> }
 * Query: { page?: number, limit?: number, status?: 'active' | 'closed' }
 */
chatsRouter.get(
    '/conversations',
    accessTokenValidator,
    verifiedUserValidator,
    wrapRequestHandler(getConversationsController)
)

/**
 * Get or create conversation with a pharmacist (Customer only)
 * Path: /conversations
 * Method: POST
 * Header: { Authorization: Bearer <access_token> }
 * Body: { pharmacistId: string }
 */
chatsRouter.post(
    '/conversations',
    accessTokenValidator,
    verifiedUserValidator,
    wrapRequestHandler(getOrCreateConversationController)
)

/**
 * Get conversation by ID
 * Path: /conversations/:conversationId
 * Method: GET
 * Header: { Authorization: Bearer <access_token> }
 */
chatsRouter.get(
    '/conversations/:conversationId',
    accessTokenValidator,
    verifiedUserValidator,
    wrapRequestHandler(getConversationController)
)

/**
 * Send a message
 * Path: /messages
 * Method: POST
 * Header: { Authorization: Bearer <access_token> }
 * Body: { conversationId?: string, pharmacistId?: string, content: string, type?: 'text' | 'image', imageUrl?: string }
 */
chatsRouter.post('/messages', accessTokenValidator, verifiedUserValidator, wrapRequestHandler(sendMessageController))

/**
 * Get messages for a conversation
 * Path: /messages
 * Method: GET
 * Header: { Authorization: Bearer <access_token> }
 * Query: { conversationId: string, page?: number, limit?: number }
 */
chatsRouter.get('/messages', accessTokenValidator, verifiedUserValidator, wrapRequestHandler(getMessagesController))

/**
 * Mark messages as read
 * Path: /messages/read
 * Method: POST
 * Header: { Authorization: Bearer <access_token> }
 * Body: { conversationId: string }
 */
chatsRouter.post('/messages/read', accessTokenValidator, verifiedUserValidator, wrapRequestHandler(markAsReadController))

/**
 * Delete conversation
 * Path: /conversations/:conversationId
 * Method: DELETE
 * Header: { Authorization: Bearer <access_token> }
 */
chatsRouter.delete(
    '/conversations/:conversationId',
    accessTokenValidator,
    verifiedUserValidator,
    wrapRequestHandler(deleteConversationController)
)

export default chatsRouter
