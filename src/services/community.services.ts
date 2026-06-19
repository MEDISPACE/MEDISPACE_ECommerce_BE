import { ObjectId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { UserRole } from '~/constants/enum'
import { ErrorWithStatus } from '~/models/Error'
import aiModerationService from '~/services/aiModeration.services'
import databaseService from '~/services/database.services'
import { getIO } from '~/sockets/chat.socket'
import { moderateTextRuleBased } from '~/utils/moderation/moderationEngine'

type RoomVisibility = 'public' | 'private'
type RoomStatus = 'active' | 'archived'

type MemberRole = 'member' | 'moderator' | 'admin'
type MemberStatus = 'pending' | 'invited' | 'active' | 'left' | 'banned'

type MessageStatus = 'visible' | 'hidden' | 'deleted'

type FindingStatus = 'open' | 'resolved'

type ModerationTrigger = 'auto' | 'user_report' | 'ai'

type AuthContext = {
  userId?: ObjectId
  role?: UserRole
}

function slugify(input: string): string {
  const base = (input || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return base || `room-${Date.now()}`
}

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function emitCommunity(event: string, roomId: ObjectId | string, payload: unknown) {
  try {
    getIO().to(`community:room:${roomId.toString()}`).emit(event, payload)
  } catch {
    // Socket is optional for REST flows and tests.
  }
}

function emitToUser(event: string, userId: ObjectId | string, payload: unknown) {
  try {
    getIO().to(`user:${userId.toString()}`).emit(event, payload)
  } catch {
    // Socket is optional for REST flows and tests.
  }
}

function emitToAdmins(event: string, payload: unknown) {
  try {
    getIO().to('admins').emit(event, payload)
  } catch {
    // Socket is optional for REST flows and tests.
  }
}

class CommunityService {
  private roomMetricsPipeline(match: Record<string, unknown>, viewerId?: ObjectId) {
    const pipeline: any[] = [
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: process.env.DB_COMMUNITY_ROOM_MEMBERS_COLLECTION || 'communityRoomMembers',
          let: { roomId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$roomId', '$$roomId'] }, { $eq: ['$status', 'active'] }]
                }
              }
            },
            { $count: 'count' }
          ],
          as: 'memberStats'
        }
      },
      {
        $lookup: {
          from: process.env.DB_COMMUNITY_MESSAGES_COLLECTION || 'communityMessages',
          let: { roomId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$roomId', '$$roomId'] }, { $eq: ['$status', 'visible'] }]
                }
              }
            },
            { $sort: { createdAt: -1 } },
            {
              $group: {
                _id: '$roomId',
                messageCount: { $sum: 1 },
                lastMessageAt: { $first: '$createdAt' },
                lastMessagePreview: { $first: '$content' }
              }
            }
          ],
          as: 'messageStats'
        }
      }
    ]

    if (viewerId) {
      pipeline.push({
        $lookup: {
          from: process.env.DB_COMMUNITY_ROOM_MEMBERS_COLLECTION || 'communityRoomMembers',
          let: { roomId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$roomId', '$$roomId'] }, { $eq: ['$userId', viewerId] }]
                }
              }
            },
            { $limit: 1 }
          ],
          as: 'viewerMembership'
        }
      })
      pipeline.push({
        $lookup: {
          from: process.env.DB_COMMUNITY_MESSAGES_COLLECTION || 'communityMessages',
          let: {
            roomId: '$_id',
            lastReadAt: {
              $ifNull: [{ $arrayElemAt: ['$viewerMembership.lastReadAt', 0] }, new Date(0)]
            }
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$roomId', '$$roomId'] },
                    { $eq: ['$status', 'visible'] },
                    { $gt: ['$createdAt', '$$lastReadAt'] },
                    { $ne: ['$senderId', viewerId] }
                  ]
                }
              }
            },
            { $count: 'count' }
          ],
          as: 'unreadStats'
        }
      })
    }

    const addFields: any = {
        memberCount: { $ifNull: [{ $arrayElemAt: ['$memberStats.count', 0] }, 0] },
        messageCount: { $ifNull: [{ $arrayElemAt: ['$messageStats.messageCount', 0] }, 0] },
        lastMessageAt: { $arrayElemAt: ['$messageStats.lastMessageAt', 0] },
        lastMessagePreview: { $arrayElemAt: ['$messageStats.lastMessagePreview', 0] },
        unreadCount: 0
    }
    if (viewerId) {
      addFields.viewerMembership = { $arrayElemAt: ['$viewerMembership', 0] }
      addFields.unreadCount = { $ifNull: [{ $arrayElemAt: ['$unreadStats.count', 0] }, 0] }
    }
    pipeline.push({ $addFields: addFields })
    pipeline.push({
      $project: {
        memberStats: 0,
        messageStats: 0,
        unreadStats: 0
      }
    })

    return pipeline
  }

  async listRooms(filters?: { visibility?: RoomVisibility; diseaseKey?: string; viewer?: AuthContext; includePrivate?: boolean }) {
    const query: any = { status: 'active' as RoomStatus }
    if (filters?.diseaseKey) query.diseaseKey = filters.diseaseKey

    const viewerId = filters?.viewer?.userId
    const isAdmin = filters?.viewer?.role === UserRole.Admin

    if (filters?.includePrivate && isAdmin) {
      if (filters.visibility) query.visibility = filters.visibility
      return databaseService.communityRooms.aggregate(this.roomMetricsPipeline(query, viewerId)).toArray()
    }

    if (filters?.includePrivate && viewerId) {
      const memberships = await databaseService.communityRoomMembers
        .find({ userId: viewerId, status: { $in: ['active', 'invited', 'pending', 'banned'] } })
        .project({ roomId: 1 })
        .toArray()
      const allowedPrivateRoomIds = memberships.map((member: any) => member.roomId).filter(Boolean)

      query.$or = [{ visibility: 'public' }]
      if (allowedPrivateRoomIds.length > 0) {
        query.$or.push({ _id: { $in: allowedPrivateRoomIds }, visibility: 'private' })
      }
      if (filters.visibility) {
        query.visibility = filters.visibility
        delete query.$or
        if (filters.visibility === 'private') {
          query._id = { $in: allowedPrivateRoomIds }
        }
      }
    } else {
      query.visibility = 'public'
    }

    return databaseService.communityRooms.aggregate(this.roomMetricsPipeline(query, viewerId)).toArray()
  }

  async listAdminRooms(filters?: { visibility?: RoomVisibility; status?: RoomStatus; diseaseKey?: string; search?: string }) {
    const query: any = {}
    if (filters?.visibility) query.visibility = filters.visibility
    if (filters?.status) query.status = filters.status
    if (filters?.diseaseKey) query.diseaseKey = filters.diseaseKey
    const search = filters?.search?.trim()
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i')
      query.$or = [{ name: regex }, { slug: regex }, { diseaseKey: regex }]
    }
    return databaseService.communityRooms.aggregate(this.roomMetricsPipeline(query)).toArray()
  }

  async createRoom(params: {
    name: string
    slug?: string
    visibility: RoomVisibility
    diseaseKey?: string
    createdBy: ObjectId
  }) {
    const now = new Date()
    const doc = {
      name: params.name.trim(),
      slug: (params.slug || slugify(params.name)).trim(),
      visibility: params.visibility,
      diseaseKey: params.diseaseKey?.trim() || undefined,
      status: 'active' as RoomStatus,
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now
    }

    try {
      const result = await databaseService.communityRooms.insertOne(doc as any)
      return { _id: result.insertedId, ...doc }
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ErrorWithStatus({
          message: 'Slug đã tồn tại, vui lòng chọn slug khác.',
          status: HTTP_STATUS.CONFLICT
        })
      }
      throw err
    }
  }

  async updateRoom(roomId: ObjectId, params: { name?: string; slug?: string; visibility?: RoomVisibility; diseaseKey?: string }) {
    const update: any = { updatedAt: new Date() }
    if (params.name !== undefined) update.name = params.name.trim()
    if (params.slug !== undefined) update.slug = params.slug.trim()
    if (params.visibility !== undefined) update.visibility = params.visibility
    if (params.diseaseKey !== undefined) update.diseaseKey = params.diseaseKey.trim() || undefined

    try {
      const result = await databaseService.communityRooms.findOneAndUpdate(
        { _id: roomId },
        { $set: update },
        { returnDocument: 'after' }
      )
      if (!result) throw new ErrorWithStatus({ message: 'Không tìm thấy phòng.', status: HTTP_STATUS.NOT_FOUND })
      return result
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ErrorWithStatus({
          message: 'Slug đã tồn tại, vui lòng chọn slug khác.',
          status: HTTP_STATUS.CONFLICT
        })
      }
      throw err
    }
  }

  async setRoomStatus(roomId: ObjectId, status: RoomStatus) {
    const result = await databaseService.communityRooms.findOneAndUpdate(
      { _id: roomId },
      { $set: { status, updatedAt: new Date() } },
      { returnDocument: 'after' }
    )
    if (!result) throw new ErrorWithStatus({ message: 'Không tìm thấy phòng.', status: HTTP_STATUS.NOT_FOUND })
    return result
  }

  async joinRoom(roomId: ObjectId, userId: ObjectId) {
    const room = await databaseService.communityRooms.findOne({ _id: roomId, status: 'active' })
    if (!room) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy phòng.', status: HTTP_STATUS.NOT_FOUND })
    }

    const existingMember = await databaseService.communityRoomMembers.findOne({ roomId, userId })
    if (existingMember?.status === 'banned') {
      throw new ErrorWithStatus({ message: 'Bạn đã bị cấm trong phòng này.', status: HTTP_STATUS.FORBIDDEN })
    }

    if (room.visibility === 'private' && existingMember?.status !== 'invited' && existingMember?.status !== 'active') {
      throw new ErrorWithStatus({
        message: 'Phòng riêng tư cần được mời hoặc được duyệt trước khi tham gia.',
        status: HTTP_STATUS.FORBIDDEN
      })
    }

    const now = new Date()
    await databaseService.communityRoomMembers.updateOne(
      { roomId, userId },
      {
        $setOnInsert: {
          roomId,
          userId,
          role: 'member' as MemberRole,
          joinedAt: now
        },
        $set: {
          status: 'active' as MemberStatus,
          updatedAt: now
        }
      },
      { upsert: true }
    )

    emitCommunity('community:member:joined', roomId, { roomId, userId })
    return { roomId, userId, status: 'active' as MemberStatus }
  }

  async requestJoin(roomId: ObjectId, userId: ObjectId) {
    const room = await databaseService.communityRooms.findOne({ _id: roomId, status: 'active' })
    if (!room) throw new ErrorWithStatus({ message: 'Không tìm thấy phòng.', status: HTTP_STATUS.NOT_FOUND })

    if (room.visibility === 'public') {
      return this.joinRoom(roomId, userId)
    }

    const existingMember = await databaseService.communityRoomMembers.findOne({ roomId, userId })
    if (existingMember?.status === 'banned') {
      throw new ErrorWithStatus({ message: 'Bạn đã bị cấm trong phòng này.', status: HTTP_STATUS.FORBIDDEN })
    }
    if (existingMember?.status === 'active' || existingMember?.status === 'invited') {
      return this.joinRoom(roomId, userId)
    }

    const now = new Date()
    await databaseService.communityRoomMembers.updateOne(
      { roomId, userId },
      {
        $setOnInsert: { roomId, userId, role: 'member' as MemberRole, joinedAt: now },
        $set: { status: 'pending' as MemberStatus, updatedAt: now }
      },
      { upsert: true }
    )

    emitToAdmins('community:member:requested', { roomId, userId })
    return { roomId, userId, status: 'pending' as MemberStatus }
  }

  async leaveRoom(roomId: ObjectId, userId: ObjectId) {
    await this.requireActiveMember(roomId, userId)
    await databaseService.communityRoomMembers.updateOne(
      { roomId, userId },
      { $set: { status: 'left' as MemberStatus, updatedAt: new Date() } }
    )
    emitCommunity('community:member:left', roomId, { roomId, userId })
    return { roomId, userId, status: 'left' as MemberStatus }
  }

  async inviteMember(roomId: ObjectId, params: { userId?: ObjectId; email?: string }) {
    const room = await databaseService.communityRooms.findOne({ _id: roomId })
    if (!room) throw new ErrorWithStatus({ message: 'Không tìm thấy phòng.', status: HTTP_STATUS.NOT_FOUND })

    let userId = params.userId
    if (!userId && params.email) {
      const user = await databaseService.users.findOne({ email: params.email })
      if (!user?._id) throw new ErrorWithStatus({ message: 'Không tìm thấy người dùng.', status: HTTP_STATUS.NOT_FOUND })
      userId = user._id
    }
    if (!userId) {
      throw new ErrorWithStatus({ message: 'Cần userId hoặc email để mời.', status: HTTP_STATUS.BAD_REQUEST })
    }

    const existingMember = await databaseService.communityRoomMembers.findOne({ roomId, userId })
    if (existingMember?.status === 'banned') {
      throw new ErrorWithStatus({ message: 'Người dùng đang bị cấm trong phòng này.', status: HTTP_STATUS.FORBIDDEN })
    }

    const now = new Date()
    await databaseService.communityRoomMembers.updateOne(
      { roomId, userId },
      {
        $setOnInsert: { roomId, userId, role: 'member' as MemberRole, joinedAt: now },
        $set: { status: 'invited' as MemberStatus, updatedAt: now }
      },
      { upsert: true }
    )

    emitToUser('community:member:invited', userId, { roomId, userId })
    return { roomId, userId, status: 'invited' as MemberStatus }
  }

  async listMembers(roomId: ObjectId, params?: { page?: number; limit?: number; status?: MemberStatus }) {
    const page = params?.page || 1
    const limit = params?.limit || 20
    const skip = (page - 1) * limit
    const query: any = { roomId }
    if (params?.status) query.status = params.status

    const [items, total] = await Promise.all([
      databaseService.communityRoomMembers
        .aggregate([
          { $match: query },
          { $sort: { updatedAt: -1 } },
          { $skip: skip },
          { $limit: limit },
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
            $project: {
              roomId: 1,
              userId: 1,
              role: 1,
              status: 1,
              joinedAt: 1,
              updatedAt: 1,
              mutedUntil: 1,
              lastReadAt: 1,
              user: { _id: 1, firstName: 1, lastName: 1, avatar: 1, email: 1, role: 1 }
            }
          }
        ])
        .toArray(),
      databaseService.communityRoomMembers.countDocuments(query)
    ])

    return { items, page, limit, total }
  }

  async updateMember(
    roomId: ObjectId,
    userId: ObjectId,
    params: { status?: MemberStatus; role?: MemberRole; mutedUntil?: string | null }
  ) {
    const room = await databaseService.communityRooms.findOne({ _id: roomId })
    if (!room) throw new ErrorWithStatus({ message: 'Không tìm thấy phòng.', status: HTTP_STATUS.NOT_FOUND })

    const update: any = { updatedAt: new Date() }
    if (params.status) update.status = params.status
    if (params.role) update.role = params.role
    if (params.mutedUntil !== undefined) {
      update.mutedUntil = params.mutedUntil ? new Date(params.mutedUntil) : null
    }

    const result = await databaseService.communityRoomMembers.findOneAndUpdate(
      { roomId, userId },
      {
        $set: update,
        $setOnInsert: { roomId, userId, role: params.role || 'member', joinedAt: new Date() }
      },
      { upsert: true, returnDocument: 'after' }
    )

    emitToUser('community:member:updated', userId, result)
    emitCommunity('community:member:updated', roomId, result)
    return result
  }

  async markRoomRead(roomId: ObjectId, userId: ObjectId) {
    await this.requireActiveMember(roomId, userId)
    const now = new Date()
    await databaseService.communityRoomMembers.updateOne(
      { roomId, userId },
      { $set: { lastReadAt: now, updatedAt: now } }
    )
    const payload = { roomId, userId, lastReadAt: now }
    emitToUser('community:room:read', userId, payload)
    return payload
  }

  async canAccessRoom(roomId: ObjectId, userId: ObjectId, role?: UserRole) {
    if (role === UserRole.Admin) return true
    const room = await databaseService.communityRooms.findOne({ _id: roomId, status: 'active' })
    if (!room) return false
    if (room.visibility === 'public') {
      const member = await databaseService.communityRoomMembers.findOne({ roomId, userId })
      return member?.status === 'active'
    }
    const member = await databaseService.communityRoomMembers.findOne({ roomId, userId })
    return member?.status === 'active'
  }

  private async requireActiveMember(roomId: ObjectId, userId: ObjectId) {
    const room = await databaseService.communityRooms.findOne({ _id: roomId, status: 'active' })
    if (!room) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy phòng.', status: HTTP_STATUS.NOT_FOUND })
    }

    const member = await databaseService.communityRoomMembers.findOne({ roomId, userId })
    if (!member || member.status !== 'active') {
      throw new ErrorWithStatus({ message: 'Bạn chưa tham gia phòng này.', status: HTTP_STATUS.FORBIDDEN })
    }
    return member as any
  }

  private async requireCanChat(roomId: ObjectId, userId: ObjectId) {
    const member = await this.requireActiveMember(roomId, userId)
    if (member.mutedUntil && new Date(member.mutedUntil).getTime() > Date.now()) {
      throw new ErrorWithStatus({ message: 'Bạn đang bị tạm khóa chat trong phòng.', status: HTTP_STATUS.FORBIDDEN })
    }
    return member as any
  }

  async listMessages(params: { roomId: ObjectId; userId: ObjectId; page: number; limit: number }) {
    await this.requireActiveMember(params.roomId, params.userId)

    const skip = (params.page - 1) * params.limit
    const query: any = {
      roomId: params.roomId,
      $or: [
        { status: 'visible' as MessageStatus },
        { status: 'hidden' as MessageStatus, senderId: params.userId }
      ]
    }

    const [items, total] = await Promise.all([
      databaseService.communityMessages
        .aggregate([
          { $match: query },
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: params.limit },
          {
            $lookup: {
              from: process.env.USERS_COLLECTION || 'users',
              localField: 'senderId',
              foreignField: '_id',
              as: 'sender'
            }
          },
          { $unwind: { path: '$sender', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              roomId: 1,
              senderId: 1,
              content: 1,
              status: 1,
              createdAt: 1,
              updatedAt: 1,
              moderated: 1,
              sender: { _id: 1, firstName: 1, lastName: 1, avatar: 1, role: 1 }
            }
          }
        ])
        .toArray(),
      databaseService.communityMessages.countDocuments(query)
    ])

    return { items, page: params.page, limit: params.limit, total }
  }

  async getMessageById(messageId: ObjectId) {
    return databaseService.communityMessages.findOne({ _id: messageId })
  }

  async sendMessage(params: { roomId: ObjectId; userId: ObjectId; content: string; imageUrl?: string }) {
    const member = await this.requireCanChat(params.roomId, params.userId)
    const now = new Date()

    const baseMessage: any = {
      roomId: params.roomId,
      senderId: params.userId,
      content: params.content,
      imageUrl: params.imageUrl,
      status: 'visible' as MessageStatus,
      createdAt: now,
      updatedAt: now
    }

    const insert = await databaseService.communityMessages.insertOne(baseMessage)
    const messageId = insert.insertedId
    const moderation = moderateTextRuleBased(params.content)

    const shouldAutoHide = moderation.severity === 'high' || moderation.severity === 'critical'
    let findingId: ObjectId | undefined

    if (moderation.categories.length > 0 && moderation.severity !== 'low') {
      const findingDoc: any = {
        roomId: params.roomId,
        messageId,
        senderId: params.userId,
        trigger: 'auto' as ModerationTrigger,
        status: 'open' as FindingStatus,
        severity: moderation.severity,
        categories: moderation.categories,
        confidence: moderation.confidence,
        reasons: moderation.reasons,
        reportCount: 0,
        createdAt: now,
        updatedAt: now
      }
      const findingInsert = await databaseService.moderationFindings.insertOne(findingDoc)
      findingId = findingInsert.insertedId
      emitToAdmins('community:moderation:queued', { findingId, roomId: params.roomId, messageId })
    }

    const update: any = {
      $set: {
        updatedAt: new Date(),
        moderated: {
          autoHidden: shouldAutoHide,
          at: new Date(),
          severity: moderation.severity,
          categories: moderation.categories,
          confidence: moderation.confidence,
          reasons: moderation.reasons,
          ...(findingId ? { findingId } : {})
        },
        ...(shouldAutoHide ? { status: 'hidden' as MessageStatus } : {})
      }
    }

    await databaseService.communityMessages.updateOne({ _id: messageId }, update)
    const stored = await databaseService.communityMessages.findOne({ _id: messageId })

    if (stored) {
      aiModerationService.enqueueMessageReview({ message: stored, ruleResult: moderation }).catch(() => {})
    }

    if (stored?.status === 'visible') {
      emitCommunity('community:message:new', params.roomId, stored)
    } else {
      emitToUser('community:message:hidden', params.userId, stored)
    }

    return { message: stored, moderation, memberRole: member.role as MemberRole }
  }

  async reportMessage(params: { messageId: ObjectId; reporterId: ObjectId; reason?: string }) {
    const message = await databaseService.communityMessages.findOne({ _id: params.messageId })
    if (!message) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy tin nhắn.', status: HTTP_STATUS.NOT_FOUND })
    }

    await this.requireActiveMember(message.roomId as ObjectId, params.reporterId)

    const now = new Date()
    try {
      await databaseService.moderationReports.insertOne({
        roomId: message.roomId as ObjectId,
        messageId: params.messageId,
        reporterId: params.reporterId,
        reason: params.reason?.trim(),
        createdAt: now
      } as any)
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ErrorWithStatus({ message: 'Bạn đã báo cáo tin nhắn này.', status: HTTP_STATUS.CONFLICT })
      }
      throw error
    }

    const existing = await databaseService.moderationFindings.findOne({ messageId: params.messageId })
    if (existing) {
      await databaseService.moderationFindings.updateOne(
        { _id: existing._id },
        {
          $set: { updatedAt: now, status: 'open' },
          $inc: { reportCount: 1 },
          $addToSet: { categories: 'user_report' }
        }
      )
      emitToAdmins('community:moderation:queued', { findingId: existing._id, roomId: message.roomId, messageId: params.messageId })
      return { findingId: existing._id }
    }

    const findingDoc: any = {
      roomId: message.roomId as ObjectId,
      messageId: params.messageId,
      senderId: message.senderId as ObjectId,
      trigger: 'user_report' as ModerationTrigger,
      status: 'open' as FindingStatus,
      severity: 'medium',
      categories: ['user_report'],
      confidence: 'low',
      reasons: ['Người dùng báo cáo tin nhắn.'],
      reportCount: 1,
      createdAt: now,
      updatedAt: now
    }

    const findingInsert = await databaseService.moderationFindings.insertOne(findingDoc)
    emitToAdmins('community:moderation:queued', {
      findingId: findingInsert.insertedId,
      roomId: message.roomId,
      messageId: params.messageId
    })
    return { findingId: findingInsert.insertedId }
  }
}

const communityService = new CommunityService()
export default communityService
