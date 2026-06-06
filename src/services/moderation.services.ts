import { ObjectId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'
import databaseService from '~/services/database.services'
import { getIO } from '~/sockets/chat.socket'

type MessageStatus = 'visible' | 'hidden' | 'deleted'

type ModerationActionType =
  | 'approve'
  | 'hide'
  | 'delete'
  | 'mute_user'
  | 'ban_user'
  | 'unmute_user'
  | 'unban_user'
  | 'restore_message'
  | 'reopen_finding'

type FindingStatus = 'open' | 'resolved'
type AppealType = 'ban' | 'mute' | 'message'
type AppealStatus = 'open' | 'approved' | 'rejected'
type ModerationTrigger = 'auto' | 'user_report' | 'ai'
type ModerationSeverity = 'low' | 'medium' | 'high' | 'critical'

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

class ModerationService {
  private emitRoom(event: string, roomId: ObjectId, payload: unknown) {
    try {
      getIO().to(`community:room:${roomId.toString()}`).emit(event, payload)
    } catch {
      // Socket is optional for REST flows and tests.
    }
  }

  private emitUser(event: string, userId: ObjectId, payload: unknown) {
    try {
      getIO().to(`user:${userId.toString()}`).emit(event, payload)
    } catch {
      // Socket is optional for REST flows and tests.
    }
  }

  async getQueue(params: {
    page: number
    limit: number
    severity?: ModerationSeverity
    trigger?: ModerationTrigger
    search?: string
  }) {
    const skip = (params.page - 1) * params.limit
    const match: any = { status: 'open' as FindingStatus }
    if (params.severity) match.severity = params.severity
    if (params.trigger) match.trigger = params.trigger

    const pipeline: any[] = [
      { $match: match },
      {
        $lookup: {
          from: process.env.DB_COMMUNITY_MESSAGES_COLLECTION || 'communityMessages',
          localField: 'messageId',
          foreignField: '_id',
          as: 'message'
        }
      },
      { $unwind: { path: '$message', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: process.env.DB_COMMUNITY_ROOMS_COLLECTION || 'communityRooms',
          localField: 'roomId',
          foreignField: '_id',
          as: 'room'
        }
      },
      { $unwind: { path: '$room', preserveNullAndEmptyArrays: true } }
    ]

    const search = params.search?.trim()
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i')
      pipeline.push({
        $match: {
          $or: [
            { 'room.name': regex },
            { 'room.slug': regex },
            { 'room.diseaseKey': regex },
            { 'message.content': regex },
            { categories: regex },
            { reasons: regex }
          ]
        }
      })
    }

    pipeline.push({
      $facet: {
        items: [
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: params.limit },
          {
            $project: {
              roomId: 1,
              messageId: 1,
              senderId: 1,
              room: { name: 1, slug: 1, visibility: 1, diseaseKey: 1 },
              message: { _id: 1, content: 1, senderId: 1, status: 1, createdAt: 1 },
              severity: 1,
              categories: 1,
              confidence: 1,
              reasons: 1,
              ai: 1,
              trigger: 1,
              status: 1,
              reportCount: 1,
              createdAt: 1,
              updatedAt: 1
            }
          }
        ],
        total: [{ $count: 'count' }]
      }
    })

    const [result] = await databaseService.moderationFindings.aggregate(pipeline).toArray()
    const items = result?.items || []
    const total = result?.total?.[0]?.count || 0

    return { items, page: params.page, limit: params.limit, total }
  }

  async takeAction(params: {
    messageId: ObjectId
    performedBy: ObjectId
    action: ModerationActionType
    notes?: string
    durationMinutes?: number
    targetUserId?: ObjectId
  }) {
    const message = await databaseService.communityMessages.findOne({ _id: params.messageId })
    if (!message) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy tin nhắn.', status: HTTP_STATUS.NOT_FOUND })
    }

    const now = new Date()
    const roomId = message.roomId as ObjectId
    const senderId = message.senderId as ObjectId
    const targetUserId = params.targetUserId || senderId

    const currentStatus = message.status as MessageStatus

    if (params.action === 'approve' || params.action === 'restore_message') {
      const restoreContent = message.deletedOriginalContent || message.content
      await databaseService.communityMessages.updateOne(
        { _id: params.messageId },
        {
          $set: {
            status: 'visible' as MessageStatus,
            content: restoreContent,
            updatedAt: now,
            'moderated.autoHidden': false,
            'moderated.reviewedBy': params.performedBy,
            'moderated.reviewedAt': now
          },
          $unset: { deletedOriginalContent: '' }
        }
      )
    }

    if (params.action === 'hide') {
      await databaseService.communityMessages.updateOne(
        { _id: params.messageId },
        {
          $set: {
            status: 'hidden' as MessageStatus,
            updatedAt: now,
            'moderated.reviewedBy': params.performedBy,
            'moderated.reviewedAt': now
          }
        }
      )
    }

    if (params.action === 'delete') {
      await databaseService.communityMessages.updateOne(
        { _id: params.messageId },
        {
          $set: {
            status: 'deleted' as MessageStatus,
            deletedOriginalContent: message.content,
            content: '[deleted]',
            updatedAt: now,
            'moderated.reviewedBy': params.performedBy,
            'moderated.reviewedAt': now
          }
        }
      )
    }

    // Mute / Ban
    if (params.action === 'mute_user') {
      const minutes = Math.max(1, params.durationMinutes || 60)
      const mutedUntil = new Date(Date.now() + minutes * 60 * 1000)
      await databaseService.communityRoomMembers.updateOne(
        { roomId, userId: targetUserId },
        { $set: { mutedUntil, updatedAt: now }, $setOnInsert: { roomId, userId: targetUserId, joinedAt: now } },
        { upsert: true }
      )
    }

    if (params.action === 'unmute_user') {
      await databaseService.communityRoomMembers.updateOne(
        { roomId, userId: targetUserId },
        { $set: { mutedUntil: null, updatedAt: now }, $setOnInsert: { roomId, userId: targetUserId, joinedAt: now } },
        { upsert: true }
      )
    }

    if (params.action === 'ban_user') {
      await databaseService.communityRoomMembers.updateOne(
        { roomId, userId: targetUserId },
        {
          $set: { status: 'banned', updatedAt: now },
          $setOnInsert: { roomId, userId: targetUserId, joinedAt: now }
        },
        { upsert: true }
      )
    }

    if (params.action === 'unban_user') {
      await databaseService.communityRoomMembers.updateOne(
        { roomId, userId: targetUserId },
        {
          $set: { status: 'left', updatedAt: now },
          $setOnInsert: { roomId, userId: targetUserId, joinedAt: now }
        },
        { upsert: true }
      )
    }

    if (params.action === 'reopen_finding') {
      await databaseService.moderationFindings.updateOne(
        { messageId: params.messageId },
        { $set: { status: 'open' as FindingStatus, updatedAt: now } }
      )
    } else {
      await databaseService.moderationFindings.updateOne(
        { messageId: params.messageId },
        { $set: { status: 'resolved' as FindingStatus, updatedAt: now } }
      )
    }

    // Record action
    await databaseService.moderationActions.insertOne({
      roomId,
      messageId: params.messageId,
      action: params.action,
      performedBy: params.performedBy,
      targetUserId,
      notes: params.notes?.trim(),
      durationMinutes: params.action === 'mute_user' ? Math.max(1, params.durationMinutes || 60) : undefined,
      previousMessageStatus: currentStatus,
      createdAt: now
    } as any)

    const updatedMessage = await databaseService.communityMessages.findOne({ _id: params.messageId })

    if (['approve', 'restore_message'].includes(params.action)) {
      this.emitRoom('community:message:new', roomId, updatedMessage)
    }
    if (params.action === 'hide') {
      this.emitRoom('community:message:hidden', roomId, updatedMessage)
    }
    if (params.action === 'delete') {
      this.emitRoom('community:message:deleted', roomId, updatedMessage)
    }
    if (['mute_user', 'unmute_user', 'ban_user', 'unban_user'].includes(params.action)) {
      this.emitUser(`community:member:${params.action}`, targetUserId, { roomId, targetUserId, action: params.action })
      this.emitRoom('community:member:updated', roomId, { roomId, targetUserId, action: params.action })
    }

    return { message: updatedMessage }
  }

  async getActions(params: {
    page: number
    limit: number
    roomId?: ObjectId
    messageId?: ObjectId
    targetUserId?: ObjectId
    action?: string
    dateFrom?: Date
    dateTo?: Date
  }) {
    const skip = (params.page - 1) * params.limit
    const query: any = {}
    if (params.roomId) query.roomId = params.roomId
    if (params.messageId) query.messageId = params.messageId
    if (params.targetUserId) query.targetUserId = params.targetUserId
    if (params.action) query.action = params.action
    if (params.dateFrom || params.dateTo) {
      query.createdAt = {}
      if (params.dateFrom) query.createdAt.$gte = params.dateFrom
      if (params.dateTo) query.createdAt.$lte = params.dateTo
    }

    const [items, total] = await Promise.all([
      databaseService.moderationActions
        .aggregate([
          { $match: query },
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: params.limit },
          {
            $lookup: {
              from: process.env.USERS_COLLECTION || 'users',
              localField: 'performedBy',
              foreignField: '_id',
              as: 'performedByUser'
            }
          },
          { $unwind: { path: '$performedByUser', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: process.env.USERS_COLLECTION || 'users',
              localField: 'targetUserId',
              foreignField: '_id',
              as: 'targetUser'
            }
          },
          { $unwind: { path: '$targetUser', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              roomId: 1,
              messageId: 1,
              action: 1,
              performedBy: 1,
              targetUserId: 1,
              notes: 1,
              durationMinutes: 1,
              previousMessageStatus: 1,
              createdAt: 1,
              performedByUser: { _id: 1, firstName: 1, lastName: 1, avatar: 1, role: 1 },
              targetUser: { _id: 1, firstName: 1, lastName: 1, avatar: 1, role: 1, email: 1 }
            }
          }
        ])
        .toArray(),
      databaseService.moderationActions.countDocuments(query)
    ])

    return { items, page: params.page, limit: params.limit, total }
  }

  async createAppeal(params: { roomId: ObjectId; userId: ObjectId; type: AppealType; reason: string; messageId?: ObjectId }) {
    const room = await databaseService.communityRooms.findOne({ _id: params.roomId, status: 'active' })
    if (!room) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy phòng cộng đồng.', status: HTTP_STATUS.NOT_FOUND })
    }

    const member = await databaseService.communityRoomMembers.findOne({ roomId: params.roomId, userId: params.userId })
    const now = new Date()

    if (params.type === 'ban' && member?.status !== 'banned') {
      throw new ErrorWithStatus({ message: 'Tài khoản chưa bị ban trong phòng này.', status: HTTP_STATUS.BAD_REQUEST })
    }

    if (params.type === 'mute') {
      const mutedUntil = member?.mutedUntil ? new Date(member.mutedUntil) : null
      if (!mutedUntil || mutedUntil.getTime() <= now.getTime()) {
        throw new ErrorWithStatus({ message: 'Tài khoản chưa bị mute trong phòng này.', status: HTTP_STATUS.BAD_REQUEST })
      }
    }

    let message = null
    if (params.type === 'message') {
      if (!params.messageId) {
        throw new ErrorWithStatus({ message: 'messageId là bắt buộc khi appeal tin nhắn.', status: HTTP_STATUS.BAD_REQUEST })
      }
      message = await databaseService.communityMessages.findOne({
        _id: params.messageId,
        roomId: params.roomId,
        senderId: params.userId
      })
      if (!message) {
        throw new ErrorWithStatus({ message: 'Không tìm thấy tin nhắn cần appeal.', status: HTTP_STATUS.NOT_FOUND })
      }
    }

    const duplicate = await databaseService.moderationAppeals.findOne({
      roomId: params.roomId,
      userId: params.userId,
      type: params.type,
      status: 'open' as AppealStatus,
      ...(params.messageId ? { messageId: params.messageId } : {})
    })
    if (duplicate) {
      throw new ErrorWithStatus({ message: 'Bạn đã gửi appeal và đang chờ xử lý.', status: HTTP_STATUS.CONFLICT })
    }

    const appeal = {
      roomId: params.roomId,
      userId: params.userId,
      type: params.type,
      reason: params.reason.trim(),
      messageId: params.messageId,
      status: 'open' as AppealStatus,
      createdAt: now,
      updatedAt: now
    }
    const result = await databaseService.moderationAppeals.insertOne(appeal as any)
    const storedAppeal = { _id: result.insertedId, ...appeal }
    this.emitUser('community:appeal:created', params.userId, storedAppeal)
    return storedAppeal
  }

  async getAppeals(params: {
    page: number
    limit: number
    status?: AppealStatus
    type?: AppealType
    roomId?: ObjectId
    userId?: ObjectId
    search?: string
  }) {
    const skip = (params.page - 1) * params.limit
    const query: any = {}
    if (params.status) query.status = params.status
    if (params.type) query.type = params.type
    if (params.roomId) query.roomId = params.roomId
    if (params.userId) query.userId = params.userId

    const pipeline: any[] = [
      { $match: query },
      {
        $lookup: {
          from: process.env.USERS_COLLECTION || 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: process.env.DB_COMMUNITY_ROOMS_COLLECTION || 'communityRooms',
          localField: 'roomId',
          foreignField: '_id',
          as: 'room'
        }
      },
      { $unwind: { path: '$room', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: process.env.DB_COMMUNITY_MESSAGES_COLLECTION || 'communityMessages',
          localField: 'messageId',
          foreignField: '_id',
          as: 'message'
        }
      },
      { $unwind: { path: '$message', preserveNullAndEmptyArrays: true } }
    ]

    const search = params.search?.trim()
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i')
      pipeline.push({
        $match: {
          $or: [
            { reason: regex },
            { decisionNotes: regex },
            { 'user.email': regex },
            { 'user.firstName': regex },
            { 'user.lastName': regex },
            { 'room.name': regex },
            { 'room.slug': regex },
            { 'message.content': regex }
          ]
        }
      })
    }

    pipeline.push({
      $facet: {
        items: [
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: params.limit },
          {
            $project: {
              roomId: 1,
              userId: 1,
              messageId: 1,
              type: 1,
              reason: 1,
              status: 1,
              decisionNotes: 1,
              reviewedBy: 1,
              reviewedAt: 1,
              createdAt: 1,
              updatedAt: 1,
              user: { _id: 1, firstName: 1, lastName: 1, avatar: 1, role: 1, email: 1 },
              room: { _id: 1, name: 1, slug: 1, visibility: 1, diseaseKey: 1 },
              message: { _id: 1, content: 1, status: 1, createdAt: 1 }
            }
          }
        ],
        total: [{ $count: 'count' }]
      }
    })

    const [result] = await databaseService.moderationAppeals.aggregate(pipeline).toArray()
    const items = result?.items || []
    const total = result?.total?.[0]?.count || 0

    return { items, page: params.page, limit: params.limit, total }
  }

  async resolveAppeal(params: { appealId: ObjectId; performedBy: ObjectId; decision: 'approved' | 'rejected'; notes?: string }) {
    const appeal = await databaseService.moderationAppeals.findOne({ _id: params.appealId })
    if (!appeal) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy appeal.', status: HTTP_STATUS.NOT_FOUND })
    }
    if (appeal.status !== 'open') {
      throw new ErrorWithStatus({ message: 'Appeal đã được xử lý.', status: HTTP_STATUS.CONFLICT })
    }

    const now = new Date()
    const roomId = appeal.roomId as ObjectId
    const userId = appeal.userId as ObjectId
    const type = appeal.type as AppealType

    if (params.decision === 'approved') {
      if (type === 'ban') {
        await databaseService.communityRoomMembers.updateOne(
          { roomId, userId },
          { $set: { status: 'left', updatedAt: now } }
        )
        this.emitUser('community:member:unban_user', userId, { roomId, targetUserId: userId, action: 'unban_user' })
        this.emitRoom('community:member:updated', roomId, { roomId, targetUserId: userId, action: 'unban_user' })
      }
      if (type === 'mute') {
        await databaseService.communityRoomMembers.updateOne(
          { roomId, userId },
          { $set: { mutedUntil: null, updatedAt: now } }
        )
        this.emitUser('community:member:unmute_user', userId, { roomId, targetUserId: userId, action: 'unmute_user' })
        this.emitRoom('community:member:updated', roomId, { roomId, targetUserId: userId, action: 'unmute_user' })
      }
      if (type === 'message' && appeal.messageId) {
        await this.takeAction({
          messageId: appeal.messageId as ObjectId,
          performedBy: params.performedBy,
          action: 'restore_message',
          notes: params.notes,
          targetUserId: userId
        })
      }
    }

    await databaseService.moderationAppeals.updateOne(
      { _id: params.appealId },
      {
        $set: {
          status: params.decision as AppealStatus,
          decisionNotes: params.notes?.trim(),
          reviewedBy: params.performedBy,
          reviewedAt: now,
          updatedAt: now
        }
      }
    )

    const updatedAppeal = await databaseService.moderationAppeals.findOne({ _id: params.appealId })
    this.emitUser('community:appeal:resolved', userId, updatedAppeal)
    return updatedAppeal
  }
}

const moderationService = new ModerationService()
export default moderationService
