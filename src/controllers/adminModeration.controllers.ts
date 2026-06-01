import { NextFunction, Request, Response } from 'express'
import { ObjectId } from 'mongodb'
import { TokenPayload } from '~/models/requests/User.request'
import aiModerationService from '~/services/aiModeration.services'
import moderationService from '~/services/moderation.services'

export const getModerationQueueController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Number((req.query as any).page || 1)
    const limit = Number((req.query as any).limit || 20)

    const result = await moderationService.getQueue({ page, limit })

    return res.status(200).json({ message: 'OK', data: result })
  } catch (error) {
    next(error)
  }
}

export const getModerationActionsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Number((req.query as any).page || 1)
    const limit = Number((req.query as any).limit || 20)
    const { roomId, messageId, targetUserId, action } = req.query as Record<string, string | undefined>

    const result = await moderationService.getActions({
      page,
      limit,
      roomId: roomId && ObjectId.isValid(roomId) ? new ObjectId(roomId) : undefined,
      messageId: messageId && ObjectId.isValid(messageId) ? new ObjectId(messageId) : undefined,
      targetUserId: targetUserId && ObjectId.isValid(targetUserId) ? new ObjectId(targetUserId) : undefined,
      action
    })

    return res.status(200).json({ message: 'OK', data: result })
  } catch (error) {
    next(error)
  }
}

export const getModerationAppealsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Number((req.query as any).page || 1)
    const limit = Number((req.query as any).limit || 20)
    const { status } = req.query as { status?: any }

    const result = await moderationService.getAppeals({
      page,
      limit,
      status: status === 'open' || status === 'approved' || status === 'rejected' ? status : undefined
    })

    return res.status(200).json({ message: 'OK', data: result })
  } catch (error) {
    next(error)
  }
}

export const resolveModerationAppealController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.decoded_authorization as TokenPayload
    const { appealId } = req.params
    const { decision, notes } = req.body

    const result = await moderationService.resolveAppeal({
      appealId: new ObjectId(appealId),
      performedBy: new ObjectId(userId),
      decision,
      notes
    })

    return res.status(200).json({ message: 'Đã xử lý appeal', data: result })
  } catch (error) {
    next(error)
  }
}

export const moderateMessageActionController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.decoded_authorization as TokenPayload
    const messageId = req.params.messageId as unknown as string
    const { action, notes, durationMinutes, targetUserId } = req.body

    const result = await moderationService.takeAction({
      messageId: new ObjectId(messageId),
      performedBy: new ObjectId(userId),
      action,
      notes,
      durationMinutes,
      targetUserId: targetUserId ? new ObjectId(targetUserId) : undefined
    })

    return res.status(200).json({ message: 'Đã thực hiện hành động', data: result })
  } catch (error) {
    next(error)
  }
}

export const rerunAiModerationController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const messageId = req.params.messageId as unknown as string
    const result = await aiModerationService.enqueueManualReview(new ObjectId(messageId))

    return res.status(202).json({ message: 'Đã đưa tin nhắn vào hàng chờ AI moderation', data: result })
  } catch (error) {
    next(error)
  }
}
