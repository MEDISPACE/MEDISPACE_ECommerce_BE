import { ClientSession, ObjectId, type Document, type WithId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { UserRole } from '~/constants/enum'
import { ErrorWithStatus } from '~/models/Error'
import { COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS } from '~/constants/communityVideoEvents'
import databaseService from '~/services/database.services'
import liveKitService from '~/services/livekit.services'
import notificationService from '~/services/notifications.services'
import { getIO } from '~/sockets/chat.socket'
import {
  CommunityVideoEventAccessShape,
  isCommunityVideoEventAdmin,
  isCommunityVideoEventHost
} from '~/utils/communityVideoEventAuth'

export type VideoEventStatus = 'draft' | 'scheduled' | 'live' | 'ended' | 'cancelled'
export type RegistrationStatus = 'registered' | 'cancelled' | 'attended' | 'no_show' | 'removed'
export type VideoRole = 'attendee' | 'host' | 'co_host'

type AuthContext = {
  userId?: ObjectId
  role?: UserRole
}

type VideoEventHostShape = {
  hostIds?: ObjectId[]
  roomId?: ObjectId
}

type VideoEventAccessDoc = CommunityVideoEventAccessShape & {
  status?: VideoEventStatus
}

type CommunityVideoEventDoc = WithId<Document> &
  VideoEventAccessDoc & {
    status: VideoEventStatus
    activeRegistrationCount?: number
    registrationRequired?: boolean
    capacity?: number | null
  }

type CreateEventParams = {
  roomId: ObjectId
  title: string
  description?: string
  agenda?: string
  status?: Extract<VideoEventStatus, 'draft' | 'scheduled'>
  scheduledStartAt: string | Date
  scheduledEndAt: string | Date
  hostIds?: ObjectId[]
  speakerProfiles?: unknown[]
  registrationRequired?: boolean
  capacity?: number | null
  provider?: string
  providerMeetingId?: string
  meetingUrl?: string
  materials?: unknown[]
  tags?: string[]
  createdBy: ObjectId
}

type UpdateEventParams = Partial<{
  title: string
  description: string
  agenda: string | null
  status: Extract<VideoEventStatus, 'draft' | 'scheduled'>
  scheduledStartAt: string | Date
  scheduledEndAt: string | Date
  hostIds: string[]
  speakerProfiles: unknown[]
  registrationRequired: boolean
  capacity: number | null
  provider: string
  providerMeetingId: string | null
  meetingUrl: string | null
  materials: unknown[]
  tags: string[]
}>

const ACTIVE_REGISTRATION_STATUSES: RegistrationStatus[] = ['registered', 'attended']
const REMINDER_EVENT_BATCH_SIZE = 100
const REMINDER_REGISTRATION_BATCH_SIZE = 200
const MY_EVENTS_REGISTRATION_LOOKUP_LIMIT = 500
const STRING_ARRAY_LIMIT = 30

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function emitRoom(event: string, roomId: ObjectId | string, payload: unknown) {
  try {
    getIO().to(`community:room:${roomId.toString()}`).emit(event, payload)
  } catch (error) {
    console.error('[CommunityVideoEvents] emitRoom failed', { event, roomId: roomId.toString(), error })
  }
}

function emitUser(event: string, userId: ObjectId | string, payload: unknown) {
  try {
    getIO().to(`user:${userId.toString()}`).emit(event, payload)
  } catch (error) {
    console.error('[CommunityVideoEvents] emitUser failed', { event, userId: userId.toString(), error })
  }
}

function emitAdmins(event: string, payload: unknown) {
  try {
    getIO().to('admins').emit(event, payload)
  } catch (error) {
    console.error('[CommunityVideoEvents] emitAdmins failed', { event, error })
  }
}

function emitVideoEvent(event: string, eventId: ObjectId | string, payload: unknown) {
  try {
    getIO().to(`community:video-event:${eventId.toString()}`).emit(event, payload)
  } catch (error) {
    console.error('[CommunityVideoEvents] emitVideoEvent failed', { event, eventId: eventId.toString(), error })
  }
}

function toDate(value: string | Date, fieldName: string) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new ErrorWithStatus({ message: `${fieldName} không hợp lệ.`, status: HTTP_STATUS.BAD_REQUEST })
  }
  return date
}

function normalizeStringArray(value?: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, STRING_ARRAY_LIMIT)
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function isActiveRegistrationStatus(status?: RegistrationStatus) {
  return Boolean(status && ACTIVE_REGISTRATION_STATUSES.includes(status))
}

class CommunityVideoEventsService {
  private isAdmin(context?: AuthContext) {
    return isCommunityVideoEventAdmin(context)
  }

  private isHost(event: VideoEventHostShape, userId?: ObjectId) {
    return isCommunityVideoEventHost(event, userId)
  }

  private async getActiveRoom(roomId: ObjectId) {
    const room = await databaseService.communityRooms.findOne({ _id: roomId, status: 'active' })
    if (!room) throw new ErrorWithStatus({ message: 'Không tìm thấy phòng cộng đồng.', status: HTTP_STATUS.NOT_FOUND })
    return room
  }

  async getEvent(eventId: ObjectId): Promise<CommunityVideoEventDoc> {
    const event = await databaseService.communityVideoEvents.findOne({ _id: eventId })
    if (!event) throw new ErrorWithStatus({ message: 'Không tìm thấy hội thảo.', status: HTTP_STATUS.NOT_FOUND })
    return event as CommunityVideoEventDoc
  }

  private async getMembership(roomId: ObjectId, userId?: ObjectId) {
    if (!userId) return null
    return databaseService.communityRoomMembers.findOne({ roomId, userId })
  }

  private async ensureRoomChatAccess(
    event: VideoEventAccessDoc,
    userId: ObjectId,
    role?: UserRole,
    session?: ClientSession
  ) {
    const room = await this.getActiveRoom(event.roomId)
    const member = await databaseService.communityRoomMembers.findOne({ roomId: event.roomId, userId }, { session })
    if (member?.status === 'banned') {
      throw new ErrorWithStatus({ message: 'Bạn đã bị cấm trong phòng liên quan.', status: HTTP_STATUS.FORBIDDEN })
    }

    const privileged = role === UserRole.Admin || this.isHost(event, userId)
    if (room.visibility === 'private' && !privileged && member?.status !== 'active' && member?.status !== 'invited') {
      throw new ErrorWithStatus({
        message: 'Hội thảo riêng tư yêu cầu quyền truy cập phòng.',
        status: HTTP_STATUS.FORBIDDEN
      })
    }

    if (member?.status === 'active') return

    const now = new Date()
    await databaseService.communityRoomMembers.updateOne(
      { roomId: event.roomId, userId },
      {
        $setOnInsert: {
          roomId: event.roomId,
          userId,
          role: 'member',
          joinedAt: now
        },
        $set: {
          status: 'active',
          updatedAt: now
        }
      },
      { upsert: true, session }
    )
  }

  private async assertCanViewEvent(event: VideoEventAccessDoc, context?: AuthContext) {
    if (this.isAdmin(context) || this.isHost(event, context?.userId)) return
    const room = await this.getActiveRoom(event.roomId)
    if (room.visibility !== 'private') return

    const member = await this.getMembership(event.roomId, context?.userId)
    if (!member || !['active', 'invited'].includes(member.status)) {
      throw new ErrorWithStatus({ message: 'Bạn không có quyền xem hội thảo này.', status: HTTP_STATUS.FORBIDDEN })
    }
  }

  private async assertCanJoinOrRegister(event: VideoEventAccessDoc, userId: ObjectId, role?: UserRole) {
    if (role === UserRole.Admin || this.isHost(event, userId)) return

    const room = await this.getActiveRoom(event.roomId)
    const member = await this.getMembership(event.roomId, userId)
    if (member?.status === 'banned') {
      throw new ErrorWithStatus({ message: 'Bạn đã bị cấm trong phòng liên quan.', status: HTTP_STATUS.FORBIDDEN })
    }
    if (room.visibility === 'private' && (!member || !['active', 'invited'].includes(member.status))) {
      throw new ErrorWithStatus({
        message: 'Hội thảo riêng tư yêu cầu quyền truy cập phòng.',
        status: HTTP_STATUS.FORBIDDEN
      })
    }
  }

  private async assertCanManageEvent(event: VideoEventAccessDoc, context: AuthContext) {
    if (this.isAdmin(context) || this.isHost(event, context.userId)) return
    throw new ErrorWithStatus({ message: 'Bạn không có quyền quản lý hội thảo này.', status: HTTP_STATUS.FORBIDDEN })
  }

  private async ensureActiveRegistrationCount(eventId: ObjectId, session?: ClientSession) {
    const event = await databaseService.communityVideoEvents.findOne(
      { _id: eventId },
      { projection: { activeRegistrationCount: 1 }, session }
    )
    if (!event || typeof event.activeRegistrationCount === 'number') return

    const activeRegistrationCount = await databaseService.communityVideoEventRegistrations.countDocuments(
      { eventId, status: { $in: ACTIVE_REGISTRATION_STATUSES } },
      { session }
    )
    await databaseService.communityVideoEvents.updateOne(
      { _id: eventId, activeRegistrationCount: { $exists: false } },
      { $set: { activeRegistrationCount, updatedAt: new Date() } },
      { session }
    )
  }

  private async getActiveRegistrationUserIds(eventId: ObjectId): Promise<ObjectId[]> {
    const registrations = await databaseService.communityVideoEventRegistrations
      .find({ eventId, status: { $in: ACTIVE_REGISTRATION_STATUSES } }, { projection: { userId: 1 } })
      .toArray()
    return registrations.map((registration: any) => registration.userId).filter(Boolean)
  }

  private async notifyVideoEventUsers(
    event: CommunityVideoEventDoc,
    status: 'registered' | 'live' | 'cancelled' | 'time_changed',
    userIds?: ObjectId[]
  ) {
    const recipients = userIds || await this.getActiveRegistrationUserIds(event._id)
    if (recipients.length === 0) return

    let io
    try { io = getIO() } catch { io = undefined }
    await Promise.all(
      recipients.map((userId) =>
        Promise.resolve((notificationService as any).notifyVideoEventLifecycle?.(userId, event.title, event._id.toString(), status, io))
          .catch((error) => console.error('[CommunityVideoEvents] lifecycle notification failed', { eventId: event._id.toString(), userId: userId.toString(), status, error }))
      )
    )
  }

  async assertCanSubscribeRealtime(eventId: ObjectId, context: AuthContext) {
    const event = await this.getEvent(eventId)
    if (event.status === 'cancelled' || event.status === 'draft') {
      throw new ErrorWithStatus({ message: 'Không tìm thấy hội thảo.', status: HTTP_STATUS.NOT_FOUND })
    }
    await this.assertCanViewEvent(event, context)
    return event
  }

  async canAccessVideoEvent(eventId: ObjectId, context: AuthContext) {
    try {
      const event = await this.getEvent(eventId)
      await this.assertCanViewEvent(event, context)
      return true
    } catch (error) {
      if (!(error instanceof ErrorWithStatus)) {
        console.error('[CommunityVideoEvents] canAccessVideoEvent failed', {
          eventId: eventId.toString(),
          userId: context.userId?.toString(),
          error
        })
      }
      return false
    }
  }

  async createEvent(params: CreateEventParams) {
    await this.getActiveRoom(params.roomId)
    const scheduledStartAt = toDate(params.scheduledStartAt, 'scheduledStartAt')
    const scheduledEndAt = toDate(params.scheduledEndAt, 'scheduledEndAt')
    if (scheduledEndAt <= scheduledStartAt) {
      throw new ErrorWithStatus({
        message: 'scheduledEndAt phải sau scheduledStartAt.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const now = new Date()
    const doc = {
      roomId: params.roomId,
      title: params.title.trim(),
      description: params.description?.trim() || '',
      agenda: params.agenda?.trim() || null,
      visibility: 'public',
      status: params.status || ('scheduled' as VideoEventStatus),
      scheduledStartAt,
      scheduledEndAt,
      startedAt: null,
      endedAt: null,
      hostIds: params.hostIds || [],
      speakerProfiles: Array.isArray(params.speakerProfiles) ? params.speakerProfiles : [],
      registrationRequired: params.registrationRequired === true,
      capacity: params.capacity ?? null,
      provider: params.provider?.trim() || 'livekit',
      providerMeetingId: params.providerMeetingId?.trim() || null,
      meetingUrl: params.meetingUrl?.trim() || null,
      recordingUrl: null,
      recordingStatus: 'none',
      materials: Array.isArray(params.materials) ? params.materials : [],
      tags: normalizeStringArray(params.tags),
      reminders: { fifteenMinutesSentAt: null, oneHourSentAt: null },
      activeRegistrationCount: 0,
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now
    }

    const result = await databaseService.communityVideoEvents.insertOne(doc as any)
    const meetingUrl = doc.meetingUrl || `/community/video-events/${result.insertedId.toString()}`
    if (!doc.meetingUrl) {
      await databaseService.communityVideoEvents.updateOne(
        { _id: result.insertedId },
        { $set: { meetingUrl, updatedAt: now } }
      )
    }
    const event = { _id: result.insertedId, ...doc, meetingUrl }
    emitRoom(COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS.CREATED, params.roomId, event)
    emitAdmins(COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS.CREATED, event)
    return event
  }

  async updateEvent(eventId: ObjectId, params: UpdateEventParams, context: AuthContext) {
    const event = await this.getEvent(eventId)
    await this.assertCanManageEvent(event, context)

    const update: Record<string, unknown> = { updatedAt: new Date() }
    if (params.title !== undefined) update.title = String(params.title).trim()
    if (params.description !== undefined) update.description = String(params.description).trim()
    if (params.agenda !== undefined) update.agenda = params.agenda ? String(params.agenda).trim() : null
    if (params.status !== undefined) update.status = params.status
    if (params.scheduledStartAt !== undefined)
      update.scheduledStartAt = toDate(params.scheduledStartAt, 'scheduledStartAt')
    if (params.scheduledEndAt !== undefined) update.scheduledEndAt = toDate(params.scheduledEndAt, 'scheduledEndAt')
    if (params.hostIds !== undefined) {
      if (!Array.isArray(params.hostIds) || params.hostIds.some((id) => !ObjectId.isValid(id))) {
        throw new ErrorWithStatus({ message: 'hostIds không hợp lệ.', status: HTTP_STATUS.BAD_REQUEST })
      }
      update.hostIds = params.hostIds.map((id) => new ObjectId(id))
    }
    if (params.speakerProfiles !== undefined)
      update.speakerProfiles = Array.isArray(params.speakerProfiles) ? params.speakerProfiles : []
    if (params.registrationRequired !== undefined) update.registrationRequired = Boolean(params.registrationRequired)
    if (params.capacity !== undefined) update.capacity = params.capacity === null ? null : Number(params.capacity)
    if (params.provider !== undefined) update.provider = String(params.provider).trim() || 'livekit'
    if (params.providerMeetingId !== undefined)
      update.providerMeetingId = params.providerMeetingId ? String(params.providerMeetingId).trim() : null
    if (params.meetingUrl !== undefined) update.meetingUrl = params.meetingUrl ? String(params.meetingUrl).trim() : null
    if (params.materials !== undefined) update.materials = Array.isArray(params.materials) ? params.materials : []
    if (params.tags !== undefined) update.tags = normalizeStringArray(params.tags)

    const nextStart = (update.scheduledStartAt as Date | undefined) || event.scheduledStartAt
    const nextEnd = (update.scheduledEndAt as Date | undefined) || event.scheduledEndAt
    if (nextEnd <= nextStart) {
      throw new ErrorWithStatus({
        message: 'scheduledEndAt phải sau scheduledStartAt.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const updated = await databaseService.communityVideoEvents.findOneAndUpdate(
      { _id: eventId },
      { $set: update },
      { returnDocument: 'after' }
    )
    if (!updated) throw new ErrorWithStatus({ message: 'Không tìm thấy hội thảo.', status: HTTP_STATUS.NOT_FOUND })
    emitRoom(COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS.UPDATED, updated.roomId, updated)
    emitVideoEvent(COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS.UPDATED, eventId, updated)
    if (
      (params.scheduledStartAt !== undefined || params.scheduledEndAt !== undefined) &&
      (event.scheduledStartAt.getTime() !== nextStart.getTime() || event.scheduledEndAt.getTime() !== nextEnd.getTime())
    ) {
      this.notifyVideoEventUsers(updated as CommunityVideoEventDoc, 'time_changed').catch(() => {})
    }
    return updated
  }

  async listEvents(params?: {
    viewer?: AuthContext
    roomId?: ObjectId
    status?: VideoEventStatus
    search?: string
    upcomingOnly?: boolean
    page?: number
    limit?: number
  }) {
    const page = params?.page || 1
    const limit = params?.limit || 20
    const query: any = {}
    if (params?.roomId) query.roomId = params.roomId
    if (params?.status) query.status = params.status
    if (params?.upcomingOnly) {
      query.scheduledEndAt = { $gte: new Date() }
      if (!params.status) query.status = { $in: ['scheduled', 'live'] }
    }
    const search = params?.search?.trim()
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i')
      query.$or = [{ title: regex }, { description: regex }, { tags: regex }]
    }

    if (!this.isAdmin(params?.viewer)) {
      if (!query.status) query.status = { $nin: ['draft', 'cancelled'] }
      const publicRooms = await databaseService.communityRooms
        .find({ status: 'active', visibility: { $ne: 'private' } })
        .project({ _id: 1 })
        .toArray()
      let allowedRoomIds = publicRooms.map((room: any) => room._id).filter(Boolean)
      if (params?.viewer?.userId) {
        const memberships = await databaseService.communityRoomMembers
          .find({ userId: params.viewer.userId, status: { $in: ['active', 'invited'] } })
          .project({ roomId: 1 })
          .toArray()
        allowedRoomIds = [...allowedRoomIds, ...memberships.map((member: any) => member.roomId).filter(Boolean)]
      }
      const allowedRoomIdStrings = new Set(allowedRoomIds.map((roomId: ObjectId) => roomId.toString()))
      if (query.roomId) {
        if (!allowedRoomIdStrings.has(query.roomId.toString())) query.roomId = { $in: [] }
      } else {
        query.roomId = { $in: Array.from(allowedRoomIdStrings).map((roomId) => new ObjectId(roomId)) }
      }
    }

    const skip = (page - 1) * limit
    const [items, total] = await Promise.all([
      databaseService.communityVideoEvents
        .aggregate([
          { $match: query },
          { $sort: { scheduledStartAt: 1, createdAt: -1 } },
          { $skip: skip },
          { $limit: limit },
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
              from: process.env.DB_COMMUNITY_VIDEO_EVENT_REGISTRATIONS_COLLECTION || 'communityVideoEventRegistrations',
              let: { eventId: '$_id' },
              pipeline: [
                { $match: { $expr: { $eq: ['$eventId', '$$eventId'] }, status: { $in: ['registered', 'attended'] } } },
                { $count: 'count' }
              ],
              as: 'registrationStats'
            }
          },
          { $addFields: { registrationCount: { $ifNull: [{ $arrayElemAt: ['$registrationStats.count', 0] }, 0] } } },
          {
            $set: {
              room: {
                _id: '$room._id',
                name: '$room.name',
                slug: '$room.slug',
                diseaseKey: '$room.diseaseKey',
                visibility: '$room.visibility'
              }
            }
          },
          { $project: { registrationStats: 0 } }
        ])
        .toArray(),
      databaseService.communityVideoEvents.countDocuments(query)
    ])
    return { items, page, limit, total }
  }

  async listMyEvents(
    userId: ObjectId,
    role?: UserRole,
    params?: { page?: number; limit?: number; status?: VideoEventStatus }
  ) {
    const registrations = await databaseService.communityVideoEventRegistrations
      .find({ userId, status: { $in: ['registered', 'attended'] } })
      .project({ eventId: 1 })
      .sort({ registeredAt: -1 })
      .limit(MY_EVENTS_REGISTRATION_LOOKUP_LIMIT)
      .toArray()
    const registeredEventIds = registrations.map((item: any) => item.eventId).filter(Boolean)
    const hostQuery = { hostIds: userId }
    const query: any = { $or: [{ _id: { $in: registeredEventIds } }, hostQuery] }
    if (params?.status) query.status = params.status
    if (role !== UserRole.Admin) query.status = query.status || { $ne: 'cancelled' }
    const page = params?.page || 1
    const limit = params?.limit || 20
    const skip = (page - 1) * limit
    const [items, total] = await Promise.all([
      databaseService.communityVideoEvents.find(query).sort({ scheduledStartAt: 1 }).skip(skip).limit(limit).toArray(),
      databaseService.communityVideoEvents.countDocuments(query)
    ])
    return { items, page, limit, total }
  }

  async getEventDetail(eventId: ObjectId, context?: AuthContext) {
    const event = await this.getEvent(eventId)
    await this.assertCanViewEvent(event, context)
    const [room, registrationCount, viewerRegistration] = await Promise.all([
      databaseService.communityRooms.findOne(
        { _id: event.roomId },
        { projection: { name: 1, slug: 1, diseaseKey: 1, visibility: 1 } }
      ),
      databaseService.communityVideoEventRegistrations.countDocuments({
        eventId,
        status: { $in: ['registered', 'attended'] }
      }),
      context?.userId
        ? databaseService.communityVideoEventRegistrations.findOne({ eventId, userId: context.userId })
        : null
    ])
    return { ...event, room, registrationCount, viewerRegistration }
  }

  async cancelEvent(eventId: ObjectId, context: AuthContext) {
    const event = await this.getEvent(eventId)
    await this.assertCanManageEvent(event, context)
    if (event.status === 'ended') {
      throw new ErrorWithStatus({ message: 'Không thể hủy hội thảo đã kết thúc.', status: HTTP_STATUS.BAD_REQUEST })
    }
    const activeUserIds = await this.getActiveRegistrationUserIds(eventId)
    const now = new Date()
    const updated = await databaseService.withTransaction(async (session) => {
      const cancelled = await databaseService.communityVideoEvents.findOneAndUpdate(
        { _id: eventId },
        { $set: { status: 'cancelled' as VideoEventStatus, activeRegistrationCount: 0, updatedAt: now } },
        { returnDocument: 'after', session }
      )
      await databaseService.communityVideoEventRegistrations.updateMany(
        { eventId, status: { $in: ACTIVE_REGISTRATION_STATUSES } },
        { $set: { status: 'cancelled' as RegistrationStatus, cancelledAt: now, updatedAt: now } },
        { session }
      )
      return cancelled
    })
    if (!updated) throw new ErrorWithStatus({ message: 'Không tìm thấy hội thảo.', status: HTTP_STATUS.NOT_FOUND })
    emitRoom(COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS.CANCELLED, updated.roomId, updated)
    emitVideoEvent(COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS.CANCELLED, eventId, updated)
    this.notifyVideoEventUsers(updated as CommunityVideoEventDoc, 'cancelled', activeUserIds).catch(() => {})
    return updated
  }

  async registerForEvent(eventId: ObjectId, userId: ObjectId, role?: UserRole) {
    const event = await this.getEvent(eventId)
    if (['ended', 'cancelled'].includes(event.status)) {
      throw new ErrorWithStatus({ message: 'Hội thảo không còn nhận đăng ký.', status: HTTP_STATUS.BAD_REQUEST })
    }
    await this.assertCanJoinOrRegister(event, userId, role)
    const now = new Date()
    const registration = await databaseService.withTransaction(async (session) => {
      const current = await databaseService.communityVideoEventRegistrations.findOne({ eventId, userId }, { session })
      if (isActiveRegistrationStatus(current?.status)) return current

      await this.ensureActiveRegistrationCount(eventId, session)

      const capacityUpdate = await databaseService.communityVideoEvents.updateOne(
        {
          _id: eventId,
          status: { $nin: ['ended', 'cancelled'] },
          $or: [
            { capacity: null },
            { capacity: { $exists: false } },
            { $expr: { $lt: ['$activeRegistrationCount', '$capacity'] } }
          ]
        },
        { $inc: { activeRegistrationCount: 1 }, $set: { updatedAt: now } },
        { session }
      )

      if (capacityUpdate.modifiedCount === 0) {
        throw new ErrorWithStatus({ message: 'Hội thảo đã đủ số lượng đăng ký.', status: HTTP_STATUS.CONFLICT })
      }

      await databaseService.communityVideoEventRegistrations.updateOne(
        { eventId, userId },
        {
          $setOnInsert: { eventId, roomId: event.roomId, userId, role: 'attendee' as VideoRole, registeredAt: now },
          $set: { status: 'registered' as RegistrationStatus, cancelledAt: null, updatedAt: now }
        },
        { upsert: true, session }
      )
      return databaseService.communityVideoEventRegistrations.findOne({ eventId, userId }, { session })
    })
    const updatedEvent = await this.getEvent(eventId)
    emitUser(COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS.REGISTERED, userId, registration)
    emitRoom(COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS.UPDATED, updatedEvent.roomId, updatedEvent)
    emitVideoEvent(COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS.UPDATED, eventId, updatedEvent)
    let io
    try { io = getIO() } catch { io = undefined }
    Promise.resolve((notificationService as any).notifyVideoEventLifecycle?.(userId, updatedEvent.title, eventId.toString(), 'registered', io)).catch(() => {})
    return registration
  }

  async cancelRegistration(eventId: ObjectId, userId: ObjectId) {
    const event = await this.getEvent(eventId)
    if (event.status === 'ended') {
      throw new ErrorWithStatus({
        message: 'Không thể hủy đăng ký hội thảo đã kết thúc.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }
    const now = new Date()
    const registration = await databaseService.withTransaction(async (session) => {
      const cancelled = await databaseService.communityVideoEventRegistrations.findOneAndUpdate(
        { eventId, userId, status: { $in: ACTIVE_REGISTRATION_STATUSES } },
        { $set: { status: 'cancelled' as RegistrationStatus, cancelledAt: now, updatedAt: now } },
        { returnDocument: 'after', session }
      )
      if (cancelled) {
        await databaseService.communityVideoEvents.updateOne(
          { _id: eventId, activeRegistrationCount: { $gt: 0 } },
          { $inc: { activeRegistrationCount: -1 }, $set: { updatedAt: now } },
          { session }
        )
      }
      return cancelled
    })
    if (!registration)
      throw new ErrorWithStatus({ message: 'Không tìm thấy đăng ký hợp lệ.', status: HTTP_STATUS.NOT_FOUND })
    return registration
  }

  async joinEvent(eventId: ObjectId, userId: ObjectId, role?: UserRole) {
    const event = await this.getEvent(eventId)
    await this.assertCanJoinOrRegister(event, userId, role)
    if (['draft', 'ended', 'cancelled'].includes(event.status))
      throw new ErrorWithStatus({ message: 'Hội thảo hiện không thể tham gia.', status: HTTP_STATUS.BAD_REQUEST })
    const isHost = role === UserRole.Admin || this.isHost(event, userId)
    const existingRegistration = await databaseService.communityVideoEventRegistrations.findOne({ eventId, userId })
    if (!isHost && existingRegistration?.status === 'removed') {
      throw new ErrorWithStatus({ message: 'Bạn đã bị mời khỏi hội thảo này và không thể tham gia lại.', status: HTTP_STATUS.FORBIDDEN })
    }
    const user = await databaseService.users.findOne(
      { _id: userId },
      { projection: { firstName: 1, lastName: 1, email: 1, avatar: 1 } }
    )
    const displayName =
      [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.email || userId.toString()

    const token = await liveKitService.createJoinToken({
      eventId: eventId.toString(),
      userId: userId.toString(),
      displayName,
      avatar: user?.avatar || '',
      isHost
    })
    const now = new Date()
    await databaseService.withTransaction(async (session) => {
      await this.ensureRoomChatAccess(event, userId, role, session)
      const current = await databaseService.communityVideoEventRegistrations.findOne({ eventId, userId }, { session })
      if (!isActiveRegistrationStatus(current?.status)) {
        if (isHost) {
          await databaseService.communityVideoEvents.updateOne(
            { _id: eventId },
            { $inc: { activeRegistrationCount: 1 }, $set: { updatedAt: now } },
            { session }
          )
        } else {
          await this.ensureActiveRegistrationCount(eventId, session)
          const capacityUpdate = await databaseService.communityVideoEvents.updateOne(
            {
              _id: eventId,
              status: { $nin: ['draft', 'ended', 'cancelled'] },
              $or: [
                { capacity: null },
                { capacity: { $exists: false } },
                { $expr: { $lt: ['$activeRegistrationCount', '$capacity'] } }
              ]
            },
            { $inc: { activeRegistrationCount: 1 }, $set: { updatedAt: now } },
            { session }
          )
          if (capacityUpdate.modifiedCount === 0) {
            throw new ErrorWithStatus({ message: 'Hội thảo đã đủ số lượng tham gia.', status: HTTP_STATUS.CONFLICT })
          }
        }
      }
      await databaseService.communityVideoEventRegistrations.updateOne(
        { eventId, userId },
        {
          $setOnInsert: { eventId, roomId: event.roomId, userId, registeredAt: now },
          $set: {
            status: 'attended' as RegistrationStatus,
            role: isHost ? 'host' : 'attendee',
            joinedAt: now,
            lastSeenAt: now,
            updatedAt: now
          }
        },
        { upsert: true, session }
      )
    })
    const payload = {
      eventId,
      provider: 'livekit',
      wsUrl: liveKitService.getWsUrl(),
      token,
      role: isHost ? 'host' : 'attendee',
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000)
    }
    emitVideoEvent(COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS.ATTENDEE_JOINED, eventId, { eventId, userId, joinedAt: now })
    return payload
  }

  async listRegistrations(
    eventId: ObjectId,
    context: AuthContext,
    params?: { page?: number; limit?: number; status?: RegistrationStatus }
  ) {
    const event = await this.getEvent(eventId)
    await this.assertCanManageEvent(event, context)
    const page = params?.page || 1
    const limit = params?.limit || 20
    const query: any = { eventId }
    if (params?.status) query.status = params.status
    const skip = (page - 1) * limit
    const [items, total] = await Promise.all([
      databaseService.communityVideoEventRegistrations
        .aggregate([
          { $match: query },
          { $sort: { registeredAt: -1 } },
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
              user: { _id: 1, firstName: 1, lastName: 1, email: 1, avatar: 1, role: 1 },
              eventId: 1,
              roomId: 1,
              userId: 1,
              status: 1,
              role: 1,
              registeredAt: 1,
              joinedAt: 1,
              lastSeenAt: 1,
              cancelledAt: 1,
              reminder15mSentAt: 1
            }
          }
        ])
        .toArray(),
      databaseService.communityVideoEventRegistrations.countDocuments(query)
    ])
    return { items, page, limit, total }
  }

  async updateRegistration(
    eventId: ObjectId,
    userId: ObjectId,
    context: AuthContext,
    params: { status?: RegistrationStatus; removeReason?: string }
  ) {
    const event = await this.getEvent(eventId)
    await this.assertCanManageEvent(event, context)
    const update: any = { updatedAt: new Date() }
    if (params.status) update.status = params.status
    if (params.status === 'removed') {
      update.removedBy = context.userId
      update.removeReason = params.removeReason?.trim() || null
    }
    const before = await databaseService.communityVideoEventRegistrations.findOne({ eventId, userId })
    const registration = await databaseService.withTransaction(async (session) => {
      const updated = await databaseService.communityVideoEventRegistrations.findOneAndUpdate(
        { eventId, userId },
        { $set: update },
        { returnDocument: 'after', session }
      )
      if (
        before &&
        updated &&
        isActiveRegistrationStatus(before.status) !== isActiveRegistrationStatus(updated.status)
      ) {
        await databaseService.communityVideoEvents.updateOne(
          {
            _id: eventId,
            ...(isActiveRegistrationStatus(updated.status) ? {} : { activeRegistrationCount: { $gt: 0 } })
          },
          {
            $inc: { activeRegistrationCount: isActiveRegistrationStatus(updated.status) ? 1 : -1 },
            $set: { updatedAt: new Date() }
          },
          { session }
        )
      }
      return updated
    })
    if (!registration) throw new ErrorWithStatus({ message: 'Không tìm thấy đăng ký.', status: HTTP_STATUS.NOT_FOUND })
    emitUser(COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS.REGISTRATION_UPDATED, userId, registration)
    return registration
  }

  async listLiveParticipants(eventId: ObjectId, context: AuthContext) {
    const event = await this.getEvent(eventId)
    await this.assertCanManageEvent(event, context)
    const participants = await liveKitService.listParticipants(eventId.toString())
    return { eventId: eventId.toString(), roomName: liveKitService.getRoomName(eventId.toString()), participants }
  }

  async muteLiveParticipantAudio(eventId: ObjectId, userId: ObjectId, context: AuthContext) {
    const event = await this.getEvent(eventId)
    await this.assertCanManageEvent(event, context)
    const result = await liveKitService.muteParticipantAudio(eventId.toString(), userId.toString())
    emitVideoEvent(COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS.UPDATED, eventId, {
      eventId,
      userId,
      action: 'participant-muted',
      track: result.track
    })
    return result
  }

  async disableLiveParticipantCamera(eventId: ObjectId, userId: ObjectId, context: AuthContext) {
    const event = await this.getEvent(eventId)
    await this.assertCanManageEvent(event, context)
    const result = await liveKitService.disableParticipantCamera(eventId.toString(), userId.toString())
    emitVideoEvent(COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS.UPDATED, eventId, {
      eventId,
      userId,
      action: 'participant-camera-disabled',
      cameraPublishAllowed: false
    })
    return result
  }

  async disableLiveParticipantScreenShare(eventId: ObjectId, userId: ObjectId, context: AuthContext) {
    const event = await this.getEvent(eventId)
    await this.assertCanManageEvent(event, context)
    const result = await liveKitService.disableParticipantScreenShare(eventId.toString(), userId.toString())
    emitVideoEvent(COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS.UPDATED, eventId, {
      eventId,
      userId,
      action: 'participant-screen-share-disabled',
      screenSharePublishAllowed: false
    })
    return result
  }

  async enableLiveParticipantAudio(eventId: ObjectId, userId: ObjectId, context: AuthContext) {
    const event = await this.getEvent(eventId)
    await this.assertCanManageEvent(event, context)
    const result = await liveKitService.enableParticipantAudio(eventId.toString(), userId.toString())
    emitVideoEvent(COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS.UPDATED, eventId, {
      eventId,
      userId,
      action: 'participant-audio-enabled',
      audioPublishAllowed: true
    })
    return result
  }

  async enableLiveParticipantCamera(eventId: ObjectId, userId: ObjectId, context: AuthContext) {
    const event = await this.getEvent(eventId)
    await this.assertCanManageEvent(event, context)
    const result = await liveKitService.enableParticipantCamera(eventId.toString(), userId.toString())
    emitVideoEvent(COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS.UPDATED, eventId, {
      eventId,
      userId,
      action: 'participant-camera-enabled',
      cameraPublishAllowed: true
    })
    return result
  }

  async enableLiveParticipantScreenShare(eventId: ObjectId, userId: ObjectId, context: AuthContext) {
    const event = await this.getEvent(eventId)
    await this.assertCanManageEvent(event, context)
    const result = await liveKitService.enableParticipantScreenShare(eventId.toString(), userId.toString())
    emitVideoEvent(COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS.UPDATED, eventId, {
      eventId,
      userId,
      action: 'participant-screen-share-enabled',
      screenSharePublishAllowed: true
    })
    return result
  }

  async kickLiveParticipant(eventId: ObjectId, userId: ObjectId, context: AuthContext) {
    const event = await this.getEvent(eventId)
    await this.assertCanManageEvent(event, context)
    const result = await liveKitService.removeParticipant(eventId.toString(), userId.toString())
    emitVideoEvent(COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS.UPDATED, eventId, {
      eventId,
      userId,
      action: 'participant-kicked'
    })
    return result
  }

  async banLiveParticipant(eventId: ObjectId, userId: ObjectId, context: AuthContext) {
    const event = await this.getEvent(eventId)
    await this.assertCanManageEvent(event, context)
    await this.updateRegistration(eventId, userId, context, {
      status: 'removed',
      removeReason: 'Admin removed participant from live meeting'
    })
    const result = await liveKitService.removeParticipant(eventId.toString(), userId.toString())
    emitVideoEvent(COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS.UPDATED, eventId, {
      eventId,
      userId,
      action: 'participant-banned'
    })
    return { ...result, action: 'banned' as const }
  }

  async sendDueReminders() {
    const now = new Date()
    const windowStart = new Date(now.getTime() + 14 * 60 * 1000)
    const windowEnd = new Date(now.getTime() + 16 * 60 * 1000)
    const events = await databaseService.communityVideoEvents
      .find({
        status: 'scheduled',
        scheduledStartAt: { $gte: windowStart, $lte: windowEnd },
        'reminders.fifteenMinutesSentAt': null
      })
      .sort({ scheduledStartAt: 1 })
      .limit(REMINDER_EVENT_BATCH_SIZE)
      .toArray()

    let sentCount = 0
    let failedCount = 0
    for (const event of events) {
      let eventFailedCount = 0
      let hasMoreRegistrations = true

      while (hasMoreRegistrations) {
        const registrations = await databaseService.communityVideoEventRegistrations
          .find({ eventId: event._id, status: 'registered', reminder15mSentAt: { $exists: false } })
          .project({ userId: 1 })
          .limit(REMINDER_REGISTRATION_BATCH_SIZE)
          .toArray()

        if (registrations.length === 0) break

        const results = await Promise.allSettled(
          registrations.map(async (registration: any) => {
            let io
            try { io = getIO() } catch { io = undefined }
            await notificationService.notifyVideoEventReminder(
              registration.userId,
              event.title,
              event._id.toString(),
              io
            )
            return registration._id
          })
        )

        const successfulRegistrationIds = results
          .filter((result): result is PromiseFulfilledResult<ObjectId> => result.status === 'fulfilled')
          .map((result) => result.value)
        const batchFailedCount = results.filter((result) => result.status === 'rejected').length

        sentCount += successfulRegistrationIds.length
        failedCount += batchFailedCount
        eventFailedCount += batchFailedCount

        if (successfulRegistrationIds.length > 0) {
          await databaseService.communityVideoEventRegistrations.updateMany(
            { _id: { $in: successfulRegistrationIds } },
            { $set: { reminder15mSentAt: now } }
          )
        }

        hasMoreRegistrations =
          registrations.length === REMINDER_REGISTRATION_BATCH_SIZE && successfulRegistrationIds.length > 0
      }

      if (eventFailedCount > 0) {
        console.error('[CommunityVideoEvents] reminder delivery had failures', {
          eventId: event._id.toString(),
          failedCount: eventFailedCount
        })
      } else {
        await databaseService.communityVideoEvents.updateOne(
          { _id: event._id },
          { $set: { 'reminders.fifteenMinutesSentAt': now, updatedAt: now } }
        )
      }
    }
    return { processedEvents: events.length, sentCount, failedCount }
  }
}

const communityVideoEventsService = new CommunityVideoEventsService()
export default communityVideoEventsService
