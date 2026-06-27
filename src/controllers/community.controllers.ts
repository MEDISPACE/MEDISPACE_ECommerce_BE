import { NextFunction, Request, Response } from 'express'
import { ObjectId } from 'mongodb'
import { TokenPayload } from '~/models/requests/User.request'
import communityService from '~/services/community.services'
import moderationService from '~/services/moderation.services'

export const listRoomsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { visibility, diseaseKey, search, sort } = req.query as {
      visibility?: any
      diseaseKey?: any
      search?: any
      sort?: any
    }
    const rooms = await communityService.listRooms({
      visibility: visibility === 'public' || visibility === 'private' ? visibility : undefined,
      diseaseKey: typeof diseaseKey === 'string' ? diseaseKey : undefined,
      search: typeof search === 'string' ? search : undefined,
      sort: ['activity', 'newest', 'members', 'messages', 'featured'].includes(sort) ? sort : undefined
    })
    return res.status(200).json({ message: 'OK', data: rooms })
  } catch (error) {
    next(error)
  }
}

export const listMyRoomsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, role } = req.decoded_authorization as TokenPayload
    const { visibility, diseaseKey, search, sort } = req.query as {
      visibility?: any
      diseaseKey?: any
      search?: any
      sort?: any
    }
    const rooms = await communityService.listRooms({
      visibility: visibility === 'public' || visibility === 'private' ? visibility : undefined,
      diseaseKey: typeof diseaseKey === 'string' ? diseaseKey : undefined,
      search: typeof search === 'string' ? search : undefined,
      sort: ['activity', 'newest', 'members', 'messages', 'featured'].includes(sort) ? sort : undefined,
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
    const {
      name,
      slug,
      visibility,
      diseaseKey,
      description,
      topicLabel,
      iconKey,
      coverImage,
      guidelines,
      pinnedMessage,
      featured,
      sortOrder
    } = req.body

    const room = await communityService.createRoom({
      name,
      slug,
      visibility,
      diseaseKey,
      description,
      topicLabel,
      iconKey,
      coverImage,
      guidelines,
      pinnedMessage,
      featured,
      sortOrder,
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

export const listThreadsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.decoded_authorization as TokenPayload | undefined
    const roomId = req.params.roomId as unknown as string
    const page = Number((req.query as any).page || 1)
    const limit = Number((req.query as any).limit || 20)
    const q = typeof (req.query as any).q === 'string' ? String((req.query as any).q).trim() : undefined
    const prefix = typeof (req.query as any).prefix === 'string' ? String((req.query as any).prefix).trim() : undefined
    const sort = typeof (req.query as any).sort === 'string' ? String((req.query as any).sort).trim() : undefined

    const result = await communityService.listThreads({
      roomId: new ObjectId(roomId),
      viewer: auth?.userId ? { userId: new ObjectId(auth.userId), role: auth.role } : undefined,
      page,
      limit,
      q,
      prefix,
      sort
    })

    return res.status(200).json({ message: 'OK', data: result })
  } catch (error) {
    next(error)
  }
}

export const createThreadController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.decoded_authorization as TokenPayload
    const roomId = req.params.roomId as unknown as string
    const { title, content, prefix, tags, isAnonymous, imageUrl } = req.body

    const result = await communityService.createThread({
      roomId: new ObjectId(roomId),
      userId: new ObjectId(userId),
      title,
      content,
      prefix,
      tags,
      isAnonymous,
      imageUrl
    })

    return res.status(201).json({ message: 'Tạo thread thành công', data: result })
  } catch (error) {
    next(error)
  }
}

export const getThreadController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.decoded_authorization as TokenPayload | undefined
    const threadId = req.params.threadId as unknown as string
    const thread = await communityService.getThread(new ObjectId(threadId), {
      viewer: auth?.userId ? { userId: new ObjectId(auth.userId), role: auth.role } : undefined,
      incrementView: true
    })
    return res.status(200).json({ message: 'OK', data: thread })
  } catch (error) {
    next(error)
  }
}

export const listThreadRepliesController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.decoded_authorization as TokenPayload | undefined
    const threadId = req.params.threadId as unknown as string
    const page = Number((req.query as any).page || 1)
    const limit = Number((req.query as any).limit || 20)

    const result = await communityService.listThreadReplies({
      threadId: new ObjectId(threadId),
      viewer: auth?.userId ? { userId: new ObjectId(auth.userId), role: auth.role } : undefined,
      page,
      limit
    })

    return res.status(200).json({ message: 'OK', data: result })
  } catch (error) {
    next(error)
  }
}

export const createThreadReplyController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.decoded_authorization as TokenPayload
    const threadId = req.params.threadId as unknown as string
    const { content, imageUrl, replyToMessageId } = req.body

    const result = await communityService.createThreadReply({
      threadId: new ObjectId(threadId),
      userId: new ObjectId(userId),
      content,
      imageUrl,
      replyToMessageId: replyToMessageId ? new ObjectId(replyToMessageId) : undefined
    })

    return res.status(201).json({ message: 'Gửi reply thành công', data: result })
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
    const q = typeof (req.query as any).q === 'string' ? String((req.query as any).q).trim() : undefined

    const result = await communityService.listMessages({
      roomId: new ObjectId(roomId),
      userId: new ObjectId(userId),
      page,
      limit,
      q
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
    const { content, imageUrl, replyToMessageId } = req.body

    const result = await communityService.sendMessage({
      roomId: new ObjectId(roomId),
      userId: new ObjectId(userId),
      content,
      imageUrl,
      replyToMessageId: replyToMessageId ? new ObjectId(replyToMessageId) : undefined
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

export const reactToMessageController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.decoded_authorization as TokenPayload
    const messageId = req.params.messageId as unknown as string
    const { type } = req.body

    const result = await communityService.reactToMessage({
      messageId: new ObjectId(messageId),
      userId: new ObjectId(userId),
      type: type || null
    })

    return res.status(200).json({ message: 'Đã cập nhật reaction', data: result })
  } catch (error) {
    next(error)
  }
}

export const updateMessageController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, role } = req.decoded_authorization as TokenPayload
    const messageId = req.params.messageId as unknown as string
    const { content, imageUrl } = req.body

    const result = await communityService.updateMessage({
      messageId: new ObjectId(messageId),
      userId: new ObjectId(userId),
      role,
      content,
      imageUrl
    })

    return res.status(200).json({ message: 'Đã cập nhật bài viết', data: result })
  } catch (error) {
    next(error)
  }
}

export const deleteMessageController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, role } = req.decoded_authorization as TokenPayload
    const messageId = req.params.messageId as unknown as string

    const result = await communityService.deleteMessage({
      messageId: new ObjectId(messageId),
      userId: new ObjectId(userId),
      role
    })

    return res.status(200).json({ message: 'Đã xóa bài viết', data: result })
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
