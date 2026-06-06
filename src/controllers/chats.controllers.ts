import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import chatsService from '~/services/chats.services'
import {
  SendMessageReqBody,
  GetMessagesReqQuery,
  MarkAsReadReqBody,
  GetConversationsReqQuery,
  AIChatReqBody,
  AIStreamReqQuery
} from '~/models/requests/Chat.request'
import {
  buildHistory,
  checkAIRateLimit,
  getResponseCache,
  setResponseCache,
  sendToAI,
  streamFromAI,
  saveAIReplyAsync
} from '~/services/ai-chat.services'
import { TokenPayload } from '~/models/requests/User.request'
import { CHATS_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'

// Get all conversations for current user
export const getConversationsController = async (
  req: Request<ParamsDictionary, unknown, unknown, GetConversationsReqQuery>,
  res: Response
) => {
  const { userId, role } = req.decoded_authorization as TokenPayload
  const page = parseInt(req.query.page || '1')
  const limit = parseInt(req.query.limit || '20')
  const status = req.query.status as 'active' | 'closed' | undefined
  const type = req.query.type as 'ai' | 'pharmacist' | undefined

  const result = await chatsService.getConversations(
    userId,
    role === 1 ? 'pharmacist' : 'customer',
    page,
    limit,
    status,
    type
  )

  return res.json({
    message: CHATS_MESSAGES.GET_CONVERSATIONS_SUCCESS,
    result
  })
}

// Get or create conversation (Customer only - shared inbox)
export const getOrCreateConversationController = async (req: Request, res: Response) => {
  const { userId, role } = req.decoded_authorization as TokenPayload
  const { type = 'ai' } = req.body

  if (role !== 0) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      message: CHATS_MESSAGES.ONLY_CUSTOMERS_CAN_CREATE_CONVERSATION
    })
  }

  const conversation = await chatsService.getOrCreateConversation(userId, type)

  return res.json({
    message: CHATS_MESSAGES.CREATE_CONVERSATION_SUCCESS,
    result: conversation
  })
}

// Send a message
export const sendMessageController = async (
  req: Request<ParamsDictionary, unknown, SendMessageReqBody>,
  res: Response
) => {
  const { userId, role } = req.decoded_authorization as TokenPayload
  const senderRole = role === 1 ? 'pharmacist' : 'customer'

  const message = await chatsService.sendMessage(userId, senderRole, req.body)

  return res.json({
    message: CHATS_MESSAGES.SEND_MESSAGE_SUCCESS,
    result: message
  })
}

// Get messages for a conversation
export const getMessagesController = async (
  req: Request<ParamsDictionary, unknown, unknown, GetMessagesReqQuery>,
  res: Response
) => {
  const { conversationId, page = '1', limit = '50' } = req.query

  if (!conversationId) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      message: CHATS_MESSAGES.CONVERSATION_ID_REQUIRED
    })
  }

  const result = await chatsService.getMessages(conversationId, parseInt(page), parseInt(limit))

  return res.json({
    message: CHATS_MESSAGES.GET_MESSAGES_SUCCESS,
    result
  })
}

// Mark messages as read
export const markAsReadController = async (
  req: Request<ParamsDictionary, unknown, MarkAsReadReqBody>,
  res: Response
) => {
  const { userId, role } = req.decoded_authorization as TokenPayload
  const { conversationId } = req.body
  const userRole = role === 1 ? 'pharmacist' : 'customer'

  await chatsService.markAsRead(conversationId, userId, userRole)

  return res.json({
    message: CHATS_MESSAGES.MARK_AS_READ_SUCCESS
  })
}

// Get conversation details
export const getConversationController = async (req: Request, res: Response) => {
  const { conversationId } = req.params

  const conversation = await chatsService.getConversationById(conversationId as string)

  if (!conversation) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      message: CHATS_MESSAGES.CONVERSATION_NOT_FOUND
    })
  }

  return res.json({
    message: CHATS_MESSAGES.GET_CONVERSATION_SUCCESS,
    result: conversation
  })
}

// Get available pharmacist for chat
export const getAvailablePharmacistController = async (req: Request, res: Response) => {
  const pharmacist = await chatsService.getAvailablePharmacist()

  if (!pharmacist) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      message: CHATS_MESSAGES.NO_PHARMACIST_AVAILABLE
    })
  }

  return res.json({
    message: CHATS_MESSAGES.GET_PHARMACIST_SUCCESS,
    result: pharmacist
  })
}

// Assign pharmacist to conversation (manual or auto)
export const assignConversationController = async (req: Request, res: Response) => {
  const { conversationId } = req.params
  const { userId, role } = req.decoded_authorization as TokenPayload

  // Only pharmacist can manually assign
  if (role !== 1) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      message: 'Chỉ dược sĩ mới có thể nhận cuộc trò chuyện'
    })
  }

  const conversation = await chatsService.getConversationById(conversationId as string)
  if (!conversation) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      message: CHATS_MESSAGES.CONVERSATION_NOT_FOUND
    })
  }

  // Manually assign this pharmacist to the conversation
  await chatsService.assignConversationToPharmacist(conversationId as string, userId as string)

  return res.json({
    message: 'Đã nhận cuộc trò chuyện thành công',
    result: { conversationId, pharmacistId: userId }
  })
}

// Delete conversation
export const deleteConversationController = async (req: Request, res: Response) => {
  const { conversationId } = req.params
  const { userId } = req.decoded_authorization as TokenPayload

  await chatsService.deleteConversation(conversationId as string, userId)

  return res.json({
    message: CHATS_MESSAGES.DELETE_CONVERSATION_SUCCESS
  })
}

// Save user feedback for a message
export const saveMessageFeedbackController = async (req: Request, res: Response) => {
  const { messageId } = req.params
  const { userId } = req.decoded_authorization as TokenPayload
  const { feedback } = req.body

  if (!feedback || !['up', 'down'].includes(feedback)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      message: 'Feedback phải là "up" hoặc "down"'
    })
  }

  await chatsService.saveMessageFeedback(messageId, userId, feedback)

  return res.json({
    message: 'Lưu feedback tin nhắn thành công'
  })
}

// ── AI Chat Controllers (Phase 3) ─────────────────────────────────────────────

/**
 * POST /api/chats/ai-message
 * Non-streaming AI chat — trả JSON response sau khi AI hoàn thành
 */
export const aiChatController = async (
  req: Request<ParamsDictionary, unknown, AIChatReqBody>,
  res: Response
) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const { message, conversation_id, context_products } = req.body

  // 1. Rate limit check (Redis, 30 msg/user/hour)
  const rateCheck = await checkAIRateLimit(userId)
  if (!rateCheck.allowed) {
    return res.status(429).json({
      message: `Bạn đã vượt giới hạn ${30} tin nhắn/giờ với AI. Vui lòng thử lại sau ${Math.ceil(rateCheck.resetIn / 60)} phút.`,
      resetIn: rateCheck.resetIn
    })
  }

  // 2. Check response dedup cache
  const cached = await getResponseCache(conversation_id, message)
  if (cached) {
    return res.json({
      message: 'Phản hồi từ AI thành công',
      result: cached,
      cached: true
    })
  }

  // 3. Load history từ MongoDB (bao gồm cả tin pharmacist thật)
  const history = await buildHistory(conversation_id)

  // 4. Gọi AI Service
  const aiResponse = await sendToAI({
    message,
    conversation_id,
    user_id: userId,
    history,
    context_products: context_products || []
  })

  // 5. Save vào MongoDB (async, không block user)
  saveAIReplyAsync(conversation_id, message, aiResponse, userId)

  // 6. Cache response (async, không block)
  setResponseCache(conversation_id, message, aiResponse)

  return res.json({
    message: 'Phản hồi từ AI thành công',
    result: aiResponse,
    cached: false,
    rateLimit: { remaining: rateCheck.remaining, resetIn: rateCheck.resetIn }
  })
}

/**
 * GET /api/chats/ai-stream?message=...&conversation_id=...&context_products=...
 * SSE Streaming AI chat — forward chunks từ AI Service về FE theo thời gian thực
 */
export const aiStreamController = async (
  req: Request<ParamsDictionary, unknown, unknown, AIStreamReqQuery>,
  res: Response
) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const { message, conversation_id, context_products: contextStr } = req.query

  if (!message || !conversation_id) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      message: 'message và conversation_id là bắt buộc'
    })
  }

  // 1. Rate limit check
  const rateCheck = await checkAIRateLimit(userId)
  if (!rateCheck.allowed) {
    return res.status(429).json({
      message: `Bạn đã vượt giới hạn tin nhắn AI. Thử lại sau ${Math.ceil(rateCheck.resetIn / 60)} phút.`
    })
  }

  // 2. Parse context products
  let contextProducts: any[] = []
  if (contextStr) {
    try {
      contextProducts = JSON.parse(contextStr)
    } catch {
      // Ignore malformed context
    }
  }

  // 3. Load history từ MongoDB
  const history = await buildHistory(conversation_id)

  // 4. Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // Nginx: disable buffering
  res.flushHeaders()

  // Heartbeat mỗi 15s để giữ connection alive qua proxy/nginx
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n')
  }, 15_000)

  // 5. Stream từ AI Service
  await streamFromAI(
    {
      message,
      conversation_id,
      user_id: userId,
      history,
      context_products: contextProducts
    },
    (chunk) => {
      res.write(chunk)
    },
    (finalResponse) => {
      // Khi stream done: lưu MongoDB + cache (async)
      saveAIReplyAsync(conversation_id, message, finalResponse, userId)
      setResponseCache(conversation_id, message, finalResponse)
    },
    (err) => {
      console.error('[AI Stream] Error:', err.message)
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'AI service không phản hồi. Vui lòng thử lại.' })}\n\n`)
    }
  )

  clearInterval(heartbeat)
  res.write('data: [DONE]\n\n')
  res.end()
}

