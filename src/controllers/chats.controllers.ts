import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import { ObjectId } from 'mongodb'
import chatsService from '~/services/chats.services'
import databaseService from '~/services/database.services'
import loyaltyService from '~/services/loyalty.services'
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
import { UserRole } from '~/constants/enum'

// ── Helper: Load PatientMedicalInfo cho AI context ───────────────────────────────
/**
 * Lấy thông tin y tế của user (dị ứng, bệnh nền, thuốc đang dùng).
 * Trả null nếu không có hoặc query lỗi — AI vẫn chạy bình thường mà không có context này.
 */
async function loadMedicalContext(userId: string): Promise<Record<string, any> | null> {
  try {
    const info = await databaseService.patientMedicalInfos.findOne(
      { customer_id: new ObjectId(userId) },
      { projection: { allergies: 1, chronic_diseases: 1, current_medications: 1, blood_type: 1 } }
    )
    if (!info) return null

    // Chỉ trả về nếu có data thực sự (không gửi object trống về AI)
    const hasData =
      (info.allergies?.length ?? 0) > 0 ||
      (info.chronic_diseases?.length ?? 0) > 0 ||
      (info.current_medications?.length ?? 0) > 0 ||
      Boolean(info.blood_type)
    if (!hasData) return null

    return {
      allergies:           info.allergies           ?? [],
      chronic_diseases:    info.chronic_diseases    ?? [],
      current_medications: (info.current_medications ?? []).map((m: any) => ({
        drug_name:  m.drug_name,
        dosage:     m.dosage,
        frequency:  m.frequency,
      })),
      blood_type: info.blood_type ?? null,
    }
  } catch (err) {
    console.error('[AI Chat] loadMedicalContext error:', err)
    return null
  }
}

async function loadCommerceContext(userId: string): Promise<Record<string, any>> {
  const userObjectId = new ObjectId(userId)

  const [orders, loyalty] = await Promise.all([
    databaseService.orders
      .find(
        { userId: userObjectId },
        {
          projection: {
            orderNumber: 1,
            orderStatus: 1,
            paymentStatus: 1,
            totalAmount: 1,
            items: 1,
            trackingNumber: 1,
            estimatedDeliveryDate: 1,
            createdAt: 1
          }
        }
      )
      .sort({ createdAt: -1 })
      .limit(3)
      .toArray()
      .catch((err) => {
        console.error('[AI Chat] load recent orders error:', err)
        return []
      }),
    loyaltyService.getAccountInfo(userObjectId).catch((err) => {
      console.error('[AI Chat] load loyalty context error:', err)
      return null
    })
  ])

  const context: Record<string, any> = {}

  if (orders.length > 0) {
    context.orders = orders.map((order: any) => ({
      _id: order._id?.toString(),
      orderCode: order.orderNumber,
      status: order.orderStatus,
      paymentStatus: order.paymentStatus,
      totalAmount: order.totalAmount,
      createdAt: order.createdAt,
      trackingCode: order.trackingNumber,
      estimatedDeliveryDate: order.estimatedDeliveryDate,
      items: (order.items || []).slice(0, 5).map((item: any) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        prescriptionRequired: item.prescriptionRequired
      }))
    }))

    context.purchaseHistory = orders
      .flatMap((order: any) =>
        (order.items || []).slice(0, 3).map((item: any) => ({
          date: order.createdAt,
          productName: item.name,
          quantity: item.quantity,
          orderCode: order.orderNumber
        }))
      )
      .slice(0, 5)
  }

  if (loyalty) {
    context.loyalty = {
      points: loyalty.pointsBalance,
      pointsBalance: loyalty.pointsBalance,
      tier: loyalty.tier,
      tierLabel: loyalty.tierLabel,
      totalSpent: loyalty.totalSpent,
      nextTier: loyalty.nextTier,
      nextTierLabel: loyalty.nextTierLabel,
      amountToNextTier: loyalty.amountToNextTier,
      progressToNextTier: loyalty.progressToNextTier
    }
  }

  return context
}

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
  const { userId, role } = req.decoded_authorization as TokenPayload
  const { conversationId, page = '1', limit = '50' } = req.query

  if (!conversationId) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      message: CHATS_MESSAGES.CONVERSATION_ID_REQUIRED
    })
  }

  const conversationIdStr = Array.isArray(conversationId) ? conversationId[0] : conversationId

  await chatsService.assertConversationAccess(
    conversationIdStr,
    userId,
    role === UserRole.Pharmacist ? 'pharmacist' : role === UserRole.Admin ? 'admin' : 'customer'
  )

  const result = await chatsService.getMessages(conversationIdStr, parseInt(page), parseInt(limit))

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
  const { userId, role } = req.decoded_authorization as TokenPayload

  const conversation = await chatsService.getConversationById(conversationId as string)

  if (!conversation) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      message: CHATS_MESSAGES.CONVERSATION_NOT_FOUND
    })
  }

  await chatsService.assertConversationAccess(
    conversationId as string,
    userId,
    role === UserRole.Pharmacist ? 'pharmacist' : role === UserRole.Admin ? 'admin' : 'customer'
  )

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

  const messageIdStr = Array.isArray(messageId) ? messageId[0] : messageId
  await chatsService.saveMessageFeedback(messageIdStr, userId, feedback)

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
  const { message, conversation_id, context_products, image_url } = req.body

  // 1. Rate limit + medical context song song (không tăng latency)
  const [rateCheck, medicalInfo, commerceContext] = await Promise.all([
    checkAIRateLimit(userId),
    loadMedicalContext(userId),
    loadCommerceContext(userId)
  ])

  if (!rateCheck.allowed) {
    return res.status(429).json({
      message: `Bạn đã vượt giới hạn ${30} tin nhắn/giờ với AI. Vui lòng thử lại sau ${Math.ceil(rateCheck.resetIn / 60)} phút.`,
      resetIn: rateCheck.resetIn
    })
  }

  // 2. Check response dedup cache — bỏ qua nếu có ảnh (mỗi ảnh là unique)
  if (!image_url) {
    const cached = await getResponseCache(conversation_id, message, medicalInfo)
    if (cached) {
      return res.json({
        message: 'Phản hồi từ AI thành công',
        result: cached,
        cached: true
      })
    }
  }

  // 3. Load history từ MongoDB (bao gồm cả tin pharmacist thật)
  const history = await buildHistory(conversation_id)

  // 4. Build context_data: chỉ đưa vào fields có data thực sự
  const contextData: Record<string, any> = {}
  if (medicalInfo) contextData.medicalInfo = medicalInfo
  Object.assign(contextData, commerceContext)

  // 5. Gọi AI Service
  const aiResponse = await sendToAI({
    message,
    conversation_id,
    user_id: userId,
    history,
    context_products: context_products || [],
    context_data: Object.keys(contextData).length > 0 ? contextData : null,
    image_url: image_url || undefined                    // Vision
  })

  // 6. Save vào MongoDB (async, không block user)
  saveAIReplyAsync(conversation_id, message, aiResponse, userId)

  // 7. Cache response (async, không block) — bỏ qua nếu có ảnh
  if (!image_url) {
    setResponseCache(conversation_id, message, aiResponse, medicalInfo)
  }

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

  // 1. Rate limit + medical context song song (không tăng latency)
  const [rateCheck, medicalInfo, commerceContext] = await Promise.all([
    checkAIRateLimit(userId),
    loadMedicalContext(userId),
    loadCommerceContext(userId)
  ])

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

  const contextData: Record<string, any> = {}
  if (medicalInfo) contextData.medicalInfo = medicalInfo
  Object.assign(contextData, commerceContext)

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
      context_products: contextProducts,
      context_data: Object.keys(contextData).length > 0 ? contextData : null
    },
    (chunk) => {
      res.write(chunk)
    },
    (finalResponse) => {
      // Khi stream done: lưu MongoDB + cache (async)
      saveAIReplyAsync(conversation_id, message, finalResponse, userId)
      setResponseCache(conversation_id, message, finalResponse, medicalInfo)
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

