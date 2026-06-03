import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'

const mockCommunityRooms = {
  findOne: vi.fn(),
  insertOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  aggregate: vi.fn()
}

const mockCommunityRoomMembers = {
  findOne: vi.fn(),
  updateOne: vi.fn(),
  find: vi.fn(),
  aggregate: vi.fn(),
  countDocuments: vi.fn()
}

const mockCommunityMessages = {
  findOne: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
  aggregate: vi.fn(),
  countDocuments: vi.fn()
}

const mockModerationFindings = {
  findOne: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn()
}

const mockModerationReports = {
  findOne: vi.fn(),
  insertOne: vi.fn()
}

const mockModerationAppeals = {
  findOne: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
  aggregate: vi.fn(),
  countDocuments: vi.fn()
}

vi.mock('~/services/database.services', () => ({
  default: {
    communityRooms: mockCommunityRooms,
    communityRoomMembers: mockCommunityRoomMembers,
    communityMessages: mockCommunityMessages,
    moderationFindings: mockModerationFindings,
    moderationReports: mockModerationReports,
    moderationAppeals: mockModerationAppeals,
    users: { findOne: vi.fn() }
  }
}))

vi.mock('~/sockets/chat.socket', () => ({
  getIO: () => ({ to: () => ({ emit: vi.fn() }) })
}))

const { default: communityService } = await import('~/services/community.services')
const { default: moderationService } = await import('~/services/moderation.services')

describe('CommunityService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists only public active rooms for anonymous users', async () => {
    const toArray = vi.fn().mockResolvedValue([])
    mockCommunityRooms.aggregate.mockReturnValue({ toArray })

    await communityService.listRooms()

    const pipeline = mockCommunityRooms.aggregate.mock.calls[0][0]
    expect(pipeline[0].$match).toEqual({ status: 'active', visibility: 'public' })
  })

  it('includes pending and banned private rooms in the authenticated room list', async () => {
    const userId = new ObjectId()
    const roomId = new ObjectId()
    const toArray = vi.fn().mockResolvedValue([{ roomId }])
    const project = vi.fn().mockReturnValue({ toArray })
    mockCommunityRoomMembers.find.mockReturnValue({ project })
    mockCommunityRooms.aggregate.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) })

    await communityService.listRooms({ includePrivate: true, viewer: { userId } })

    expect(mockCommunityRoomMembers.find).toHaveBeenCalledWith({
      userId,
      status: { $in: ['active', 'invited', 'pending', 'banned'] }
    })
  })

  it('blocks direct join to private room without invite', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    mockCommunityRooms.findOne.mockResolvedValueOnce({ _id: roomId, visibility: 'private', status: 'active' })
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(null)

    await expect(communityService.joinRoom(roomId, userId)).rejects.toMatchObject({ status: 403 })
    expect(mockCommunityRoomMembers.updateOne).not.toHaveBeenCalled()
  })

  it('allows invited user to join private room', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    mockCommunityRooms.findOne.mockResolvedValueOnce({ _id: roomId, visibility: 'private', status: 'active' })
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce({ roomId, userId, status: 'invited' })
    mockCommunityRoomMembers.updateOne.mockResolvedValueOnce({ modifiedCount: 1 })

    const result = await communityService.joinRoom(roomId, userId)

    expect(result.status).toBe('active')
    expect(mockCommunityRoomMembers.updateOne).toHaveBeenCalledWith(
      { roomId, userId },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'active' }) }),
      { upsert: true }
    )
  })

  it('prevents duplicate reports for the same message by the same user', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    const messageId = new ObjectId()
    mockCommunityMessages.findOne.mockResolvedValueOnce({ _id: messageId, roomId, senderId: new ObjectId() })
    mockCommunityRooms.findOne.mockResolvedValueOnce({ _id: roomId, visibility: 'public', status: 'active' })
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce({ roomId, userId, status: 'active' })
    mockModerationReports.findOne.mockResolvedValueOnce({ _id: new ObjectId(), messageId, reporterId: userId })

    await expect(
      communityService.reportMessage({ messageId, reporterId: userId, reason: 'duplicate' })
    ).rejects.toMatchObject({ status: 409 })
  })

  it('prevents duplicate open moderation appeals', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    mockCommunityRooms.findOne.mockResolvedValueOnce({ _id: roomId, status: 'active' })
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce({ roomId, userId, status: 'banned' })
    mockModerationAppeals.findOne.mockResolvedValueOnce({ _id: new ObjectId(), roomId, userId, type: 'ban', status: 'open' })

    await expect(
      moderationService.createAppeal({ roomId, userId, type: 'ban', reason: 'Please review this ban' })
    ).rejects.toMatchObject({ status: 409 })
  })
})
