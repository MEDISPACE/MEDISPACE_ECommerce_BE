import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import chatsService from '~/services/chats.services'
import {
  SendMessageReqBody,
  GetMessagesReqQuery,
  MarkAsReadReqBody,
  GetConversationsReqQuery
} from '~/models/requests/Chat.request'
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

