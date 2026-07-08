import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'

// ── Mock DB collections ──────────────────────────────────────────────────────

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

vi.mock('~/services/aiModeration.services', () => ({
  default: {
    getConfig: vi.fn(() => ({
      autoEnabled: false,
      configured: false,
      mockEnabled: false,
      baseUrl: '',
      model: '',
      apiKey: undefined,
      timeoutMs: 12000,
      maxAttempts: 3,
      workerIntervalMs: 5000,
      autoHideConfidence: 0.78,
      reviewConfidence: 0.55
    })),
    reviewText: vi.fn(),
    enqueueMessageReview: vi.fn().mockResolvedValue(null)
  }
}))

const { default: aiModerationService } = await import('~/services/aiModeration.services')
const { default: communityService } = await import('~/services/community.services')
const { default: moderationService } = await import('~/services/moderation.services')

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRoom(overrides: Record<string, unknown> = {}) {
  return { _id: new ObjectId(), visibility: 'public', status: 'active', ...overrides }
}

function makeMember(roomId: ObjectId, userId: ObjectId, overrides: Record<string, unknown> = {}) {
  return { roomId, userId, status: 'active', role: 'member', ...overrides }
}

// ────────────────────────────────────────────────────────────────────────────
// CommunityService
// ────────────────────────────────────────────────────────────────────────────

describe('CommunityService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Room listing ────────────────────────────────────────────────────────────

  it('lists only public active rooms for anonymous users', async () => {
    const toArray = vi.fn().mockResolvedValue([])
    mockCommunityRooms.aggregate.mockReturnValue({ toArray })

    await communityService.listRooms()

    const pipeline = mockCommunityRooms.aggregate.mock.calls[0][0]
    expect(pipeline[0].$match).toEqual({ status: 'active', visibility: 'public' })
  })

  it('excludes video event chat messages from room latest activity stats', async () => {
    const toArray = vi.fn().mockResolvedValue([])
    mockCommunityRooms.aggregate.mockReturnValue({ toArray })

    await communityService.listRooms()

    const pipeline = mockCommunityRooms.aggregate.mock.calls[0][0]
    const messageStatsLookup = pipeline.find((stage: any) => stage.$lookup?.as === 'messageStats')
    const messageMatch = messageStatsLookup.$lookup.pipeline[0].$match.$expr.$and
    expect(messageMatch).toContainEqual({ $eq: [{ $type: '$videoEventId' }, 'missing'] })
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

  // ── Join room ───────────────────────────────────────────────────────────────

  it('blocks direct join to private room without invite', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    mockCommunityRooms.findOne.mockResolvedValueOnce(makeRoom({ _id: roomId, visibility: 'private' }))
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(null)

    await expect(communityService.joinRoom(roomId, userId)).rejects.toMatchObject({ status: 403 })
    expect(mockCommunityRoomMembers.updateOne).not.toHaveBeenCalled()
  })

  it('allows invited user to join private room', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    mockCommunityRooms.findOne.mockResolvedValueOnce(makeRoom({ _id: roomId, visibility: 'private' }))
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(makeMember(roomId, userId, { status: 'invited' }))
    mockCommunityRoomMembers.updateOne.mockResolvedValueOnce({ modifiedCount: 1 })

    const result = await communityService.joinRoom(roomId, userId)

    expect(result.status).toBe('active')
    expect(mockCommunityRoomMembers.updateOne).toHaveBeenCalledWith(
      { roomId, userId },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'active' }) }),
      { upsert: true }
    )
  })

  it('banned user cannot join room', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    mockCommunityRooms.findOne.mockResolvedValueOnce(makeRoom({ _id: roomId, visibility: 'public' }))
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(makeMember(roomId, userId, { status: 'banned' }))

    await expect(communityService.joinRoom(roomId, userId)).rejects.toMatchObject({ status: 403 })
  })

  // ── Leave room ──────────────────────────────────────────────────────────────

  it('active member can leave room – status becomes left', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    mockCommunityRooms.findOne.mockResolvedValueOnce(makeRoom({ _id: roomId }))
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(makeMember(roomId, userId))
    mockCommunityRoomMembers.updateOne.mockResolvedValueOnce({ modifiedCount: 1 })

    const result = await communityService.leaveRoom(roomId, userId)
    expect(result.status).toBe('left')
    expect(mockCommunityRoomMembers.updateOne).toHaveBeenCalledWith(
      { roomId, userId },
      { $set: expect.objectContaining({ status: 'left' }) }
    )
  })

  it('non-member cannot leave room', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    mockCommunityRooms.findOne.mockResolvedValueOnce(makeRoom({ _id: roomId }))
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(null)

    await expect(communityService.leaveRoom(roomId, userId)).rejects.toMatchObject({ status: 403 })
  })

  // ── Mark room read ──────────────────────────────────────────────────────────

  it('markRoomRead updates lastReadAt for the member', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    mockCommunityRooms.findOne.mockResolvedValueOnce(makeRoom({ _id: roomId }))
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(makeMember(roomId, userId))
    mockCommunityRoomMembers.updateOne.mockResolvedValueOnce({ modifiedCount: 1 })

    const result = await communityService.markRoomRead(roomId, userId)

    expect(result.roomId).toEqual(roomId)
    expect(result.lastReadAt).toBeInstanceOf(Date)
    expect(mockCommunityRoomMembers.updateOne).toHaveBeenCalledWith(
      { roomId, userId },
      { $set: expect.objectContaining({ lastReadAt: expect.any(Date) }) }
    )
  })

  // ── Send message ────────────────────────────────────────────────────────────

  it('sends clean message – status=visible, no finding created', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    const messageId = new ObjectId()
    mockCommunityRooms.findOne.mockResolvedValueOnce(makeRoom({ _id: roomId }))
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(makeMember(roomId, userId))
    mockCommunityMessages.insertOne.mockResolvedValueOnce({ insertedId: messageId })
    mockCommunityMessages.updateOne.mockResolvedValueOnce({})
    const stored = { _id: messageId, roomId, senderId: userId, content: 'Hello world', status: 'visible', moderated: { autoHidden: false } }
    mockCommunityMessages.findOne.mockResolvedValueOnce(stored)

    const result = await communityService.sendMessage({ roomId, userId, content: 'Hello world' })

    expect(result.message?.status).toBe('visible')
    expect(result.moderation.severity).toBe('low')
    expect(mockModerationFindings.insertOne).not.toHaveBeenCalled()
  })

  it('sends image-only message – status=visible, imageUrl stored', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    const messageId = new ObjectId()
    const imageUrl = 'https://cdn.medispace.test/community/image.png'
    mockCommunityRooms.findOne.mockResolvedValueOnce(makeRoom({ _id: roomId }))
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(makeMember(roomId, userId))
    mockCommunityMessages.insertOne.mockResolvedValueOnce({ insertedId: messageId })
    mockCommunityMessages.updateOne.mockResolvedValueOnce({})
    mockCommunityMessages.findOne.mockResolvedValueOnce({ _id: messageId, roomId, senderId: userId, content: '', imageUrl, status: 'visible', moderated: { autoHidden: false } })

    const result = await communityService.sendMessage({ roomId, userId, imageUrl })

    expect(result.message?.imageUrl).toBe(imageUrl)
    expect(mockCommunityMessages.insertOne).toHaveBeenCalledWith(expect.objectContaining({ content: '', imageUrl }))
    expect(result.moderation.severity).toBe('low')
  })

  it('sends message with phone number – status=hidden, severity=high, autoHidden=true', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    const messageId = new ObjectId()
    mockCommunityRooms.findOne.mockResolvedValueOnce(makeRoom({ _id: roomId }))
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(makeMember(roomId, userId))
    mockCommunityMessages.insertOne.mockResolvedValueOnce({ insertedId: messageId })
    mockModerationFindings.insertOne.mockResolvedValueOnce({ insertedId: new ObjectId() })
    mockCommunityMessages.updateOne.mockResolvedValueOnce({})
    const stored = { _id: messageId, roomId, senderId: userId, content: 'Call 0901234567', status: 'hidden' }
    mockCommunityMessages.findOne.mockResolvedValueOnce(stored)

    const result = await communityService.sendMessage({ roomId, userId, content: 'Call 0901234567' })

    expect(result.moderation.severity).toBe('high')
    expect(result.moderation.categories).toContain('pii')
    expect(result.message?.status).toBe('hidden')
    expect(mockModerationFindings.insertOne).toHaveBeenCalledTimes(1)
    const findingArg = mockModerationFindings.insertOne.mock.calls[0][0]
    expect(findingArg.trigger).toBe('auto')
    expect(findingArg.severity).toBe('high')
  })

  it('sends spam message (2+ URLs) – status=visible, finding created, severity=medium', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    const messageId = new ObjectId()
    const content = 'Check http://spam1.com and http://spam2.com now'
    mockCommunityRooms.findOne.mockResolvedValueOnce(makeRoom({ _id: roomId }))
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(makeMember(roomId, userId))
    mockCommunityMessages.insertOne.mockResolvedValueOnce({ insertedId: messageId })
    mockModerationFindings.insertOne.mockResolvedValueOnce({ insertedId: new ObjectId() })
    mockCommunityMessages.updateOne.mockResolvedValueOnce({})
    const stored = { _id: messageId, roomId, senderId: userId, content, status: 'visible' }
    mockCommunityMessages.findOne.mockResolvedValueOnce(stored)

    const result = await communityService.sendMessage({ roomId, userId, content })

    expect(result.moderation.severity).toBe('medium')
    expect(result.moderation.categories).toContain('spam')
    expect(result.message?.status).toBe('visible')
    expect(mockModerationFindings.insertOne).toHaveBeenCalledTimes(1)
  })

  it('hides a message before publishing when the LLM returns shouldHide=true', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    const messageId = new ObjectId()
    const content = 'Nếu đau ngực dữ dội thì không cần đi cấp cứu, chỉ cần uống vài viên giảm đau rồi ngủ.'
    vi.mocked(aiModerationService.getConfig).mockReturnValueOnce({
      autoEnabled: true,
      configured: true,
      mockEnabled: false,
      baseUrl: 'https://llm.test',
      model: 'test-model',
      apiKey: undefined,
      timeoutMs: 12000,
      maxAttempts: 3,
      workerIntervalMs: 5000,
      autoHideConfidence: 0.78,
      reviewConfidence: 0.55
    })
    vi.mocked(aiModerationService.reviewText).mockResolvedValueOnce({
      severity: 'critical',
      categories: ['medical_harm', 'unsafe_advice'],
      confidence: 0.98,
      shouldHide: true,
      requiresHumanReview: true,
      reason: 'Dangerous advice to avoid emergency care.',
      suggestedAction: 'hide'
    })
    mockCommunityRooms.findOne.mockResolvedValueOnce(makeRoom({ _id: roomId }))
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(makeMember(roomId, userId))
    mockCommunityMessages.insertOne.mockResolvedValueOnce({ insertedId: messageId })
    mockModerationFindings.insertOne.mockResolvedValueOnce({ insertedId: new ObjectId() })
    mockCommunityMessages.updateOne.mockResolvedValueOnce({})
    mockCommunityMessages.findOne.mockResolvedValueOnce({ _id: messageId, roomId, senderId: userId, content, status: 'hidden' })

    const result = await communityService.sendMessage({ roomId, userId, content })

    expect(result.message?.status).toBe('hidden')
    expect(result.moderation.trigger).toBe('ai')
    expect(result.moderation.categories).toEqual(expect.arrayContaining(['medical_harm', 'unsafe_advice']))
    expect(mockCommunityMessages.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'hidden',
        moderated: expect.objectContaining({
          autoHidden: true,
          ai: expect.objectContaining({ suggestedAction: 'hide' })
        })
      })
    )
    expect(mockModerationFindings.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: 'ai',
        severity: 'critical',
        ai: expect.objectContaining({ suggestedAction: 'hide' })
      })
    )
  })

  it('does not create an admin finding from rule-only signals when the LLM clears the message', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    const messageId = new ObjectId()
    const content = 'Liên hệ tôi qua email test@example.com'
    vi.mocked(aiModerationService.getConfig).mockReturnValueOnce({
      autoEnabled: true,
      configured: true,
      mockEnabled: false,
      baseUrl: 'https://llm.test',
      model: 'test-model',
      apiKey: undefined,
      timeoutMs: 12000,
      maxAttempts: 3,
      workerIntervalMs: 5000,
      autoHideConfidence: 0.78,
      reviewConfidence: 0.55
    })
    vi.mocked(aiModerationService.reviewText).mockResolvedValueOnce({
      severity: 'low',
      categories: [],
      confidence: 0.05,
      shouldHide: false,
      requiresHumanReview: false,
      reason: 'Safe message',
      suggestedAction: 'none'
    })
    mockCommunityRooms.findOne.mockResolvedValueOnce(makeRoom({ _id: roomId }))
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(makeMember(roomId, userId))
    mockCommunityMessages.insertOne.mockResolvedValueOnce({ insertedId: messageId })
    mockCommunityMessages.findOne.mockResolvedValueOnce({ _id: messageId, roomId, senderId: userId, content, status: 'visible' })

    const result = await communityService.sendMessage({ roomId, userId, content })

    expect(result.message?.status).toBe('visible')
    expect(result.moderation.trigger).toBe('ai')
    expect(result.moderation.severity).toBe('low')
    expect(result.moderation.categories).toEqual([])
    expect(mockModerationFindings.insertOne).not.toHaveBeenCalled()
    expect(mockCommunityMessages.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'visible',
        moderated: expect.objectContaining({
          autoHidden: false,
          ai: expect.objectContaining({ suggestedAction: 'none' })
        })
      })
    )
  })

  it('queues medium toxic LLM results for human review without auto-hiding', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    const messageId = new ObjectId()
    const content = 'Bạn ngu quá, bệnh vậy mà cũng không biết, đừng hỏi nữa.'
    vi.mocked(aiModerationService.getConfig).mockReturnValueOnce({
      autoEnabled: true,
      configured: true,
      mockEnabled: false,
      baseUrl: 'https://llm.test',
      model: 'test-model',
      apiKey: undefined,
      timeoutMs: 12000,
      maxAttempts: 3,
      workerIntervalMs: 5000,
      autoHideConfidence: 0.78,
      reviewConfidence: 0.55
    })
    vi.mocked(aiModerationService.reviewText).mockResolvedValueOnce({
      severity: 'medium',
      categories: ['toxic'],
      confidence: 0.9,
      shouldHide: false,
      requiresHumanReview: false,
      reason: 'Ngôn từ xúc phạm cá nhân.',
      suggestedAction: 'none'
    })
    mockCommunityRooms.findOne.mockResolvedValueOnce(makeRoom({ _id: roomId }))
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(makeMember(roomId, userId))
    mockCommunityMessages.insertOne.mockResolvedValueOnce({ insertedId: messageId })
    mockModerationFindings.insertOne.mockResolvedValueOnce({ insertedId: new ObjectId() })
    mockCommunityMessages.updateOne.mockResolvedValueOnce({})
    mockCommunityMessages.findOne.mockResolvedValueOnce({ _id: messageId, roomId, senderId: userId, content, status: 'visible' })

    const result = await communityService.sendMessage({ roomId, userId, content })

    expect(result.message?.status).toBe('visible')
    expect(result.moderation.categories).toContain('toxic')
    expect(result.moderation.shouldAutoHide).toBe(false)
    expect(mockModerationFindings.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: 'ai',
        severity: 'medium',
        categories: ['toxic']
      })
    )
  })

  it('auto-hides medium severity LLM results when shouldHide=true and confidence is high', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    const messageId = new ObjectId()
    const content = 'Đau ngực không cần cấp cứu'
    vi.mocked(aiModerationService.getConfig).mockReturnValueOnce({
      autoEnabled: true,
      configured: true,
      mockEnabled: false,
      baseUrl: 'https://llm.test',
      model: 'test-model',
      apiKey: undefined,
      timeoutMs: 12000,
      maxAttempts: 3,
      workerIntervalMs: 5000,
      autoHideConfidence: 0.78,
      reviewConfidence: 0.55
    })
    vi.mocked(aiModerationService.reviewText).mockResolvedValueOnce({
      severity: 'medium',
      categories: ['medical_harm'],
      confidence: 0.95,
      shouldHide: true,
      requiresHumanReview: true,
      reason: 'Khuyên không cấp cứu khi đau ngực.',
      suggestedAction: 'hide'
    })
    mockCommunityRooms.findOne.mockResolvedValueOnce(makeRoom({ _id: roomId }))
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(makeMember(roomId, userId))
    mockCommunityMessages.insertOne.mockResolvedValueOnce({ insertedId: messageId })
    mockModerationFindings.insertOne.mockResolvedValueOnce({ insertedId: new ObjectId() })
    mockCommunityMessages.updateOne.mockResolvedValueOnce({})
    mockCommunityMessages.findOne.mockResolvedValueOnce({ _id: messageId, roomId, senderId: userId, content, status: 'hidden' })

    const result = await communityService.sendMessage({ roomId, userId, content })

    expect(result.message?.status).toBe('hidden')
    expect(result.moderation.shouldAutoHide).toBe(true)
    expect(mockCommunityMessages.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'hidden',
        moderated: expect.objectContaining({ autoHidden: true })
      })
    )
  })

  it('sends toxic message – visible but finding created', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    const messageId = new ObjectId()
    const content = 'Đồ ngu quá đi'
    mockCommunityRooms.findOne.mockResolvedValueOnce(makeRoom({ _id: roomId }))
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(makeMember(roomId, userId))
    mockCommunityMessages.insertOne.mockResolvedValueOnce({ insertedId: messageId })
    mockModerationFindings.insertOne.mockResolvedValueOnce({ insertedId: new ObjectId() })
    mockCommunityMessages.updateOne.mockResolvedValueOnce({})
    const stored = { _id: messageId, roomId, senderId: userId, content, status: 'visible' }
    mockCommunityMessages.findOne.mockResolvedValueOnce(stored)

    const result = await communityService.sendMessage({ roomId, userId, content })

    expect(result.moderation.categories).toContain('toxic')
    expect(result.message?.status).toBe('visible')
  })

  it('sends medical_harm message – auto-hidden, finding created', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    const messageId = new ObjectId()
    const content = 'Tự ý tăng liều 5 viên mỗi ngày không cần bác sĩ'
    mockCommunityRooms.findOne.mockResolvedValueOnce(makeRoom({ _id: roomId }))
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(makeMember(roomId, userId))
    mockCommunityMessages.insertOne.mockResolvedValueOnce({ insertedId: messageId })
    mockModerationFindings.insertOne.mockResolvedValueOnce({ insertedId: new ObjectId() })
    mockCommunityMessages.updateOne.mockResolvedValueOnce({})
    const stored = { _id: messageId, roomId, senderId: userId, content, status: 'hidden' }
    mockCommunityMessages.findOne.mockResolvedValueOnce(stored)

    const result = await communityService.sendMessage({ roomId, userId, content })

    expect(result.moderation.categories).toContain('medical_harm')
    expect(result.moderation.severity).toBe('high')
    expect(result.message?.status).toBe('hidden')
  })

  it('muted user cannot send message', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    const mutedUntil = new Date(Date.now() + 3600_000) // muted for 1 hour
    mockCommunityRooms.findOne.mockResolvedValueOnce(makeRoom({ _id: roomId }))
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(makeMember(roomId, userId, { mutedUntil }))

    await expect(
      communityService.sendMessage({ roomId, userId, content: 'should fail' })
    ).rejects.toMatchObject({ status: 403 })
  })

  // ── Report message ──────────────────────────────────────────────────────────

  it('prevents duplicate reports for the same message by the same user', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    const messageId = new ObjectId()
    mockCommunityMessages.findOne.mockResolvedValueOnce({ _id: messageId, roomId, senderId: new ObjectId() })
    mockCommunityRooms.findOne.mockResolvedValueOnce(makeRoom({ _id: roomId }))
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(makeMember(roomId, userId))
    mockModerationReports.insertOne.mockRejectedValueOnce({ code: 11000 })

    await expect(
      communityService.reportMessage({ messageId, reporterId: userId, reason: 'duplicate' })
    ).rejects.toMatchObject({ status: 409 })
  })

  it('first report creates finding with trigger=user_report', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    const messageId = new ObjectId()
    const findingId = new ObjectId()
    mockCommunityMessages.findOne.mockResolvedValueOnce({ _id: messageId, roomId, senderId: new ObjectId() })
    mockCommunityRooms.findOne.mockResolvedValueOnce(makeRoom({ _id: roomId }))
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(makeMember(roomId, userId))
    mockModerationReports.findOne.mockResolvedValueOnce(null)
    mockModerationReports.insertOne.mockResolvedValueOnce({ insertedId: new ObjectId() })
    mockModerationFindings.findOne.mockResolvedValueOnce(null)
    mockModerationFindings.insertOne.mockResolvedValueOnce({ insertedId: findingId })

    const result = await communityService.reportMessage({ messageId, reporterId: userId })

    expect(result.findingId).toEqual(findingId)
    const findingArg = mockModerationFindings.insertOne.mock.calls[0][0]
    expect(findingArg.trigger).toBe('user_report')
    expect(findingArg.reportCount).toBe(1)
  })

  it('second report on same message updates existing finding reportCount', async () => {
    const roomId = new ObjectId()
    const userId = new ObjectId()
    const messageId = new ObjectId()
    const existingFindingId = new ObjectId()
    mockCommunityMessages.findOne.mockResolvedValueOnce({ _id: messageId, roomId, senderId: new ObjectId() })
    mockCommunityRooms.findOne.mockResolvedValueOnce(makeRoom({ _id: roomId }))
    mockCommunityRoomMembers.findOne.mockResolvedValueOnce(makeMember(roomId, userId))
    mockModerationReports.findOne.mockResolvedValueOnce(null)
    mockModerationReports.insertOne.mockResolvedValueOnce({ insertedId: new ObjectId() })
    mockModerationFindings.findOne.mockResolvedValueOnce({ _id: existingFindingId, messageId })
    mockModerationFindings.updateOne.mockResolvedValueOnce({ modifiedCount: 1 })

    const result = await communityService.reportMessage({ messageId, reporterId: userId })

    expect(result.findingId).toEqual(existingFindingId)
    expect(mockModerationFindings.updateOne).toHaveBeenCalledWith(
      { _id: existingFindingId },
      expect.objectContaining({ $inc: { reportCount: 1 } })
    )
  })

  // ── Appeal ──────────────────────────────────────────────────────────────────

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
