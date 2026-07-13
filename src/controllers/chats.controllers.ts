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
import { getIO } from '~/sockets/chat.socket'

const chatRoleFromToken = (role?: number) =>
  role === UserRole.Pharmacist ? 'pharmacist' : role === UserRole.Admin ? 'admin' : 'customer'

const firstParam = (value: string | string[] | undefined, fallback = '') =>
  Array.isArray(value) ? value[0] || fallback : value || fallback

async function ensureLicensedOnlinePharmacist(userId: string) {
  const pharmacist = await databaseService.users.findOne({ _id: new ObjectId(userId), role: UserRole.Pharmacist })
  if (!pharmacist?.lisenseNumber || pharmacist.isOnline === false) {
    return false
  }
  return true
}

function validateAIMessageInput(message: string, conversationId: string, contextProducts?: unknown[], imageUrl?: string) {
  const hasMessage = typeof message === 'string' && message.trim().length > 0
  const hasImage = typeof imageUrl === 'string' && imageUrl.trim().length > 0
  if (!hasMessage && !hasImage) return 'message or image_url is required'
  if (message && message.length > 2000) return 'message must not exceed 2000 characters'
  if (!conversationId || !ObjectId.isValid(conversationId)) return 'conversation_id is invalid'
  if (hasImage && !/^https?:\/\//i.test(imageUrl.trim())) return 'image_url must be an http(s) URL'
  if (contextProducts && (!Array.isArray(contextProducts) || contextProducts.length > 10)) {
    return 'context_products must be an array with at most 10 items'
  }
  return null
}

async function loadMedicalContext(userId: string): Promise<Record<string, any> | null> {
  try {
    const info = await databaseService.patientMedicalInfos.findOne(
      { customer_id: new ObjectId(userId) },
      { projection: { allergies: 1, chronic_diseases: 1, current_medications: 1, blood_type: 1 } }
    )
    if (!info) return null
    const hasData =
      (info.allergies?.length ?? 0) > 0 ||
      (info.chronic_diseases?.length ?? 0) > 0 ||
      (info.current_medications?.length ?? 0) > 0 ||
      Boolean(info.blood_type)
    if (!hasData) return null

    return {
      allergies: info.allergies ?? [],
      chronic_diseases: info.chronic_diseases ?? [],
      current_medications: (info.current_medications ?? []).map((m: any) => ({
        drug_name: m.drug_name,
        dosage: m.dosage,
        frequency: m.frequency
      })),
      blood_type: info.blood_type ?? null
    }
  } catch (err) {
    console.error('[AI Chat] loadMedicalContext error:', err)
    return null
  }
}

async function loadCommerceContext(userId: string): Promise<Record<string, any>> {
  const userObjectId = new ObjectId(userId)
  const [orders, loyalty, returnRequests] = await Promise.all([
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
      .catch(() => []),
    loyaltyService.getAccountInfo(userObjectId).catch(() => null),
    databaseService.returnRequests
      .find(
        { userId: userObjectId },
        {
          projection: {
            requestNumber: 1,
            orderNumber: 1,
            status: 1,
            type: 1,
            reason: 1,
            requestedAmount: 1,
            approvedAmount: 1,
            refundedAmount: 1,
            refundTransactionId: 1,
            refundedAt: 1,
            items: 1,
            createdAt: 1,
            updatedAt: 1
          }
        }
      )
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray()
      .catch(() => [])
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

  if (returnRequests.length > 0) {
    context.returnRequests = returnRequests.map((request: any) => ({
      _id: request._id?.toString(),
      requestNumber: request.requestNumber,
      orderNumber: request.orderNumber,
      status: request.status,
      type: request.type,
      reason: request.reason,
      requestedAmount: request.requestedAmount,
      approvedAmount: request.approvedAmount,
      refundedAmount: request.refundedAmount,
      refundTransactionId: request.refundTransactionId,
      refundedAt: request.refundedAt,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      items: (request.items || []).slice(0, 5).map((item: any) => ({
        name: item.productName,
        quantity: item.quantity,
        unit: item.unit,
        returnReason: item.returnReason
      }))
    }))
  } else {
    context.noReturnRequestsFound = true
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

  if (senderRole === 'pharmacist' && !(await ensureLicensedOnlinePharmacist(userId))) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      message: 'Dược sĩ cần có chứng chỉ hành nghề và đang online để tư vấn'
    })
  }

  const message = await chatsService.sendMessage(userId, senderRole, req.body)

  try {
    const io = getIO()
    const conversationId = message.conversationId.toString()
    const conversation = await chatsService.getConversationById(conversationId)

    io.to(`conversation:${conversationId}`).emit('message:new', message)

    if (senderRole === 'customer') {
      if (conversation?.pharmacistId) {
        io.to(`user:${conversation.pharmacistId.toString()}`).emit('message:new', message)
      } else {
        io.to('pharmacists').emit('message:new', message)
      }
    } else if (conversation?.customerId) {
      io.to(`user:${conversation.customerId.toString()}`).emit('message:new', message)
    }
  } catch {
    // REST response must not fail if realtime delivery is unavailable.
  }

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

  const conversationIdStr = firstParam(conversationId)
  await chatsService.assertConversationAccess(conversationIdStr, userId, chatRoleFromToken(role))

  const result = await chatsService.getMessages(
    conversationIdStr,
    parseInt(firstParam(page, '1')),
    parseInt(firstParam(limit, '50'))
  )

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

  await chatsService.assertConversationAccess(conversationId as string, userId, chatRoleFromToken(role))

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

  if (!(await ensureLicensedOnlinePharmacist(userId))) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      message: 'Dược sĩ cần có chứng chỉ hành nghề và đang online để nhận cuộc trò chuyện'
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

  try {
    const io = getIO()
    const payload = { conversationId, pharmacistId: userId }
    io.to(`conversation:${conversationId}`).emit('conversation:assigned', payload)
    io.to('pharmacists').emit('conversation:assigned', payload)
  } catch {
    /* socket not critical */
  }

  return res.json({
    message: 'Đã nhận cuộc trò chuyện thành công',
    result: { conversationId, pharmacistId: userId }
  })
}

// Delete conversation
export const deleteConversationController = async (req: Request, res: Response) => {
  const { conversationId } = req.params
  const { userId } = req.decoded_authorization as TokenPayload
  const conversation = await chatsService.getConversationById(conversationId as string)

  await chatsService.deleteConversation(conversationId as string, userId)

  try {
    const io = getIO()
    const payload = {
      conversationId,
      closedBy: userId,
      closedAt: new Date().toISOString()
    }
    io.to(`conversation:${conversationId}`).emit('conversation:closed', payload)
    if (conversation?.customerId) io.to(`user:${conversation.customerId.toString()}`).emit('conversation:closed', payload)
    if (conversation?.pharmacistId) io.to(`user:${conversation.pharmacistId.toString()}`).emit('conversation:closed', payload)
    io.to('pharmacists').emit('conversation:closed', payload)
  } catch {
    /* socket not critical */
  }

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

  await chatsService.saveMessageFeedback(firstParam(messageId), userId, feedback)

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
  const messageText = message || ''

  const inputError = validateAIMessageInput(messageText, conversation_id, context_products, image_url)
  if (inputError) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: inputError })
  }

  const conversation = await chatsService.assertConversationAccess(conversation_id, userId, 'customer')
  if (conversation.status === 'closed') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: 'Conversation is closed' })
  }

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

  const contextData: Record<string, any> = {}
  if (medicalInfo) contextData.medicalInfo = medicalInfo
  Object.assign(contextData, commerceContext)
  const contextDataOrNull = Object.keys(contextData).length > 0 ? contextData : null
  const contextProducts = context_products || []

  // 2. Check response dedup cache. Skip images because each image is unique.
  const cached = image_url
    ? null
    : await getResponseCache(userId, conversation_id, messageText, medicalInfo, contextProducts, contextDataOrNull)
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
    message: messageText,
    conversation_id,
    user_id: userId,
    history,
    context_products: contextProducts,
    context_data: contextDataOrNull,
    image_url: image_url || undefined
  })

  // 5. Save vào MongoDB (async, không block user)
  saveAIReplyAsync(conversation_id, messageText, aiResponse, userId)

  // 6. Cache response (async, không block)
  if (!image_url) {
    setResponseCache(userId, conversation_id, messageText, aiResponse, medicalInfo, contextProducts, contextDataOrNull)
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
  const { message, conversation_id, context_products: contextStr, image_url } = req.query
  const messageText = firstParam(message)
  const conversationId = firstParam(conversation_id)
  const imageUrl = firstParam(image_url)

  if ((!messageText && !imageUrl) || !conversationId) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      message: 'message và conversation_id là bắt buộc'
    })
  }

  const inputError = validateAIMessageInput(messageText, conversationId, undefined, imageUrl || undefined)
  if (inputError) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: inputError })
  }

  if (!ObjectId.isValid(conversationId)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: 'conversation_id is invalid' })
  }

  const conversation = await chatsService.assertConversationAccess(conversationId, userId, 'customer')
  if (conversation.status === 'closed') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: 'Conversation is closed' })
  }

  // 1. Rate limit check
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
      if (!Array.isArray(contextProducts) || contextProducts.length > 10) contextProducts = []
    } catch {
      // Ignore malformed context
    }
  }

  // 3. Load history từ MongoDB
  const history = await buildHistory(conversationId)

  const contextData: Record<string, any> = {}
  if (medicalInfo) contextData.medicalInfo = medicalInfo
  Object.assign(contextData, commerceContext)
  const contextDataOrNull = Object.keys(contextData).length > 0 ? contextData : null

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
      message: messageText,
      conversation_id: conversationId,
      user_id: userId,
      history,
      context_products: contextProducts,
      context_data: contextDataOrNull,
      image_url: imageUrl || undefined
    },
    (chunk) => {
      res.write(chunk)
    },
    (finalResponse) => {
      // Khi stream done: lưu MongoDB + cache (async)
      saveAIReplyAsync(conversationId, messageText, finalResponse, userId)
      if (!imageUrl) {
        setResponseCache(userId, conversationId, messageText, finalResponse, medicalInfo, contextProducts, contextDataOrNull)
      }
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
