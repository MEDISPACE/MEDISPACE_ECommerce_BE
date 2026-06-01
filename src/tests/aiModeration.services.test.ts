import { beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { ObjectId } from 'mongodb'

const mockModerationAiJobs = {
  updateOne: vi.fn(),
  findOneAndUpdate: vi.fn()
}

const mockCommunityMessages = {
  findOne: vi.fn(),
  updateOne: vi.fn()
}

const mockModerationFindings = {
  findOneAndUpdate: vi.fn()
}

vi.mock('axios', () => ({
  default: {
    post: vi.fn()
  }
}))

vi.mock('~/services/database.services', () => ({
  default: {
    moderationAiJobs: mockModerationAiJobs,
    communityMessages: mockCommunityMessages,
    moderationFindings: mockModerationFindings
  }
}))

vi.mock('~/sockets/chat.socket', () => ({
  getIO: () => ({ to: () => ({ emit: vi.fn() }) })
}))

const { default: aiModerationService, redactText } = await import('~/services/aiModeration.services')

describe('AiModerationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.AI_MODERATION_ENABLED
    delete process.env.AI_MODERATION_BASE_URL
    delete process.env.AI_MODERATION_MODEL
    delete process.env.AI_MODERATION_API_KEY
  })

  it('does not enqueue automatic jobs when AI moderation is disabled', async () => {
    const message = { _id: new ObjectId(), roomId: new ObjectId(), senderId: new ObjectId(), content: 'hello' }

    const result = await aiModerationService.enqueueMessageReview({ message })

    expect(result).toBeNull()
    expect(mockModerationAiJobs.updateOne).not.toHaveBeenCalled()
  })

  it('redacts direct contact identifiers before sending text to the LLM', () => {
    expect(redactText('Email me at test@example.com or 0912345678')).toBe('Email me at [email] or [phone]')
  })

  it('auto-hides high-confidence harmful AI results and queues a finding', async () => {
    process.env.AI_MODERATION_BASE_URL = 'http://ai.local/v1'
    process.env.AI_MODERATION_MODEL = 'test-model'

    const roomId = new ObjectId()
    const senderId = new ObjectId()
    const messageId = new ObjectId()
    const jobId = new ObjectId()
    const findingId = new ObjectId()
    const message = {
      _id: messageId,
      roomId,
      senderId,
      content: 'Tự ý tăng liều thuốc lên gấp đôi mỗi ngày',
      status: 'visible'
    }

    mockModerationAiJobs.findOneAndUpdate.mockResolvedValueOnce({
      _id: jobId,
      messageId,
      roomId,
      senderId,
      ruleResult: { severity: 'high', categories: ['medical_harm'] }
    })
    mockCommunityMessages.findOne.mockResolvedValueOnce(message).mockResolvedValueOnce({ ...message, status: 'hidden' })
    mockModerationFindings.findOneAndUpdate.mockResolvedValueOnce({ _id: findingId })
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                severity: 'high',
                categories: ['medical_harm'],
                confidence: 0.91,
                shouldHide: true,
                requiresHumanReview: true,
                reason: 'Dangerous medication dosage advice',
                suggestedAction: 'hide'
              })
            }
          }
        ]
      }
    })

    const result = await aiModerationService.processNextJob()

    expect(result?.applied).toMatchObject({ queued: true, autoHidden: true, findingId })
    expect(mockCommunityMessages.updateOne).toHaveBeenCalledWith(
      { _id: messageId },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'hidden',
          'moderated.aiAutoHidden': true
        })
      })
    )
    expect(mockModerationFindings.findOneAndUpdate).toHaveBeenCalledWith(
      { messageId },
      expect.objectContaining({
        $set: expect.objectContaining({
          trigger: 'ai',
          severity: 'high',
          categories: ['medical_harm']
        })
      }),
      { upsert: true, returnDocument: 'after' }
    )
  })
})
