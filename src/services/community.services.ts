import { ObjectId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { UserRole } from '~/constants/enum'
import { ErrorWithStatus } from '~/models/Error'
import aiModerationService from '~/services/aiModeration.services'
import communityVideoEventAccessService from '~/services/communityVideoEventAccess.services'
import databaseService from '~/services/database.services'
import { getIO } from '~/sockets/chat.socket'
import { moderateTextRuleBased } from '~/utils/moderation/moderationEngine'

type RoomVisibility = 'public' | 'private'
type RoomStatus = 'active' | 'archived'
type RoomSort = 'activity' | 'newest' | 'members' | 'messages' | 'featured'
type ThreadPrefix = 'question' | 'review' | 'warning' | 'story' | 'experience' | 'pharmacist'
type ThreadStatus = 'open' | 'answered' | 'hidden' | 'deleted'
type ThreadSort = 'latest' | 'newest' | 'hot' | 'unanswered'
type ThreadVideoMeetingStatus = 'scheduled' | 'live' | 'ended'

type RoomMetadataParams = {
  description?: string
  topicLabel?: string
  iconKey?: string
  coverImage?: string
  guidelines?: string[]
  pinnedMessage?: string
  featured?: boolean
  sortOrder?: number
}

type MemberRole = 'member' | 'moderator' | 'admin'
type MemberStatus = 'pending' | 'invited' | 'active' | 'left' | 'banned'

type MessageStatus = 'visible' | 'hidden' | 'deleted'
type MessageReactionType = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry' | 'helpful' | 'thanks' | 'care' | 'dislike'

type FindingStatus = 'open' | 'resolved'

type ModerationTrigger = 'auto' | 'user_report' | 'ai'
type ModerationSeverity = 'low' | 'medium' | 'high' | 'critical'
type ModerationConfidence = 'low' | 'medium' | 'high' | number
type CommunityModerationDecision = {
  categories: string[]
  severity: ModerationSeverity
  confidence: ModerationConfidence
  reasons: string[]
  trigger: ModerationTrigger
  shouldAutoHide: boolean
  ai?: {
    severity: ModerationSeverity
    categories: string[]
    confidence: number
    shouldHide: boolean
    requiresHumanReview: boolean
    reason: string
    suggestedAction: 'none' | 'review' | 'hide'
    model?: string
    promptVersion?: string
    reviewedAt: Date
    latencyMs: number
  }
}

type AuthContext = {
  userId?: ObjectId
  role?: UserRole
}

type ThreadVideoMeetingInput = {
  url?: string
  eventId?: string | ObjectId
  provider?: string
  status?: ThreadVideoMeetingStatus
  startsAt?: string | Date | null
  endsAt?: string | Date | null
  title?: string
  note?: string
} | null

const THREAD_CREATE_COOLDOWN_SECONDS = Number(process.env.COMMUNITY_THREAD_CREATE_COOLDOWN_SECONDS || 20)
const REPLY_CREATE_COOLDOWN_SECONDS = Number(process.env.COMMUNITY_REPLY_CREATE_COOLDOWN_SECONDS || 8)
const DUPLICATE_THREAD_WINDOW_DAYS = Number(process.env.COMMUNITY_DUPLICATE_THREAD_WINDOW_DAYS || 14)
const MESSAGE_SELF_EDIT_WINDOW_MINUTES = Number(process.env.COMMUNITY_MESSAGE_SELF_EDIT_WINDOW_MINUTES || 30)
const MESSAGE_SELF_DELETE_WINDOW_MINUTES = Number(process.env.COMMUNITY_MESSAGE_SELF_DELETE_WINDOW_MINUTES || 30)

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

function emitCommunityVideoEvent(event: string, videoEventId: ObjectId | string, payload: unknown) {
  try {
    getIO().to(`community:video-event:${videoEventId.toString()}`).emit(event, payload)
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

const THREAD_PREFIXES: ThreadPrefix[] = ['question', 'review', 'warning', 'story', 'experience', 'pharmacist']
const PUBLIC_THREAD_STATUSES: ThreadStatus[] = ['open', 'answered']
const MESSAGE_REACTION_TYPES: MessageReactionType[] = ['like', 'love', 'haha', 'wow', 'sad', 'angry', 'helpful', 'thanks', 'care', 'dislike']
const EMPTY_MESSAGE_REACTION_COUNTS: Record<MessageReactionType, number> = {
  like: 0,
  love: 0,
  haha: 0,
  wow: 0,
  sad: 0,
  angry: 0,
  helpful: 0,
  thanks: 0,
  care: 0,
  dislike: 0
}
const THREAD_VIDEO_MEETING_STATUSES: ThreadVideoMeetingStatus[] = ['scheduled', 'live', 'ended']
class CommunityService {
  private async moderateCommunityContent(content: string, ruleInput = content): Promise<CommunityModerationDecision> {
    const ruleResult = moderateTextRuleBased(ruleInput)
    const config = aiModerationService.getConfig()
    const ruleShouldHide = ruleResult.severity === 'high' || ruleResult.severity === 'critical'

    const fallback: CommunityModerationDecision = {
      categories: ruleResult.categories,
      severity: ruleResult.severity,
      confidence: ruleResult.confidence,
      reasons: ruleResult.reasons,
      trigger: 'auto',
      shouldAutoHide: ruleShouldHide
    }

    if (!config.autoEnabled || !config.configured || !content.trim()) return fallback

    try {
      const startedAt = Date.now()
      const aiResult = await aiModerationService.reviewText(content, { ruleResult })
      const latencyMs = Date.now() - startedAt
      const aiPayload = {
        ...aiResult,
        model: config.model,
        promptVersion: 'community-moderation-v1',
        reviewedAt: new Date(),
        latencyMs
      }
      const aiShouldHide =
        aiResult.shouldHide &&
        aiResult.severity !== 'low' &&
        aiResult.confidence >= config.autoHideConfidence
      const shouldReviewToxic =
        aiResult.severity !== 'low' &&
        aiResult.confidence >= config.reviewConfidence &&
        aiResult.categories.some((category) => category === 'toxic' || category === 'harassment')
      const aiNeedsQueue =
        aiShouldHide ||
        shouldReviewToxic ||
        (aiResult.requiresHumanReview && aiResult.severity !== 'low' && aiResult.confidence >= config.reviewConfidence)

      return {
        categories: aiNeedsQueue ? aiResult.categories : [],
        severity: aiNeedsQueue ? aiResult.severity : 'low',
        confidence: aiResult.confidence,
        reasons: aiNeedsQueue && aiResult.reason ? [`AI: ${aiResult.reason}`] : [],
        trigger: 'ai',
        shouldAutoHide: aiShouldHide,
        ai: aiPayload
      }
    } catch {
      return fallback
    }
  }

  private async attachMessageSender(message: any) {
    if (!message?.senderId) return message
    const [sender, replyTo] = await Promise.all([
      databaseService.users.findOne(
        { _id: message.senderId },
        { projection: { _id: 1, firstName: 1, lastName: 1, email: 1, avatar: 1, role: 1 } }
      ),
      message.replyToMessageId
        ? databaseService.communityMessages
            .aggregate([
              { $match: { _id: message.replyToMessageId } },
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
                  _id: 1,
                  roomId: 1,
                  senderId: 1,
                  content: 1,
                  imageUrl: 1,
                  status: 1,
                  createdAt: 1,
                  sender: { _id: 1, firstName: 1, lastName: 1, email: 1, avatar: 1, role: 1 }
                }
              }
            ])
            .next()
        : Promise.resolve(null)
    ])
    return { ...message, ...(sender ? { sender } : {}), ...(replyTo ? { replyTo } : {}) }
  }

  private async attachMessageReactions<T extends any>(messages: T[], viewer?: AuthContext): Promise<T[]> {
    const messageIds = messages.map((message) => message?._id).filter(Boolean)
    if (!messageIds.length) return messages

    const [counts, viewerReactions] = await Promise.all([
      databaseService.communityReactions
        .aggregate([
          { $match: { messageId: { $in: messageIds } } },
          { $group: { _id: { messageId: '$messageId', type: '$type' }, count: { $sum: 1 } } }
        ])
        .toArray(),
      viewer?.userId
        ? databaseService.communityReactions
            .find({ messageId: { $in: messageIds }, userId: viewer.userId }, { projection: { messageId: 1, type: 1 } })
            .toArray()
        : Promise.resolve([])
    ])

    const countsByMessage = new Map<string, Record<MessageReactionType, number>>()
    counts.forEach((item) => {
      const messageId = String(item._id.messageId)
      const current = countsByMessage.get(messageId) || { ...EMPTY_MESSAGE_REACTION_COUNTS }
      if (MESSAGE_REACTION_TYPES.includes(item._id.type)) current[item._id.type as MessageReactionType] = item.count
      countsByMessage.set(messageId, current)
    })

    const viewerReactionByMessage = new Map<string, MessageReactionType>()
    viewerReactions.forEach((item: any) => viewerReactionByMessage.set(String(item.messageId), item.type))

    return messages.map((message) => {
      const messageId = String(message._id)
      return {
        ...message,
        reactionCounts: countsByMessage.get(messageId) || { ...EMPTY_MESSAGE_REACTION_COUNTS },
        viewerReaction: viewerReactionByMessage.get(messageId) || null
      }
    })
  }

  private async ensureRoomReadable(roomId: ObjectId, viewer?: AuthContext) {
    const room = await databaseService.communityRooms.findOne({ _id: roomId, status: 'active' })
    if (!room) throw new ErrorWithStatus({ message: 'Không tìm thấy chuyên mục.', status: HTTP_STATUS.NOT_FOUND })
    if (room.visibility === 'public' || viewer?.role === UserRole.Admin) return room
    if (!viewer?.userId) {
      throw new ErrorWithStatus({ message: 'Vui lòng đăng nhập để xem chuyên mục riêng tư.', status: HTTP_STATUS.UNAUTHORIZED })
    }
    const member = await databaseService.communityRoomMembers.findOne({ roomId, userId: viewer.userId })
    if (member?.status !== 'active') {
      throw new ErrorWithStatus({ message: 'Bạn chưa tham gia chuyên mục này.', status: HTTP_STATUS.FORBIDDEN })
    }
    return room
  }

  private async getThreadForViewer(threadId: ObjectId, viewer?: AuthContext) {
    const thread = await databaseService.communityThreads.findOne({ _id: threadId, status: { $ne: 'deleted' } })
    if (!thread) throw new ErrorWithStatus({ message: 'Không tìm thấy thread.', status: HTTP_STATUS.NOT_FOUND })
    await this.ensureRoomReadable(thread.roomId as ObjectId, viewer)
    const canSeeHidden = viewer?.role === UserRole.Admin || String(thread.authorId || '') === String(viewer?.userId || '')
    if (thread.status === 'hidden' && !canSeeHidden) {
      throw new ErrorWithStatus({ message: 'Thread đang bị ẩn.', status: HTTP_STATUS.NOT_FOUND })
    }
    return thread
  }

  private async attachThreadRelations(thread: any, viewer?: AuthContext) {
    if (!thread) return thread
    const [author, room, viewerMembership, starterMessage, acceptedReply] = await Promise.all([
      thread.authorId
        ? databaseService.users.findOne(
            { _id: thread.authorId },
            { projection: { _id: 1, firstName: 1, lastName: 1, email: 1, avatar: 1, role: 1 } }
          )
        : Promise.resolve(null),
      thread.roomId
        ? databaseService.communityRooms.findOne(
            { _id: thread.roomId },
            { projection: { _id: 1, name: 1, slug: 1, diseaseKey: 1, topicLabel: 1, visibility: 1 } }
          )
        : Promise.resolve(null),
      thread.roomId && viewer?.userId
        ? databaseService.communityRoomMembers.findOne({ roomId: thread.roomId, userId: viewer.userId })
        : Promise.resolve(null),
      thread.starterMessageId ? this.attachMessageSender(await databaseService.communityMessages.findOne({ _id: thread.starterMessageId })) : Promise.resolve(null),
      thread.acceptedReplyId ? this.attachMessageSender(await databaseService.communityMessages.findOne({ _id: thread.acceptedReplyId })) : Promise.resolve(null)
    ])
    const [starterMessageWithReactions] = starterMessage ? await this.attachMessageReactions([starterMessage], viewer) : [null]
    const [acceptedReplyWithReactions] = acceptedReply ? await this.attachMessageReactions([acceptedReply], viewer) : [null]

    return {
      ...thread,
      ...(author ? { author } : {}),
      ...(room ? { room: { ...room, ...(viewerMembership ? { viewerMembership } : {}) } } : {}),
      ...(starterMessageWithReactions ? { starterMessage: starterMessageWithReactions } : {}),
      ...(acceptedReplyWithReactions ? { acceptedReply: acceptedReplyWithReactions } : {})
    }
  }

  private normalizeRoomMetadata(params: RoomMetadataParams) {
    const update: any = {}
    if (params.description !== undefined) update.description = params.description.trim() || undefined
    if (params.topicLabel !== undefined) update.topicLabel = params.topicLabel.trim() || undefined
    if (params.iconKey !== undefined) update.iconKey = params.iconKey.trim() || undefined
    if (params.coverImage !== undefined) update.coverImage = params.coverImage.trim() || undefined
    if (params.guidelines !== undefined) {
      update.guidelines = Array.isArray(params.guidelines)
        ? params.guidelines
            .map((item) => String(item || '').trim())
            .filter(Boolean)
            .slice(0, 8)
        : undefined
    }
    if (params.pinnedMessage !== undefined) update.pinnedMessage = params.pinnedMessage.trim() || undefined
    if (params.featured !== undefined) update.featured = Boolean(params.featured)
    if (params.sortOrder !== undefined && Number.isFinite(Number(params.sortOrder)))
      update.sortOrder = Number(params.sortOrder)
    return update
  }

  private normalizeThreadVideoMeeting(input: ThreadVideoMeetingInput, updatedBy?: ObjectId) {
    if (input === null) return null
    if (!input || typeof input !== 'object') return undefined

    const url = String(input.url || '').trim()
    if (!url) return null

    const now = new Date()
    const status = THREAD_VIDEO_MEETING_STATUSES.includes(input.status as ThreadVideoMeetingStatus)
      ? (input.status as ThreadVideoMeetingStatus)
      : 'scheduled'
    const startsAt = input.startsAt ? new Date(input.startsAt) : undefined
    const endsAt = input.endsAt ? new Date(input.endsAt) : undefined

    return {
      url,
      ...(input.eventId && ObjectId.isValid(String(input.eventId)) ? { eventId: new ObjectId(String(input.eventId)) } : {}),
      provider: String(input.provider || 'livekit').trim() || 'livekit',
      status,
      ...(startsAt && !Number.isNaN(startsAt.getTime()) ? { startsAt } : {}),
      ...(endsAt && !Number.isNaN(endsAt.getTime()) ? { endsAt } : {}),
      title: String(input.title || '').trim().slice(0, 160),
      note: String(input.note || '').trim().slice(0, 500),
      ...(updatedBy ? { updatedBy } : {}),
      updatedAt: now
    }
  }

  private roomMetricsPipeline(match: Record<string, unknown>, viewerId?: ObjectId, sort: RoomSort = 'activity') {
    const pipeline: any[] = [
      { $match: match },
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
          from: process.env.DB_COMMUNITY_ROOM_MEMBERS_COLLECTION || 'communityRoomMembers',
          let: { roomId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$roomId', '$$roomId'] }, { $eq: ['$status', 'pending'] }]
                }
              }
            },
            { $count: 'count' }
          ],
          as: 'pendingMemberStats'
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
                  $and: [
                    { $eq: ['$roomId', '$$roomId'] },
                    { $eq: ['$status', 'visible'] },
                    { $eq: [{ $type: '$videoEventId' }, 'missing'] }
                  ]
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
                    { $eq: [{ $type: '$videoEventId' }, 'missing'] },
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
      pendingMemberCount: { $ifNull: [{ $arrayElemAt: ['$pendingMemberStats.count', 0] }, 0] },
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
    const sortMap: Record<RoomSort, Record<string, 1 | -1>> = {
      activity: { lastMessageAt: -1, featured: -1, sortOrder: 1, createdAt: -1 },
      newest: { createdAt: -1 },
      members: { memberCount: -1, lastMessageAt: -1, createdAt: -1 },
      messages: { messageCount: -1, lastMessageAt: -1, createdAt: -1 },
      featured: { featured: -1, sortOrder: 1, lastMessageAt: -1, createdAt: -1 }
    }
    pipeline.push({ $sort: sortMap[sort] || sortMap.activity })
    pipeline.push({
      $project: {
        memberStats: 0,
        pendingMemberStats: 0,
        messageStats: 0,
        unreadStats: 0
      }
    })

    return pipeline
  }

  async listRooms(filters?: {
    visibility?: RoomVisibility
    diseaseKey?: string
    search?: string
    sort?: RoomSort
    viewer?: AuthContext
    includePrivate?: boolean
  }) {
    const query: any = { status: 'active' as RoomStatus }
    if (filters?.diseaseKey) query.diseaseKey = filters.diseaseKey
    const search = filters?.search?.trim()
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i')
      query.$or = [
        { name: regex },
        { slug: regex },
        { diseaseKey: regex },
        { topicLabel: regex },
        { description: regex },
        { tags: regex }
      ]
    }

    const viewerId = filters?.viewer?.userId
    const isAdmin = filters?.viewer?.role === UserRole.Admin

    if (filters?.includePrivate && isAdmin) {
      if (filters.visibility) query.visibility = filters.visibility
      return databaseService.communityRooms
        .aggregate(this.roomMetricsPipeline(query, viewerId, filters?.sort))
        .toArray()
    }

    if (filters?.includePrivate && viewerId) {
      const memberships = await databaseService.communityRoomMembers
        .find({ userId: viewerId, status: { $in: ['active', 'invited', 'pending', 'banned'] } })
        .project({ roomId: 1 })
        .toArray()
      const allowedPrivateRoomIds = memberships.map((member: any) => member.roomId).filter(Boolean)

      if (filters.visibility === 'private') {
        query.visibility = 'private'
        query._id = { $in: allowedPrivateRoomIds }
      } else if (filters.visibility === 'public') {
        query.visibility = 'public'
      } else {
        const visibilityOr: any[] = [{ visibility: 'public' }]
        if (allowedPrivateRoomIds.length > 0) {
          visibilityOr.push({ _id: { $in: allowedPrivateRoomIds }, visibility: 'private' })
        }
        if (query.$or) {
          query.$and = [{ $or: query.$or }, { $or: visibilityOr }]
          delete query.$or
        } else {
          query.$or = visibilityOr
        }
      }
    } else {
      query.visibility = 'public'
    }

    return databaseService.communityRooms.aggregate(this.roomMetricsPipeline(query, viewerId, filters?.sort)).toArray()
  }

  async listAdminRooms(filters?: {
    visibility?: RoomVisibility
    status?: RoomStatus
    diseaseKey?: string
    search?: string
    sort?: RoomSort
  }) {
    const query: any = {}
    if (filters?.visibility) query.visibility = filters.visibility
    if (filters?.status) query.status = filters.status
    if (filters?.diseaseKey) query.diseaseKey = filters.diseaseKey
    const search = filters?.search?.trim()
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i')
      query.$or = [
        { name: regex },
        { slug: regex },
        { diseaseKey: regex },
        { topicLabel: regex },
        { description: regex }
      ]
    }
    return databaseService.communityRooms.aggregate(this.roomMetricsPipeline(query, undefined, filters?.sort)).toArray()
  }

  async createRoom(
    params: {
      name: string
      slug?: string
      visibility: RoomVisibility
      diseaseKey?: string
      createdBy: ObjectId
    } & RoomMetadataParams
  ) {
    const now = new Date()
    const doc = {
      name: params.name.trim(),
      slug: (params.slug || slugify(params.name)).trim(),
      visibility: params.visibility,
      diseaseKey: params.diseaseKey?.trim() || undefined,
      ...this.normalizeRoomMetadata(params),
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

  async updateRoom(
    roomId: ObjectId,
    params: { name?: string; slug?: string; visibility?: RoomVisibility; diseaseKey?: string } & RoomMetadataParams
  ) {
    const update: any = { updatedAt: new Date() }
    if (params.name !== undefined) update.name = params.name.trim()
    if (params.slug !== undefined) update.slug = params.slug.trim()
    if (params.visibility !== undefined) update.visibility = params.visibility
    if (params.diseaseKey !== undefined) update.diseaseKey = params.diseaseKey.trim() || undefined
    Object.assign(update, this.normalizeRoomMetadata(params))

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
      if (!user?._id)
        throw new ErrorWithStatus({ message: 'Không tìm thấy người dùng.', status: HTTP_STATUS.NOT_FOUND })
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

  async listThreads(params: {
    roomId: ObjectId
    viewer?: AuthContext
    page: number
    limit: number
    q?: string
    prefix?: string
    sort?: string
  }) {
    await this.ensureRoomReadable(params.roomId, params.viewer)
    const page = params.page || 1
    const limit = params.limit || 20
    const skip = (page - 1) * limit
    const query: any = { roomId: params.roomId, status: { $in: PUBLIC_THREAD_STATUSES } }
    if (params.prefix && THREAD_PREFIXES.includes(params.prefix as ThreadPrefix)) query.prefix = params.prefix
    const search = params.q?.trim()
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i')
      query.$or = [{ title: regex }, { content: regex }, { tags: regex }]
    }

    const sortKey = (params.sort || 'latest') as ThreadSort
    if (sortKey === 'unanswered') query.replyCount = 0
    const sortMap: Record<ThreadSort, Record<string, 1 | -1>> = {
      latest: { sticky: -1, lastReplyAt: -1, createdAt: -1 },
      newest: { sticky: -1, createdAt: -1 },
      hot: { sticky: -1, replyCount: -1, viewCount: -1, lastReplyAt: -1 },
      unanswered: { sticky: -1, createdAt: -1 }
    }

    const [items, total] = await Promise.all([
      databaseService.communityThreads
        .aggregate([
          { $match: query },
          { $sort: sortMap[sortKey] || sortMap.latest },
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: process.env.USERS_COLLECTION || 'users',
              localField: 'authorId',
              foreignField: '_id',
              as: 'author'
            }
          },
          { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: process.env.DB_COMMUNITY_MESSAGES_COLLECTION || 'communityMessages',
              localField: 'lastReplyId',
              foreignField: '_id',
              as: 'lastReply'
            }
          },
          { $unwind: { path: '$lastReply', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              roomId: 1,
              title: 1,
              slug: 1,
              prefix: 1,
              authorId: 1,
              isAnonymous: 1,
              content: 1,
              imageUrl: 1,
              videoMeeting: 1,
              tags: 1,
              status: 1,
              sticky: 1,
              locked: 1,
              starterMessageId: 1,
              acceptedReplyId: 1,
              viewCount: 1,
              replyCount: 1,
              lastReplyAt: 1,
              lastReplyId: 1,
              createdAt: 1,
              updatedAt: 1,
              author: { _id: 1, firstName: 1, lastName: 1, email: 1, avatar: 1, role: 1 },
              lastReplyPreview: '$lastReply.content'
            }
          }
        ])
        .toArray(),
      databaseService.communityThreads.countDocuments(query)
    ])

    return { items, page, limit, total }
  }

  async createThread(params: {
    roomId: ObjectId
    userId: ObjectId
    title: string
    content: string
    prefix?: ThreadPrefix
    isAnonymous?: boolean
    imageUrl?: string
  }) {
    const member = await this.requireCanChat(params.roomId, params.userId)
    const now = new Date()
    const title = params.title.trim()
    const content = params.content.trim()
    const imageUrl = params.imageUrl?.trim() || ''

    const recentThread = await databaseService.communityThreads.findOne({
      roomId: params.roomId,
      authorId: params.userId,
      status: { $ne: 'deleted' as ThreadStatus },
      createdAt: { $gte: new Date(now.getTime() - THREAD_CREATE_COOLDOWN_SECONDS * 1000) }
    })
    if (recentThread) {
      throw new ErrorWithStatus({
        message: `Bạn tạo thread quá nhanh. Vui lòng thử lại sau ${THREAD_CREATE_COOLDOWN_SECONDS} giây.`,
        status: HTTP_STATUS.TOO_MANY_REQUESTS
      })
    }

    const duplicateThread = await databaseService.communityThreads.findOne({
      roomId: params.roomId,
      title: new RegExp(`^${escapeRegex(title)}$`, 'i'),
      status: { $ne: 'deleted' as ThreadStatus },
      createdAt: { $gte: new Date(now.getTime() - DUPLICATE_THREAD_WINDOW_DAYS * 24 * 60 * 60 * 1000) }
    })
    if (duplicateThread) {
      throw new ErrorWithStatus({
        message: 'Đã có thread cùng tiêu đề trong chuyên mục này. Vui lòng tìm và tiếp tục trao đổi trong thread cũ.',
        status: HTTP_STATUS.CONFLICT
      })
    }

    const threadId = new ObjectId()
    const starterMessageId = new ObjectId()
    const slug = `${slugify(title)}-${threadId.toString().slice(-6)}`
    const moderation = await this.moderateCommunityContent(`${title}\n${content}`)
    const shouldAutoHide = moderation.shouldAutoHide
    const threadStatus: ThreadStatus = shouldAutoHide ? 'hidden' : 'open'

    const threadDoc: any = {
      _id: threadId,
      roomId: params.roomId,
      title,
      slug,
      prefix: THREAD_PREFIXES.includes(params.prefix as ThreadPrefix) ? params.prefix : 'question',
      authorId: params.userId,
      isAnonymous: Boolean(params.isAnonymous),
      content,
      ...(imageUrl ? { imageUrl } : {}),
      status: threadStatus,
      sticky: false,
      locked: false,
      starterMessageId,
      viewCount: 0,
      replyCount: 0,
      lastReplyAt: now,
      createdAt: now,
      updatedAt: now
    }

    const messageDoc: any = {
      _id: starterMessageId,
      roomId: params.roomId,
      threadId,
      senderId: params.userId,
      content,
      ...(imageUrl ? { imageUrl } : {}),
      isThreadStarter: true,
      status: shouldAutoHide ? ('hidden' as MessageStatus) : ('visible' as MessageStatus),
      createdAt: now,
      updatedAt: now,
      moderated: {
        autoHidden: shouldAutoHide,
        at: now,
        severity: moderation.severity,
        categories: moderation.categories,
        confidence: moderation.confidence,
        reasons: moderation.reasons,
        ...(moderation.ai ? { ai: moderation.ai } : {})
      }
    }

    await databaseService.communityThreads.insertOne(threadDoc)
    await databaseService.communityMessages.insertOne(messageDoc)

    let findingId: ObjectId | undefined
    if (moderation.categories.length > 0 && moderation.severity !== 'low') {
      const findingInsert = await databaseService.moderationFindings.insertOne({
        roomId: params.roomId,
        messageId: starterMessageId,
        senderId: params.userId,
        trigger: moderation.trigger,
        status: 'open' as FindingStatus,
        severity: moderation.severity,
        categories: moderation.categories,
        confidence: moderation.confidence,
        reasons: moderation.reasons,
        ...(moderation.ai ? { ai: moderation.ai } : {}),
        reportCount: 0,
        createdAt: now,
        updatedAt: now
      } as any)
      findingId = findingInsert.insertedId
      await databaseService.communityMessages.updateOne(
        { _id: starterMessageId },
        { $set: { 'moderated.findingId': findingId } }
      )
      emitToAdmins('community:moderation:queued', { findingId, roomId: params.roomId, messageId: starterMessageId })
    }

    const storedMessage = await databaseService.communityMessages.findOne({ _id: starterMessageId })
    if (storedMessage && !moderation.ai) aiModerationService.enqueueMessageReview({ message: storedMessage, ruleResult: moderation }).catch(() => {})

    const thread = await this.attachThreadRelations(await databaseService.communityThreads.findOne({ _id: threadId }), {
      userId: params.userId
    })
    if (threadStatus === 'open') emitCommunity('community:thread:new', params.roomId, thread)
    else emitToUser('community:thread:hidden', params.userId, thread)
    return { thread, moderation, memberRole: member.role as MemberRole }
  }

  async getThread(threadId: ObjectId, params?: { viewer?: AuthContext; incrementView?: boolean }) {
    const thread = await this.getThreadForViewer(threadId, params?.viewer)
    if (params?.incrementView && thread.status !== 'hidden') {
      await databaseService.communityThreads.updateOne({ _id: threadId }, { $inc: { viewCount: 1 } })
      thread.viewCount = (thread.viewCount || 0) + 1
    }
    return this.attachThreadRelations(thread, params?.viewer)
  }

  async listThreadReplies(params: { threadId: ObjectId; viewer?: AuthContext; page: number; limit: number }) {
    const thread = await this.getThreadForViewer(params.threadId, params.viewer)
    await this.ensureRoomReadable(thread.roomId as ObjectId, params.viewer)
    const page = params.page || 1
    const limit = params.limit || 20
    const skip = (page - 1) * limit
    const visibilityOr: any[] = [{ status: 'visible' as MessageStatus }]
    if (params.viewer?.userId) visibilityOr.push({ status: 'hidden' as MessageStatus, senderId: params.viewer.userId })
    const query: any = {
      threadId: params.threadId,
      isThreadStarter: { $ne: true },
      $or: visibilityOr
    }

    const [items, total] = await Promise.all([
      databaseService.communityMessages
        .aggregate([
          { $match: query },
          { $sort: { createdAt: 1 } },
          { $skip: skip },
          { $limit: limit },
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
            $lookup: {
              from: process.env.DB_COMMUNITY_MESSAGES_COLLECTION || 'communityMessages',
              localField: 'replyToMessageId',
              foreignField: '_id',
              as: 'replyTo'
            }
          },
          { $unwind: { path: '$replyTo', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: process.env.USERS_COLLECTION || 'users',
              localField: 'replyTo.senderId',
              foreignField: '_id',
              as: 'replyToSender'
            }
          },
          { $unwind: { path: '$replyToSender', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              roomId: 1,
              threadId: 1,
              senderId: 1,
              content: 1,
              imageUrl: 1,
              replyToMessageId: 1,
              status: 1,
              createdAt: 1,
              updatedAt: 1,
              moderated: 1,
              sender: { _id: 1, firstName: 1, lastName: 1, email: 1, avatar: 1, role: 1 },
              replyTo: {
                $cond: [
                  { $ifNull: ['$replyTo._id', false] },
                  {
                    _id: '$replyTo._id',
                    roomId: '$replyTo.roomId',
                    threadId: '$replyTo.threadId',
                    senderId: '$replyTo.senderId',
                    content: '$replyTo.content',
                    imageUrl: '$replyTo.imageUrl',
                    status: '$replyTo.status',
                    createdAt: '$replyTo.createdAt',
                    sender: {
                      _id: '$replyToSender._id',
                      firstName: '$replyToSender.firstName',
                      lastName: '$replyToSender.lastName',
                      email: '$replyToSender.email',
                      avatar: '$replyToSender.avatar',
                      role: '$replyToSender.role'
                    }
                  },
                  null
                ]
              }
            }
          }
        ])
        .toArray(),
      databaseService.communityMessages.countDocuments(query)
    ])

    const itemsWithReactions = await this.attachMessageReactions(items, params.viewer)
    return { items: itemsWithReactions, page, limit, total }
  }

  async createThreadReply(params: {
    threadId: ObjectId
    userId: ObjectId
    content?: string
    imageUrl?: string
    replyToMessageId?: ObjectId
  }) {
    const thread = await this.getThreadForViewer(params.threadId, { userId: params.userId })
    if (thread.locked) throw new ErrorWithStatus({ message: 'Thread đã bị khóa.', status: HTTP_STATUS.FORBIDDEN })
    const member = await this.requireCanChat(thread.roomId as ObjectId, params.userId)
    const now = new Date()
    const content = params.content?.trim() || ''
    const imageUrl = params.imageUrl?.trim() || ''
    if (!content && !imageUrl) {
      throw new ErrorWithStatus({ message: 'Reply phải có nội dung hoặc ảnh.', status: HTTP_STATUS.BAD_REQUEST })
    }

    const recentReply = await databaseService.communityMessages.findOne({
      threadId: params.threadId,
      senderId: params.userId,
      isThreadStarter: { $ne: true },
      status: { $ne: 'deleted' as MessageStatus },
      createdAt: { $gte: new Date(now.getTime() - REPLY_CREATE_COOLDOWN_SECONDS * 1000) }
    })
    if (recentReply) {
      throw new ErrorWithStatus({
        message: `Bạn gửi trả lời quá nhanh. Vui lòng thử lại sau ${REPLY_CREATE_COOLDOWN_SECONDS} giây.`,
        status: HTTP_STATUS.TOO_MANY_REQUESTS
      })
    }

    let replyToMessageId: ObjectId | undefined
    if (params.replyToMessageId) {
      const replyTo = await databaseService.communityMessages.findOne({
        _id: params.replyToMessageId,
        threadId: params.threadId,
        status: 'visible' as MessageStatus
      })
      if (!replyTo) {
        throw new ErrorWithStatus({ message: 'Không tìm thấy reply cần trích dẫn.', status: HTTP_STATUS.NOT_FOUND })
      }
      replyToMessageId = params.replyToMessageId
    }

    const messageId = new ObjectId()
    const moderation = await this.moderateCommunityContent(content)
    const shouldAutoHide = moderation.shouldAutoHide
    const messageDoc: any = {
      _id: messageId,
      roomId: thread.roomId as ObjectId,
      threadId: params.threadId,
      senderId: params.userId,
      content,
      ...(imageUrl ? { imageUrl } : {}),
      ...(replyToMessageId ? { replyToMessageId } : {}),
      status: shouldAutoHide ? ('hidden' as MessageStatus) : ('visible' as MessageStatus),
      createdAt: now,
      updatedAt: now,
      moderated: {
        autoHidden: shouldAutoHide,
        at: now,
        severity: moderation.severity,
        categories: moderation.categories,
        confidence: moderation.confidence,
        reasons: moderation.reasons,
        ...(moderation.ai ? { ai: moderation.ai } : {})
      }
    }

    await databaseService.communityMessages.insertOne(messageDoc)

    let findingId: ObjectId | undefined
    if (moderation.categories.length > 0 && moderation.severity !== 'low') {
      const findingInsert = await databaseService.moderationFindings.insertOne({
        roomId: thread.roomId as ObjectId,
        messageId,
        senderId: params.userId,
        trigger: moderation.trigger,
        status: 'open' as FindingStatus,
        severity: moderation.severity,
        categories: moderation.categories,
        confidence: moderation.confidence,
        reasons: moderation.reasons,
        ...(moderation.ai ? { ai: moderation.ai } : {}),
        reportCount: 0,
        createdAt: now,
        updatedAt: now
      } as any)
      findingId = findingInsert.insertedId
      await databaseService.communityMessages.updateOne({ _id: messageId }, { $set: { 'moderated.findingId': findingId } })
      emitToAdmins('community:moderation:queued', { findingId, roomId: thread.roomId, messageId })
    }

    const stored = await databaseService.communityMessages.findOne({ _id: messageId })
    const messageWithSender = stored ? await this.attachMessageSender(stored) : stored
    if (messageWithSender && !moderation.ai) aiModerationService.enqueueMessageReview({ message: messageWithSender, ruleResult: moderation }).catch(() => {})

    if (messageWithSender?.status === 'visible') {
      await databaseService.communityThreads.updateOne(
        { _id: params.threadId },
        {
          $set: { lastReplyAt: now, lastReplyId: messageId, updatedAt: now },
          $inc: { replyCount: 1 }
        }
      )
      emitCommunity('community:thread:reply', thread.roomId as ObjectId, { threadId: params.threadId, message: messageWithSender })
    } else {
      emitToUser('community:message:hidden', params.userId, messageWithSender)
    }

    return { message: messageWithSender, moderation, memberRole: member.role as MemberRole }
  }

  async updateThread(
    threadId: ObjectId,
    params: {
      sticky?: boolean
      locked?: boolean
      status?: ThreadStatus
      acceptedReplyId?: ObjectId | null
      videoMeeting?: ThreadVideoMeetingInput
      updatedBy?: ObjectId
    }
  ) {
    const thread = await databaseService.communityThreads.findOne({ _id: threadId })
    if (!thread) throw new ErrorWithStatus({ message: 'Không tìm thấy thread.', status: HTTP_STATUS.NOT_FOUND })

    const update: any = { updatedAt: new Date() }
    if (params.sticky !== undefined) update.sticky = Boolean(params.sticky)
    if (params.locked !== undefined) update.locked = Boolean(params.locked)
    if (params.status !== undefined) update.status = params.status
    const videoMeeting = this.normalizeThreadVideoMeeting(params.videoMeeting, params.updatedBy)
    if (videoMeeting !== undefined && videoMeeting !== null) update.videoMeeting = videoMeeting
    if (params.acceptedReplyId !== undefined) {
      if (params.acceptedReplyId === null) {
        update.acceptedReplyId = null
        if (params.status === undefined && thread.status === 'answered') update.status = 'open'
      } else {
        const reply = await databaseService.communityMessages.findOne({
          _id: params.acceptedReplyId,
          threadId,
          status: 'visible' as MessageStatus
        })
        if (!reply) {
          throw new ErrorWithStatus({ message: 'Không tìm thấy reply cần xác nhận.', status: HTTP_STATUS.NOT_FOUND })
        }
        update.acceptedReplyId = params.acceptedReplyId
        if (params.status === undefined) update.status = 'answered' as ThreadStatus
      }
    }

    const updated = await databaseService.communityThreads.findOneAndUpdate(
      { _id: threadId },
      { $set: update, ...(videoMeeting === null ? { $unset: { videoMeeting: '' } } : {}) },
      { returnDocument: 'after' }
    )
    emitCommunity('community:thread:updated', thread.roomId as ObjectId, updated)
    return this.attachThreadRelations(updated)
  }

  async reactToMessage(params: { messageId: ObjectId; userId: ObjectId; type?: MessageReactionType | null }) {
    const message = await databaseService.communityMessages.findOne({ _id: params.messageId, status: { $ne: 'deleted' } })
    if (!message) throw new ErrorWithStatus({ message: 'Không tìm thấy bài viết.', status: HTTP_STATUS.NOT_FOUND })

    await this.requireActiveMember(message.roomId as ObjectId, params.userId)

    if ((message.senderId as ObjectId).equals(params.userId)) {
      throw new ErrorWithStatus({ message: 'Bạn không thể react bài viết của chính mình.', status: HTTP_STATUS.BAD_REQUEST })
    }

    const now = new Date()
    const current = await databaseService.communityReactions.findOne({ messageId: params.messageId, userId: params.userId })

    if (!params.type) {
      if (current) await databaseService.communityReactions.deleteOne({ _id: current._id })
    } else {
      if (!MESSAGE_REACTION_TYPES.includes(params.type)) {
        throw new ErrorWithStatus({ message: 'Reaction không hợp lệ.', status: HTTP_STATUS.BAD_REQUEST })
      }

      await databaseService.communityReactions.updateOne(
        { messageId: params.messageId, userId: params.userId },
        {
          $set: {
            roomId: message.roomId as ObjectId,
            threadId: message.threadId as ObjectId | undefined,
            messageId: params.messageId,
            userId: params.userId,
            type: params.type,
            updatedAt: now
          },
          $setOnInsert: { createdAt: now }
        },
        { upsert: true }
      )
    }

    const [messageWithReactions] = await this.attachMessageReactions([message], { userId: params.userId })
    emitCommunity('community:message:reaction', message.roomId as ObjectId, {
      messageId: params.messageId,
      threadId: message.threadId,
      reactionCounts: messageWithReactions.reactionCounts,
      viewerReaction: params.type || null
    })

    return {
      messageId: params.messageId,
      reactionCounts: messageWithReactions.reactionCounts,
      viewerReaction: messageWithReactions.viewerReaction
    }
  }

  async updateMessage(params: { messageId: ObjectId; userId: ObjectId; role?: UserRole; content?: string; imageUrl?: string }) {
    const message = await databaseService.communityMessages.findOne({ _id: params.messageId, status: { $ne: 'deleted' } })
    if (!message) throw new ErrorWithStatus({ message: 'Không tìm thấy bài viết.', status: HTTP_STATUS.NOT_FOUND })

    await this.requireActiveMember(message.roomId as ObjectId, params.userId)

    const isAdmin = params.role === UserRole.Admin
    const isOwner = (message.senderId as ObjectId).equals(params.userId)
    if (!isAdmin && !isOwner) {
      throw new ErrorWithStatus({ message: 'Bạn không có quyền sửa bài viết này.', status: HTTP_STATUS.FORBIDDEN })
    }

    const now = new Date()
    if (!isAdmin && now.getTime() - new Date(message.createdAt).getTime() > MESSAGE_SELF_EDIT_WINDOW_MINUTES * 60 * 1000) {
      throw new ErrorWithStatus({
        message: `Chỉ có thể sửa bài trong ${MESSAGE_SELF_EDIT_WINDOW_MINUTES} phút sau khi đăng.`,
        status: HTTP_STATUS.FORBIDDEN
      })
    }

    if (message.threadId) {
      const thread = await databaseService.communityThreads.findOne({ _id: message.threadId, status: { $ne: 'deleted' } })
      if (!thread) throw new ErrorWithStatus({ message: 'Không tìm thấy thread.', status: HTTP_STATUS.NOT_FOUND })
      if (thread.locked && !isAdmin) {
        throw new ErrorWithStatus({ message: 'Thread đã bị khóa.', status: HTTP_STATUS.FORBIDDEN })
      }
    }

    const content = params.content?.trim() || ''
    const imageUrl = params.imageUrl?.trim() || ''
    if (!content && !imageUrl) {
      throw new ErrorWithStatus({ message: 'Bài viết phải có nội dung hoặc ảnh.', status: HTTP_STATUS.BAD_REQUEST })
    }

    const moderation = await this.moderateCommunityContent(content)
    const shouldAutoHide = moderation.shouldAutoHide
    const update: any = {
      content,
      updatedAt: now,
      editedAt: now,
      editedBy: params.userId,
      ...(imageUrl ? { imageUrl } : {}),
      status: shouldAutoHide ? ('hidden' as MessageStatus) : message.status,
      moderated: {
        ...(message.moderated || {}),
        autoHidden: shouldAutoHide,
        at: now,
        severity: moderation.severity,
        categories: moderation.categories,
        confidence: moderation.confidence,
        reasons: moderation.reasons,
        ...(moderation.ai ? { ai: moderation.ai } : {})
      }
    }

    const updated = await databaseService.communityMessages.findOneAndUpdate(
      { _id: params.messageId },
      { $set: update, ...(!imageUrl ? { $unset: { imageUrl: '' } } : {}) },
      { returnDocument: 'after' }
    )

    if (message.isThreadStarter && message.threadId) {
      await databaseService.communityThreads.updateOne(
        { _id: message.threadId },
        {
          $set: {
            content,
            updatedAt: now,
            ...(shouldAutoHide ? { status: 'hidden' as ThreadStatus } : {}),
            ...(imageUrl ? { imageUrl } : {})
          },
          ...(!imageUrl ? { $unset: { imageUrl: '' } } : {})
        }
      )
    }

    if (moderation.categories.length > 0 && moderation.severity !== 'low') {
      const finding = await databaseService.moderationFindings.findOne({ messageId: params.messageId })
      if (finding) {
        await databaseService.moderationFindings.updateOne(
          { _id: finding._id },
          {
            $set: {
              status: 'open' as FindingStatus,
              severity: moderation.severity,
              categories: moderation.categories,
              confidence: moderation.confidence,
              reasons: moderation.reasons,
              ...(moderation.ai ? { ai: moderation.ai } : {}),
              updatedAt: now
            }
          }
        )
        emitToAdmins('community:moderation:queued', { findingId: finding._id, roomId: message.roomId, messageId: params.messageId })
      } else {
        const findingInsert = await databaseService.moderationFindings.insertOne({
          roomId: message.roomId,
          messageId: params.messageId,
          senderId: message.senderId,
          trigger: moderation.trigger,
          status: 'open' as FindingStatus,
          severity: moderation.severity,
          categories: moderation.categories,
          confidence: moderation.confidence,
          reasons: moderation.reasons,
          ...(moderation.ai ? { ai: moderation.ai } : {}),
          reportCount: 0,
          createdAt: now,
          updatedAt: now
        } as any)
        await databaseService.communityMessages.updateOne(
          { _id: params.messageId },
          { $set: { 'moderated.findingId': findingInsert.insertedId } }
        )
        emitToAdmins('community:moderation:queued', {
          findingId: findingInsert.insertedId,
          roomId: message.roomId,
          messageId: params.messageId
        })
      }
    }

    const messageWithSender = updated ? await this.attachMessageSender(updated) : updated
    emitCommunity('community:message:updated', message.roomId as ObjectId, messageWithSender)
    return { message: messageWithSender, moderation }
  }

  async deleteMessage(params: { messageId: ObjectId; userId: ObjectId; role?: UserRole }) {
    const message = await databaseService.communityMessages.findOne({ _id: params.messageId, status: { $ne: 'deleted' } })
    if (!message) throw new ErrorWithStatus({ message: 'Không tìm thấy bài viết.', status: HTTP_STATUS.NOT_FOUND })

    await this.requireActiveMember(message.roomId as ObjectId, params.userId)

    const isAdmin = params.role === UserRole.Admin
    const isOwner = (message.senderId as ObjectId).equals(params.userId)
    if (!isAdmin && !isOwner) {
      throw new ErrorWithStatus({ message: 'Bạn không có quyền xóa bài viết này.', status: HTTP_STATUS.FORBIDDEN })
    }
    if (message.isThreadStarter && !isAdmin) {
      throw new ErrorWithStatus({ message: 'Không thể tự xóa bài mở đầu thread. Vui lòng liên hệ điều phối viên.', status: HTTP_STATUS.FORBIDDEN })
    }

    const now = new Date()
    if (!isAdmin && now.getTime() - new Date(message.createdAt).getTime() > MESSAGE_SELF_DELETE_WINDOW_MINUTES * 60 * 1000) {
      throw new ErrorWithStatus({
        message: `Chỉ có thể xóa bài trong ${MESSAGE_SELF_DELETE_WINDOW_MINUTES} phút sau khi đăng.`,
        status: HTTP_STATUS.FORBIDDEN
      })
    }

    const updated = await databaseService.communityMessages.findOneAndUpdate(
      { _id: params.messageId },
      {
        $set: {
          status: 'deleted' as MessageStatus,
          content: '',
          deletedAt: now,
          deletedBy: params.userId,
          updatedAt: now
        },
        $unset: { imageUrl: '', replyToMessageId: '' }
      },
      { returnDocument: 'after' }
    )
    await databaseService.communityReactions.deleteMany({ messageId: params.messageId })

    if (message.threadId && !message.isThreadStarter && message.status === 'visible') {
      const latestReply = await databaseService.communityMessages.findOne(
        { threadId: message.threadId, isThreadStarter: { $ne: true }, status: 'visible' as MessageStatus },
        { sort: { createdAt: -1 } }
      )
      await databaseService.communityThreads.updateOne(
        { _id: message.threadId },
        {
          $set: { updatedAt: now, lastReplyAt: latestReply?.createdAt || now, lastReplyId: latestReply?._id || null },
          $inc: { replyCount: -1 }
        }
      )
    }

    emitCommunity('community:message:deleted', message.roomId as ObjectId, updated)
    return { message: updated }
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

  async listMessages(params: { roomId: ObjectId; userId: ObjectId; page: number; limit: number; q?: string; videoEventId?: ObjectId; role?: UserRole }) {
    if (params.videoEventId) {
      await communityVideoEventAccessService.assertCanSubscribeRealtime(params.videoEventId, {
        userId: params.userId,
        role: params.role
      })
    } else {
      await this.requireActiveMember(params.roomId, params.userId)
    }

    const skip = (params.page - 1) * params.limit
    const search = params.q?.trim()
    const query: any = {
      roomId: params.roomId,
      $or: [{ status: 'visible' as MessageStatus }, { status: 'hidden' as MessageStatus, senderId: params.userId }]
    }
    query.videoEventId = params.videoEventId || { $exists: false }
    if (search) {
      query.content = new RegExp(escapeRegex(search), 'i')
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
            $lookup: {
              from: process.env.DB_COMMUNITY_MESSAGES_COLLECTION || 'communityMessages',
              localField: 'replyToMessageId',
              foreignField: '_id',
              as: 'replyTo'
            }
          },
          { $unwind: { path: '$replyTo', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: process.env.USERS_COLLECTION || 'users',
              localField: 'replyTo.senderId',
              foreignField: '_id',
              as: 'replyToSender'
            }
          },
          { $unwind: { path: '$replyToSender', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              roomId: 1,
              videoEventId: 1,
              senderId: 1,
              content: 1,
              imageUrl: 1,
              replyToMessageId: 1,
              status: 1,
              createdAt: 1,
              updatedAt: 1,
              moderated: 1,
              sender: { _id: 1, firstName: 1, lastName: 1, email: 1, avatar: 1, role: 1 },
              replyTo: {
                $cond: [
                  { $ifNull: ['$replyTo._id', false] },
                  {
                    _id: '$replyTo._id',
                    roomId: '$replyTo.roomId',
                    senderId: '$replyTo.senderId',
                    content: '$replyTo.content',
                    imageUrl: '$replyTo.imageUrl',
                    status: '$replyTo.status',
                    createdAt: '$replyTo.createdAt',
                    sender: {
                      _id: '$replyToSender._id',
                      firstName: '$replyToSender.firstName',
                      lastName: '$replyToSender.lastName',
                      email: '$replyToSender.email',
                      avatar: '$replyToSender.avatar',
                      role: '$replyToSender.role'
                    }
                  },
                  null
                ]
              }
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

  async sendVideoEventChatMessage(params: { eventId: ObjectId; userId: ObjectId; role?: UserRole; content?: string }) {
    const content = params.content?.trim() || ''
    if (!content) {
      throw new ErrorWithStatus({ message: 'Tin nhắn không được để trống.', status: HTTP_STATUS.BAD_REQUEST })
    }
    if (content.length > 2000) {
      throw new ErrorWithStatus({ message: 'Nội dung tin nhắn không được vượt quá 2000 ký tự.', status: HTTP_STATUS.BAD_REQUEST })
    }

    const event = await communityVideoEventAccessService.assertCanSubscribeRealtime(params.eventId, {
      userId: params.userId,
      role: params.role
    })

    const now = new Date()
    const messageDoc = {
      roomId: event.roomId as ObjectId,
      videoEventId: params.eventId,
      senderId: params.userId,
      content,
      status: 'visible' as MessageStatus,
      moderated: {
        autoHidden: false,
        at: now,
        severity: 'low' as ModerationSeverity,
        categories: [],
        confidence: 'low' as ModerationConfidence,
        reasons: []
      },
      createdAt: now,
      updatedAt: now
    }

    const insert = await databaseService.communityMessages.insertOne(messageDoc)
    const stored = await databaseService.communityMessages.findOne({ _id: insert.insertedId })
    const messageWithSender = stored ? await this.attachMessageSender(stored) : { ...messageDoc, _id: insert.insertedId }
    emitCommunityVideoEvent('community:message:new', params.eventId, messageWithSender)
    return { message: messageWithSender }
  }

  async sendMessage(params: {
    roomId: ObjectId
    userId: ObjectId
    content?: string
    imageUrl?: string
    replyToMessageId?: ObjectId
    videoEventId?: ObjectId
  }) {
    const member = await this.requireCanChat(params.roomId, params.userId)
    const now = new Date()
    const content = params.content?.trim() || ''
    const imageUrl = params.imageUrl?.trim() || ''
    if (!content && !imageUrl) {
      throw new ErrorWithStatus({ message: 'Tin nhắn phải có nội dung hoặc ảnh.', status: HTTP_STATUS.BAD_REQUEST })
    }

    let replyToMessageId: ObjectId | undefined
    if (params.replyToMessageId) {
      const replyTo = await databaseService.communityMessages.findOne({
        _id: params.replyToMessageId,
        roomId: params.roomId,
        videoEventId: params.videoEventId || { $exists: false },
        status: 'visible' as MessageStatus
      })
      if (!replyTo) {
        throw new ErrorWithStatus({ message: 'Không tìm thấy tin nhắn cần reply.', status: HTTP_STATUS.NOT_FOUND })
      }
      replyToMessageId = params.replyToMessageId
    }

    const moderation = await this.moderateCommunityContent(content)
    const shouldAutoHide = moderation.shouldAutoHide

    const baseMessage: any = {
      roomId: params.roomId,
      ...(params.videoEventId ? { videoEventId: params.videoEventId } : {}),
      senderId: params.userId,
      content,
      ...(imageUrl ? { imageUrl } : {}),
      ...(replyToMessageId ? { replyToMessageId } : {}),
      status: shouldAutoHide ? ('hidden' as MessageStatus) : ('visible' as MessageStatus),
      moderated: {
        autoHidden: shouldAutoHide,
        at: now,
        severity: moderation.severity,
        categories: moderation.categories,
        confidence: moderation.confidence,
        reasons: moderation.reasons,
        ...(moderation.ai ? { ai: moderation.ai } : {})
      },
      createdAt: now,
      updatedAt: now
    }

    const insert = await databaseService.communityMessages.insertOne(baseMessage)
    const messageId = insert.insertedId
    let findingId: ObjectId | undefined

    if (moderation.categories.length > 0 && moderation.severity !== 'low') {
      const findingDoc: any = {
        roomId: params.roomId,
        ...(params.videoEventId ? { videoEventId: params.videoEventId } : {}),
        messageId,
        senderId: params.userId,
        trigger: moderation.trigger,
        status: 'open' as FindingStatus,
        severity: moderation.severity,
        categories: moderation.categories,
        confidence: moderation.confidence,
        reasons: moderation.reasons,
        ...(moderation.ai ? { ai: moderation.ai } : {}),
        reportCount: 0,
        createdAt: now,
        updatedAt: now
      }
      const findingInsert = await databaseService.moderationFindings.insertOne(findingDoc)
      findingId = findingInsert.insertedId
      emitToAdmins('community:moderation:queued', { findingId, roomId: params.roomId, messageId })
    }

    if (findingId) {
      await databaseService.communityMessages.updateOne({ _id: messageId }, { $set: { 'moderated.findingId': findingId } })
    }
    const stored = await databaseService.communityMessages.findOne({ _id: messageId })
    const messageWithSender = stored ? await this.attachMessageSender(stored) : stored

    if (messageWithSender && !moderation.ai) {
      aiModerationService.enqueueMessageReview({ message: messageWithSender, ruleResult: moderation }).catch(() => {})
    }

    if (messageWithSender?.status === 'visible') {
      if (params.videoEventId) emitCommunityVideoEvent('community:message:new', params.videoEventId, messageWithSender)
      else emitCommunity('community:message:new', params.roomId, messageWithSender)
    } else {
      emitToUser('community:message:hidden', params.userId, messageWithSender)
    }

    return { message: messageWithSender, moderation, memberRole: member.role as MemberRole }
  }

  async reportMessage(params: { messageId: ObjectId; reporterId: ObjectId; reason?: string }) {
    const message = await databaseService.communityMessages.findOne({ _id: params.messageId })
    if (!message) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy tin nhắn.', status: HTTP_STATUS.NOT_FOUND })
    }

    await this.requireActiveMember(message.roomId as ObjectId, params.reporterId)

    if ((message.senderId as ObjectId).equals(params.reporterId)) {
      throw new ErrorWithStatus({ message: 'Bạn không thể báo cáo bài viết của chính mình.', status: HTTP_STATUS.BAD_REQUEST })
    }

    const now = new Date()
    const reportReason = params.reason?.trim()
    const findingReason = reportReason ? `Báo cáo người dùng: ${reportReason}` : 'Người dùng báo cáo nội dung.'
    try {
      await databaseService.moderationReports.insertOne({
        roomId: message.roomId as ObjectId,
        messageId: params.messageId,
        reporterId: params.reporterId,
        reason: reportReason,
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
          $addToSet: { categories: 'user_report', reasons: findingReason }
        }
      )
      emitToAdmins('community:moderation:queued', {
        findingId: existing._id,
        roomId: message.roomId,
        messageId: params.messageId
      })
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
      reasons: [findingReason],
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
