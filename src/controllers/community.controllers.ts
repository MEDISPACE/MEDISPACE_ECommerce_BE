import { NextFunction, Request, Response } from 'express'
import { ObjectId } from 'mongodb'
import { TokenPayload } from '~/models/requests/User.request'
import communityService from '~/services/community.services'
import moderationService from '~/services/moderation.services'

export const listRoomsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { diseaseKey } = req.query as { diseaseKey?: any }
    const rooms = await communityService.listRooms({
      diseaseKey: typeof diseaseKey === 'string' ? diseaseKey : undefined
    })
    return res.status(200).json({ message: 'OK', data: rooms })
  } catch (error) {
    next(error)
  }
}

export const listMyRoomsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, role } = req.decoded_authorization as TokenPayload
    const { visibility, diseaseKey } = req.query as { visibility?: any; diseaseKey?: any }
    const rooms = await communityService.listRooms({
      visibility: visibility === 'public' || visibility === 'private' ? visibility : undefined,
      diseaseKey: typeof diseaseKey === 'string' ? diseaseKey : undefined,
      includePrivate: true,
      viewer: { userId: new ObjectId(userId), role }
    })
    return res.status(200).json({ message: 'OK', data: rooms })
  } catch (error) {
    next(error)
  }
}

export const createRoomController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.decoded_authorization as TokenPayload
    const { name, slug, visibility, diseaseKey } = req.body

    const room = await communityService.createRoom({
      name,
      slug,
      visibility,
      diseaseKey,
      createdBy: new ObjectId(userId)
    })

    return res.status(201).json({ message: 'Tạo phòng thành công', data: room })
  } catch (error) {
    next(error)
  }
}

export const joinRoomController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.decoded_authorization as TokenPayload
    const roomId = req.params.roomId as unknown as string

    const result = await communityService.joinRoom(new ObjectId(roomId), new ObjectId(userId))

    return res.status(200).json({ message: 'Tham gia phòng thành công', data: result })
  } catch (error) {
    next(error)
  }
}

export const joinRequestController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.decoded_authorization as TokenPayload
    const roomId = req.params.roomId as unknown as string

    const result = await communityService.requestJoin(new ObjectId(roomId), new ObjectId(userId))

    return res.status(200).json({ message: 'Đã gửi yêu cầu tham gia', data: result })
  } catch (error) {
    next(error)
  }
}

export const leaveRoomController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.decoded_authorization as TokenPayload
    const roomId = req.params.roomId as unknown as string

    const result = await communityService.leaveRoom(new ObjectId(roomId), new ObjectId(userId))

    return res.status(200).json({ message: 'Đã rời phòng', data: result })
  } catch (error) {
    next(error)
  }
}

export const markRoomReadController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.decoded_authorization as TokenPayload
    const roomId = req.params.roomId as unknown as string

    const result = await communityService.markRoomRead(new ObjectId(roomId), new ObjectId(userId))

    return res.status(200).json({ message: 'Đã đánh dấu đã đọc', data: result })
  } catch (error) {
    next(error)
  }
}

export const listMessagesController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.decoded_authorization as TokenPayload
    const roomId = req.params.roomId as unknown as string
    const page = Number((req.query as any).page || 1)
    const limit = Number((req.query as any).limit || 20)

    const result = await communityService.listMessages({
      roomId: new ObjectId(roomId),
      userId: new ObjectId(userId),
      page,
      limit
    })

    return res.status(200).json({ message: 'OK', data: result })
  } catch (error) {
    next(error)
  }
}

export const sendMessageController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.decoded_authorization as TokenPayload
    const roomId = req.params.roomId as unknown as string
    const { content } = req.body

    const result = await communityService.sendMessage({
      roomId: new ObjectId(roomId),
      userId: new ObjectId(userId),
      content
    })

    return res.status(201).json({ message: 'Gửi tin nhắn thành công', data: result })
  } catch (error) {
    next(error)
  }
}

export const reportMessageController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.decoded_authorization as TokenPayload
    const messageId = req.params.messageId as unknown as string
    const { reason } = req.body

    const result = await communityService.reportMessage({
      messageId: new ObjectId(messageId),
      reporterId: new ObjectId(userId),
      reason
    })

    return res.status(201).json({ message: 'Đã báo cáo tin nhắn', data: result })
  } catch (error) {
    next(error)
  }
}

export const createAppealController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.decoded_authorization as TokenPayload
    const roomId = req.params.roomId as unknown as string
    const { type, reason, messageId } = req.body

    const result = await moderationService.createAppeal({
      roomId: new ObjectId(roomId),
      userId: new ObjectId(userId),
      type,
      reason,
      messageId: messageId ? new ObjectId(messageId) : undefined
    })

    return res.status(201).json({ message: 'Đã gửi appeal', data: result })
  } catch (error) {
    next(error)
  }
}
