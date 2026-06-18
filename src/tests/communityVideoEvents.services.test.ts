import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'
import { UserRole } from '~/constants/enum'

const mockCommunityRooms = { findOne: vi.fn() }
const mockCommunityRoomMembers = { findOne: vi.fn(), find: vi.fn() }
const mockCommunityVideoEvents = {
  findOne: vi.fn(),
  insertOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
  updateMany: vi.fn(),
  aggregate: vi.fn(),
  countDocuments: vi.fn(),
  find: vi.fn(),
}
const mockCommunityVideoEventRegistrations = {
  findOne: vi.fn(),
  updateOne: vi.fn(),
  updateMany: vi.fn(),
  countDocuments: vi.fn(),
  find: vi.fn(),
}
const withTransaction = vi.fn(async (callback: any) => callback(undefined))
const notifyVideoEventReminder = vi.fn()
const createJoinToken = vi.fn()
const getWsUrl = vi.fn(() => 'wss://livekit.test')
const emit = vi.fn()

vi.mock('~/services/database.services', () => ({
  default: {
    communityRooms: mockCommunityRooms,
    communityRoomMembers: mockCommunityRoomMembers,
    communityVideoEvents: mockCommunityVideoEvents,
    communityVideoEventRegistrations: mockCommunityVideoEventRegistrations,
    withTransaction,
  },
}))

vi.mock('~/services/livekit.services', () => ({
  default: { createJoinToken, getWsUrl },
}))

vi.mock('~/services/notifications.services', () => ({
  default: { notifyVideoEventReminder },
}))

vi.mock('~/sockets/chat.socket', () => ({
  getIO: () => ({ to: () => ({ emit }) }),
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
    ...overrides,
  }
}

function cursor(items: any[]) {
  return {
    project: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue(items),
  }
}

describe('CommunityVideoEventsService functional rules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AI_MODERATION_ENABLED = 'false'
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
      createdBy: creatorId,
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
        createdBy: new ObjectId(),
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('registerForEvent uses atomic capacity guard and emits user registration', async () => {
    const userId = new ObjectId()
    const event = makeEvent({ capacity: 1, activeRegistrationCount: 0 })
    mockCommunityVideoEvents.findOne.mockResolvedValue(event)
    mockCommunityVideoEventRegistrations.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ eventId: event._id, userId, status: 'registered' })
    mockCommunityVideoEvents.updateOne.mockResolvedValueOnce({ modifiedCount: 1 })
    mockCommunityVideoEventRegistrations.updateOne.mockResolvedValueOnce({ upsertedCount: 1 })

    const registration = await communityVideoEventsService.registerForEvent(event._id, userId)

    expect(registration?.status).toBe('registered')
    expect(mockCommunityVideoEvents.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: event._id, $or: expect.any(Array) }),
      expect.objectContaining({ $inc: { activeRegistrationCount: 1 } }),
      expect.any(Object),
    )
    expect(emit).toHaveBeenCalled()
  })

  it('registerForEvent returns conflict when capacity guard cannot increment', async () => {
    const event = makeEvent({ capacity: 1, activeRegistrationCount: 1 })
    mockCommunityVideoEvents.findOne.mockResolvedValue(event)
    mockCommunityVideoEventRegistrations.findOne.mockResolvedValueOnce(null)
    mockCommunityVideoEvents.updateOne.mockResolvedValueOnce({ modifiedCount: 0 })

    await expect(communityVideoEventsService.registerForEvent(event._id, new ObjectId())).rejects.toMatchObject({ status: 409 })
  })

  it('joinEvent requires live status and returns LiveKit payload for registered user', async () => {
    const userId = new ObjectId()
    const event = makeEvent({ status: 'live' })
    mockCommunityVideoEvents.findOne.mockResolvedValue(event)
    mockCommunityVideoEventRegistrations.findOne.mockResolvedValue({ eventId: event._id, userId, status: 'registered' })
    mockCommunityVideoEventRegistrations.updateOne.mockResolvedValue({ modifiedCount: 1 })
    createJoinToken.mockResolvedValueOnce('mock-token')

    const payload = await communityVideoEventsService.joinEvent(event._id, userId)

    expect(payload.token).toBe('mock-token')
    expect(payload.wsUrl).toBe('wss://livekit.test')
    expect(createJoinToken).toHaveBeenCalledWith({ eventId: event._id.toString(), userId: userId.toString(), isHost: false })
  })

  it('joinEvent blocks unregistered attendee when registration is required', async () => {
    const event = makeEvent({ status: 'live', registrationRequired: true })
    mockCommunityVideoEvents.findOne.mockResolvedValue(event)
    mockCommunityVideoEventRegistrations.findOne.mockResolvedValue(null)

    await expect(communityVideoEventsService.joinEvent(event._id, new ObjectId())).rejects.toMatchObject({ status: 403 })
  })

  it('listEvents personalizes private visibility for authenticated room members without empty $and for anonymous users', async () => {
    mockCommunityVideoEvents.aggregate.mockReturnValue(cursor([]))
    mockCommunityVideoEvents.countDocuments.mockResolvedValue(0)

    await communityVideoEventsService.listEvents({ page: 1, limit: 10 })
    const anonMatch = mockCommunityVideoEvents.aggregate.mock.calls[0][0][0].$match
    expect(anonMatch.visibility).toBe('public')
    expect(anonMatch.$and).toBeUndefined()

    const roomId = new ObjectId()
    mockCommunityRoomMembers.find.mockReturnValueOnce(cursor([{ roomId }]))
    await communityVideoEventsService.listEvents({ viewer: { userId: new ObjectId(), role: UserRole.Customer }, page: 1, limit: 10 })
    const authedMatch = mockCommunityVideoEvents.aggregate.mock.calls[1][0][0].$match
    expect(authedMatch.$and[0].$or).toContainEqual({ visibility: 'public' })
  })

  it('sendDueReminders processes registration batches and marks event sentinel only when sends succeed', async () => {
    const event = makeEvent({ scheduledStartAt: new Date(Date.now() + 15 * 60_000), reminders: { fifteenMinutesSentAt: null } })
    const registrations = Array.from({ length: 3 }, () => ({ _id: new ObjectId(), userId: new ObjectId() }))
    mockCommunityVideoEvents.find.mockReturnValueOnce(cursor([event]))
    mockCommunityVideoEventRegistrations.find
      .mockReturnValueOnce(cursor(registrations))
      .mockReturnValueOnce(cursor([]))
    notifyVideoEventReminder.mockResolvedValue(undefined)
    mockCommunityVideoEventRegistrations.updateMany.mockResolvedValue({ modifiedCount: 3 })
    mockCommunityVideoEvents.updateOne.mockResolvedValue({ modifiedCount: 1 })

    const result = await communityVideoEventsService.sendDueReminders()

    expect(result.sentCount).toBe(3)
    expect(result.failedCount).toBe(0)
    expect(mockCommunityVideoEvents.updateOne).toHaveBeenCalledWith(
      { _id: event._id },
      expect.objectContaining({ $set: expect.objectContaining({ 'reminders.fifteenMinutesSentAt': expect.any(Date) }) }),
    )
  })
})
