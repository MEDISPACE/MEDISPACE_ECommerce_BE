import { Router } from 'express'
import {
  getConversationsController,
  getOrCreateConversationController,
  sendMessageController,
  getMessagesController,
  markAsReadController,
  getConversationController,
  getAvailablePharmacistController,
  deleteConversationController,
  assignConversationController,
  saveMessageFeedbackController,
  aiChatController,
  aiStreamController
} from '~/controllers/chats.controllers'
import { accessTokenValidator, verifiedUserValidator } from '~/middlewares/users.middlewares'
import {
  sendMessageValidator,
  rateLimitMessageValidator,
  rateLimitConversationCreateValidator
} from '~/middlewares/chats.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const chatsRouter = Router()

/**
 * Get available pharmacist
 * Path: /available-pharmacist
 * Method: GET
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
 * Query: { page?, limit?, status? }
 */
chatsRouter.get(
  '/conversations',
  accessTokenValidator,
  verifiedUserValidator,
  wrapRequestHandler(getConversationsController)
)

/**
 * Get or create conversation (Customer only – shared inbox)
 * Path: /conversations
 * Method: POST
 */
chatsRouter.post(
  '/conversations',
  accessTokenValidator,
  verifiedUserValidator,
  rateLimitConversationCreateValidator,
  wrapRequestHandler(getOrCreateConversationController)
)

/**
 * Get conversation by ID
 * Path: /conversations/:conversationId
 * Method: GET
 */
chatsRouter.get(
  '/conversations/:conversationId',
  accessTokenValidator,
  verifiedUserValidator,
  wrapRequestHandler(getConversationController)
)

/**
 * (3.5) Pharmacist manually claims a conversation
 * Path: /conversations/:conversationId/assign
 * Method: POST
 */
chatsRouter.post(
  '/conversations/:conversationId/assign',
  accessTokenValidator,
  verifiedUserValidator,
  wrapRequestHandler(assignConversationController)
)

/**
 * Delete conversation
 * Path: /conversations/:conversationId
 * Method: DELETE
 */
chatsRouter.delete(
  '/conversations/:conversationId',
  accessTokenValidator,
  verifiedUserValidator,
  wrapRequestHandler(deleteConversationController)
)

/**
 * Send a message – with validation (3.7) and rate limit (3.7)
 * Path: /messages
 * Method: POST
 */
chatsRouter.post(
  '/messages',
  accessTokenValidator,
  verifiedUserValidator,
  rateLimitMessageValidator,
  sendMessageValidator,
  wrapRequestHandler(sendMessageController)
)

/**
 * Get messages for a conversation
 * Path: /messages
 * Method: GET
 * Query: { conversationId, page?, limit? }
 */
chatsRouter.get('/messages', accessTokenValidator, verifiedUserValidator, wrapRequestHandler(getMessagesController))

/**
 * Mark messages as read
 * Path: /messages/read
 * Method: POST
 */
chatsRouter.post(
  '/messages/read',
  accessTokenValidator,
  verifiedUserValidator,
  wrapRequestHandler(markAsReadController)
)

/**
 * Save user feedback for a message
 * Path: /messages/:messageId/feedback
 * Method: POST
 */
chatsRouter.post(
  '/messages/:messageId/feedback',
  accessTokenValidator,
  verifiedUserValidator,
  wrapRequestHandler(saveMessageFeedbackController)
)

// ── AI Chat routes (Phase 3) ────────────────────────────────────────────

/**
 * AI Chat — Non-streaming
 * Path: /ai-message
 * Method: POST
 * Body: { message, conversation_id, context_products? }
 * Response: { reply, classification, is_escalated, products_suggested, suggested_questions }
 */
chatsRouter.post(
  '/ai-message',
  accessTokenValidator,
  verifiedUserValidator,
  wrapRequestHandler(aiChatController)
)

/**
 * AI Chat — SSE Streaming (FE dùng EventSource hoặc fetch stream)
 * Path: /ai-stream
 * Method: GET
 * Query: { message, conversation_id, context_products? (JSON string) }
 * Response: text/event-stream
 *
 * SSE Event format:
 *   data: {"type":"chunk","content":"text..."}
 *   data: {"type":"done","reply":"...","classification":"...", ...}
 *   data: [DONE]
 */
chatsRouter.get(
  '/ai-stream',
  accessTokenValidator,
  verifiedUserValidator,
  wrapRequestHandler(aiStreamController)
)

export default chatsRouter
