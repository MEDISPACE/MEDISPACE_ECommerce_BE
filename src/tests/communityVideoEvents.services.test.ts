import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'
import { UserRole } from '~/constants/enum'

const mockUsers = { findOne: vi.fn() }
const mockCommunityRooms = { findOne: vi.fn(), find: vi.fn() }
const mockCommunityRoomMembers = { findOne: vi.fn(), find: vi.fn(), updateOne: vi.fn() }
const mockCommunityVideoEvents = {
  findOne: vi.fn(),
  insertOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
  updateMany: vi.fn(),
  aggregate: vi.fn(),
  countDocuments: vi.fn(),
  find: vi.fn()
}
const mockCommunityVideoEventRegistrations = {
  findOne: vi.fn(),
  updateOne: vi.fn(),
  updateMany: vi.fn(),
  countDocuments: vi.fn(),
  find: vi.fn()
}
const withTransaction = vi.fn(async (callback: any) => callback(undefined))
const notifyVideoEventReminder = vi.fn()
const createJoinToken = vi.fn()
const getWsUrl = vi.fn(() => 'wss://livekit.test')
const getRoomName = vi.fn((eventId: string) => `medispace-event-${eventId}`)
const listParticipants = vi.fn()
const muteParticipantAudio = vi.fn()
const disableParticipantCamera = vi.fn()
const disableParticipantScreenShare = vi.fn()
const enableParticipantAudio = vi.fn()
const enableParticipantCamera = vi.fn()
const enableParticipantScreenShare = vi.fn()
const removeParticipant = vi.fn()
const emit = vi.fn()

vi.mock('~/services/database.services', () => ({
  default: {
    communityRooms: mockCommunityRooms,
    users: mockUsers,
    communityRoomMembers: mockCommunityRoomMembers,
    communityVideoEvents: mockCommunityVideoEvents,
    communityVideoEventRegistrations: mockCommunityVideoEventRegistrations,
    withTransaction
  }
}))

vi.mock('~/services/livekit.services', () => ({
  default: {
    createJoinToken,
    getWsUrl,
    getRoomName,
    listParticipants,
    muteParticipantAudio,
    disableParticipantCamera,
    disableParticipantScreenShare,
    enableParticipantAudio,
    enableParticipantCamera,
    enableParticipantScreenShare,
    removeParticipant
  }
}))

vi.mock('~/services/notifications.services', () => ({
  default: { notifyVideoEventReminder }
}))

vi.mock('~/sockets/chat.socket', () => ({
  getIO: () => ({ to: () => ({ emit }) })
}))

const { default: communityVideoEventsService } = await import('~/services/communityVideoEvents.services')

function makeEvent(overrides: Record<string, unknown> = {}) {
  const start = new Date(Date.now() + 60 * 60_000)
  return {
    _id: new ObjectId(),
    roomId: new ObjectId(),
    title: 'Medication safety webinar',
    visibility: 'public',
    status: 'scheduled',
    scheduledStartAt: start,
    scheduledEndAt: new Date(start.getTime() + 60 * 60_000),
    hostIds: [],
    registrationRequired: true,
    capacity: 10,
    activeRegistrationCount: 0,
    ...overrides
  }
}

function cursor(items: any[]) {
  return {
    project: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue(items)
  }
}

describe('CommunityVideoEventsService functional rules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AI_MODERATION_ENABLED = 'false'
    mockUsers.findOne.mockResolvedValue({
      firstName: 'Medi',
      lastName: 'Member',
      email: 'member@medispace.local',
      avatar: 'avatar.png'
    })
    mockCommunityRooms.findOne.mockImplementation(async (query: any) => ({ _id: query?._id || new ObjectId(), status: 'active', visibility: 'public' }))
    mockCommunityRooms.find.mockReturnValue(cursor([]))
  })

  it('creates an event only for an active community room and normalizes optional fields', async () => {
    const roomId = new ObjectId()
    const creatorId = new ObjectId()
    mockCommunityRooms.findOne.mockResolvedValueOnce({ _id: roomId, status: 'active' })
    mockCommunityVideoEvents.insertOne.mockResolvedValueOnce({ insertedId: new ObjectId() })

    const event = await communityVideoEventsService.createEvent({
      roomId,
      title: '  Safe antibiotics  ',
      visibility: 'public',
      scheduledStartAt: new Date(Date.now() + 60_000),
      scheduledEndAt: new Date(Date.now() + 3_600_000),
      tags: [' safe ', '', 'antibiotics'],
      materials: [{ title: 'Deck' }],
      createdBy: creatorId
    })

    expect(event.title).toBe('Safe antibiotics')
    expect(event.tags).toEqual(['safe', 'antibiotics'])
    expect(event.activeRegistrationCount).toBe(0)
    expect(mockCommunityVideoEvents.insertOne).toHaveBeenCalled()
  })

  it('rejects event creation when end time is before start time', async () => {
    mockCommunityRooms.findOne.mockResolvedValueOnce({ _id: new ObjectId(), status: 'active' })
    await expect(
      communityVideoEventsService.createEvent({
        roomId: new ObjectId(),
        title: 'Invalid time',
        visibility: 'public',
        scheduledStartAt: new Date(Date.now() + 3_600_000),
        scheduledEndAt: new Date(Date.now() + 60_000),
        createdBy: new ObjectId()
      })
    ).rejects.toMatchObject({ status: 400 })
  })

  it('registerForEvent uses atomic capacity guard and emits user registration', async () => {
    const userId = new ObjectId()
    const event = makeEvent({ capacity: 1, activeRegistrationCount: 0 })
    mockCommunityVideoEvents.findOne.mockResolvedValue(event)
    mockCommunityVideoEventRegistrations.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ eventId: event._id, userId, status: 'registered' })
    mockCommunityVideoEvents.updateOne.mockResolvedValueOnce({ modifiedCount: 1 })
    mockCommunityVideoEventRegistrations.updateOne.mockResolvedValueOnce({ upsertedCount: 1 })

    const registration = await communityVideoEventsService.registerForEvent(event._id, userId)

    expect(registration?.status).toBe('registered')
    expect(mockCommunityVideoEvents.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: event._id, $or: expect.any(Array) }),
      expect.objectContaining({ $inc: { activeRegistrationCount: 1 } }),
      expect.any(Object)
    )
    expect(emit).toHaveBeenCalled()
  })

  it('registerForEvent returns conflict when capacity guard cannot increment', async () => {
    const event = makeEvent({ capacity: 1, activeRegistrationCount: 1 })
    mockCommunityVideoEvents.findOne.mockResolvedValue(event)
    mockCommunityVideoEventRegistrations.findOne.mockResolvedValueOnce(null)
    mockCommunityVideoEvents.updateOne.mockResolvedValueOnce({ modifiedCount: 0 })

    await expect(communityVideoEventsService.registerForEvent(event._id, new ObjectId())).rejects.toMatchObject({
      status: 409
    })
  })

  it('joinEvent allows scheduled status and returns LiveKit payload with account display name', async () => {
    const userId = new ObjectId()
    const event = makeEvent({ status: 'scheduled' })
    mockCommunityVideoEvents.findOne.mockResolvedValue(event)
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(null)
    mockCommunityRoomMembers.updateOne.mockResolvedValueOnce({ modifiedCount: 1, upsertedCount: 1 })
    mockCommunityVideoEventRegistrations.findOne.mockResolvedValue({ eventId: event._id, userId, status: 'registered' })
    mockCommunityVideoEventRegistrations.updateOne.mockResolvedValue({ modifiedCount: 1 })
    createJoinToken.mockResolvedValueOnce('mock-token')

    const payload = await communityVideoEventsService.joinEvent(event._id, userId)

    expect(payload.token).toBe('mock-token')
    expect(payload.wsUrl).toBe('wss://livekit.test')
    expect(createJoinToken).toHaveBeenCalledWith({
      eventId: event._id.toString(),
      userId: userId.toString(),
      displayName: 'Medi Member',
      avatar: 'avatar.png',
      isHost: false
    })
  })

  it('joinEvent allows attendee to enter by link without prior registration', async () => {
    const userId = new ObjectId()
    const event = makeEvent({ status: 'scheduled', registrationRequired: true })
    mockCommunityVideoEvents.findOne.mockResolvedValue(event)
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(null)
    mockCommunityRoomMembers.updateOne.mockResolvedValueOnce({ modifiedCount: 1, upsertedCount: 1 })
    mockCommunityVideoEventRegistrations.findOne.mockResolvedValue(null)
    mockCommunityVideoEvents.updateOne.mockResolvedValueOnce({ modifiedCount: 1 })
    mockCommunityVideoEventRegistrations.updateOne.mockResolvedValue({ modifiedCount: 1, upsertedCount: 1 })
    createJoinToken.mockResolvedValueOnce('mock-token')

    const payload = await communityVideoEventsService.joinEvent(event._id, userId)

    expect(payload.token).toBe('mock-token')
    expect(mockCommunityVideoEventRegistrations.updateOne).toHaveBeenCalledWith(
      { eventId: event._id, userId },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'attended' }) }),
      expect.objectContaining({ upsert: true })
    )
  })

  it('joinEvent blocks scheduled meetings after their end time', async () => {
    const userId = new ObjectId()
    const event = makeEvent({
      status: 'scheduled',
      scheduledStartAt: new Date(Date.now() - 2 * 60 * 60_000),
      scheduledEndAt: new Date(Date.now() - 60 * 60_000)
    })
    mockCommunityVideoEvents.findOne.mockResolvedValue(event)

    await expect(communityVideoEventsService.joinEvent(event._id, userId)).rejects.toMatchObject({ status: 400 })
    expect(createJoinToken).not.toHaveBeenCalled()
  })

  it('joinEvent blocks participants removed from the live meeting', async () => {
    const userId = new ObjectId()
    const event = makeEvent({ status: 'live' })
    mockCommunityVideoEvents.findOne.mockResolvedValue(event)
    mockCommunityVideoEventRegistrations.findOne.mockResolvedValue({ eventId: event._id, userId, status: 'removed' })

    await expect(communityVideoEventsService.joinEvent(event._id, userId)).rejects.toMatchObject({ status: 403 })
    expect(createJoinToken).not.toHaveBeenCalled()
  })

  it('listEvents limits visible events by public rooms and member private rooms', async () => {
    const publicRoomId = new ObjectId()
    mockCommunityVideoEvents.aggregate.mockReturnValue(cursor([]))
    mockCommunityVideoEvents.countDocuments.mockResolvedValue(0)
    mockCommunityRooms.find.mockReturnValue(cursor([{ _id: publicRoomId }]))

    await communityVideoEventsService.listEvents({ page: 1, limit: 10 })
    const anonMatch = mockCommunityVideoEvents.aggregate.mock.calls[0][0][0].$match
    expect(anonMatch.roomId).toEqual({ $in: [publicRoomId] })

    const privateRoomId = new ObjectId()
    mockCommunityRoomMembers.find.mockReturnValueOnce(cursor([{ roomId: privateRoomId }]))
    await communityVideoEventsService.listEvents({
      viewer: { userId: new ObjectId(), role: UserRole.Customer },
      page: 1,
      limit: 10
    })
    const authedMatch = mockCommunityVideoEvents.aggregate.mock.calls[1][0][0].$match
    expect(authedMatch.roomId.$in.map((id: ObjectId) => id.toString())).toEqual([
      publicRoomId.toString(),
      privateRoomId.toString()
    ])
  })

  it('listEvents exposes past scheduled meetings as ended', async () => {
    const event = makeEvent({
      status: 'scheduled',
      scheduledStartAt: new Date(Date.now() - 2 * 60 * 60_000),
      scheduledEndAt: new Date(Date.now() - 60 * 60_000)
    })
    mockCommunityVideoEvents.aggregate.mockReturnValue(cursor([event]))
    mockCommunityVideoEvents.countDocuments.mockResolvedValue(1)

    const result = await communityVideoEventsService.listEvents({ viewer: { userId: new ObjectId(), role: UserRole.Admin }, page: 1, limit: 10 })

    expect(result.items[0]).toMatchObject({ status: 'ended', endedAt: event.scheduledEndAt })
  })

  it('listEvents exposes started scheduled meetings as live until their end time', async () => {
    const event = makeEvent({
      status: 'scheduled',
      scheduledStartAt: new Date(Date.now() - 10 * 60_000),
      scheduledEndAt: new Date(Date.now() + 50 * 60_000)
    })
    mockCommunityVideoEvents.aggregate.mockReturnValue(cursor([event]))
    mockCommunityVideoEvents.countDocuments.mockResolvedValue(1)

    const result = await communityVideoEventsService.listEvents({ viewer: { userId: new ObjectId(), role: UserRole.Admin }, page: 1, limit: 10 })

    expect(result.items[0]).toMatchObject({ status: 'live' })
  })

  it('listEvents can sort newest created events first for admin lists', async () => {
    mockCommunityVideoEvents.aggregate.mockReturnValue(cursor([]))
    mockCommunityVideoEvents.countDocuments.mockResolvedValue(0)

    await communityVideoEventsService.listEvents({
      viewer: { userId: new ObjectId(), role: UserRole.Admin },
      page: 1,
      limit: 10,
      sort: 'created_desc'
    })

    const sortStage = mockCommunityVideoEvents.aggregate.mock.calls[0][0][1]
    expect(sortStage).toEqual({ $sort: { createdAt: -1, scheduledStartAt: -1 } })
  })

  it('sendDueReminders processes registration batches and marks event sentinel only when sends succeed', async () => {
    const event = makeEvent({
      scheduledStartAt: new Date(Date.now() + 15 * 60_000),
      reminders: { fifteenMinutesSentAt: null }
    })
    const registrations = Array.from({ length: 3 }, () => ({ _id: new ObjectId(), userId: new ObjectId() }))
    mockCommunityVideoEvents.find.mockReturnValueOnce(cursor([event]))
    mockCommunityVideoEventRegistrations.find.mockReturnValueOnce(cursor(registrations)).mockReturnValueOnce(cursor([]))
    notifyVideoEventReminder.mockResolvedValue(undefined)
    mockCommunityVideoEventRegistrations.updateMany.mockResolvedValue({ modifiedCount: 3 })
    mockCommunityVideoEvents.updateOne.mockResolvedValue({ modifiedCount: 1 })

    const result = await communityVideoEventsService.sendDueReminders()

    expect(result.sentCount).toBe(3)
    expect(result.failedCount).toBe(0)
    expect(mockCommunityVideoEvents.updateOne).toHaveBeenCalledWith(
      { _id: event._id },
      expect.objectContaining({ $set: expect.objectContaining({ 'reminders.fifteenMinutesSentAt': expect.any(Date) }) })
    )
  })

  it('lists LiveKit participants only when requester can manage the event', async () => {
    const adminId = new ObjectId()
    const event = makeEvent({ status: 'live' })
    mockCommunityVideoEvents.findOne.mockResolvedValue(event)
    listParticipants.mockResolvedValueOnce([{ identity: adminId.toString(), name: 'Admin', tracks: [] }])

    const result = await communityVideoEventsService.listLiveParticipants(event._id, {
      userId: adminId,
      role: UserRole.Admin
    })

    expect(result.roomName).toBe(`medispace-event-${event._id.toString()}`)
    expect(result.participants).toHaveLength(1)
    expect(listParticipants).toHaveBeenCalledWith(event._id.toString())

    await expect(
      communityVideoEventsService.listLiveParticipants(event._id, { userId: new ObjectId(), role: UserRole.Customer })
    ).rejects.toMatchObject({ status: 403 })
  })

  it('moderates LiveKit participants only after event manage permission passes', async () => {
    const adminId = new ObjectId()
    const targetUserId = new ObjectId()
    const event = makeEvent({ status: 'live' })
    mockCommunityVideoEvents.findOne.mockResolvedValue(event)
    muteParticipantAudio.mockResolvedValueOnce({
      eventId: event._id.toString(),
      userId: targetUserId.toString(),
      action: 'muted',
      audioPublishAllowed: false,
      track: { sid: 'TR_AUDIO', source: 'microphone', muted: true }
    })
    removeParticipant.mockResolvedValueOnce({
      eventId: event._id.toString(),
      userId: targetUserId.toString(),
      action: 'kicked'
    })
    disableParticipantCamera.mockResolvedValueOnce({
      eventId: event._id.toString(),
      userId: targetUserId.toString(),
      action: 'camera-disabled',
      cameraPublishAllowed: false
    })
    disableParticipantScreenShare.mockResolvedValueOnce({
      eventId: event._id.toString(),
      userId: targetUserId.toString(),
      action: 'screen-share-disabled',
      screenSharePublishAllowed: false
    })
    enableParticipantAudio.mockResolvedValueOnce({
      eventId: event._id.toString(),
      userId: targetUserId.toString(),
      action: 'audio-enabled',
      audioPublishAllowed: true
    })
    enableParticipantCamera.mockResolvedValueOnce({
      eventId: event._id.toString(),
      userId: targetUserId.toString(),
      action: 'camera-enabled',
      cameraPublishAllowed: true
    })
    enableParticipantScreenShare.mockResolvedValueOnce({
      eventId: event._id.toString(),
      userId: targetUserId.toString(),
      action: 'screen-share-enabled',
      screenSharePublishAllowed: true
    })

    await expect(
      communityVideoEventsService.muteLiveParticipantAudio(event._id, targetUserId, {
        userId: adminId,
        role: UserRole.Admin
      })
    ).resolves.toMatchObject({ action: 'muted', audioPublishAllowed: false })
    await expect(
      communityVideoEventsService.disableLiveParticipantCamera(event._id, targetUserId, {
        userId: adminId,
        role: UserRole.Admin
      })
    ).resolves.toMatchObject({ action: 'camera-disabled', cameraPublishAllowed: false })
    await expect(
      communityVideoEventsService.disableLiveParticipantScreenShare(event._id, targetUserId, {
        userId: adminId,
        role: UserRole.Admin
      })
    ).resolves.toMatchObject({ action: 'screen-share-disabled', screenSharePublishAllowed: false })
    await expect(
      communityVideoEventsService.enableLiveParticipantAudio(event._id, targetUserId, {
        userId: adminId,
        role: UserRole.Admin
      })
    ).resolves.toMatchObject({ action: 'audio-enabled', audioPublishAllowed: true })
    await expect(
      communityVideoEventsService.enableLiveParticipantCamera(event._id, targetUserId, {
        userId: adminId,
        role: UserRole.Admin
      })
    ).resolves.toMatchObject({ action: 'camera-enabled', cameraPublishAllowed: true })
    await expect(
      communityVideoEventsService.enableLiveParticipantScreenShare(event._id, targetUserId, {
        userId: adminId,
        role: UserRole.Admin
      })
    ).resolves.toMatchObject({ action: 'screen-share-enabled', screenSharePublishAllowed: true })
    await expect(
      communityVideoEventsService.kickLiveParticipant(event._id, targetUserId, {
        userId: adminId,
        role: UserRole.Admin
      })
    ).resolves.toMatchObject({ action: 'kicked' })

    expect(muteParticipantAudio).toHaveBeenCalledWith(event._id.toString(), targetUserId.toString())
    expect(disableParticipantCamera).toHaveBeenCalledWith(event._id.toString(), targetUserId.toString())
    expect(disableParticipantScreenShare).toHaveBeenCalledWith(event._id.toString(), targetUserId.toString())
    expect(enableParticipantAudio).toHaveBeenCalledWith(event._id.toString(), targetUserId.toString())
    expect(enableParticipantCamera).toHaveBeenCalledWith(event._id.toString(), targetUserId.toString())
    expect(enableParticipantScreenShare).toHaveBeenCalledWith(event._id.toString(), targetUserId.toString())
    expect(removeParticipant).toHaveBeenCalledWith(event._id.toString(), targetUserId.toString())
  })
})
