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
  updateOne: vi.fn(),
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
    vi.resetAllMocks()
    delete process.env.AI_MODERATION_ENABLED
    delete process.env.AI_MODERATION_BASE_URL
    delete process.env.AI_MODERATION_MODEL
    delete process.env.AI_MODERATION_API_KEY
    delete process.env.AI_MODERATION_MOCK
  })

  it('does not enqueue automatic jobs when AI moderation is disabled', async () => {
    const message = { _id: new ObjectId(), roomId: new ObjectId(), senderId: new ObjectId(), content: 'hello' }

    const result = await aiModerationService.enqueueMessageReview({ message })

    expect(result).toBeNull()
    expect(mockModerationAiJobs.updateOne).not.toHaveBeenCalled()
  })

  it('redacts direct contact identifiers before sending text to the LLM', () => {
    expect(redactText('Email me at test@example.com or 0912345678')).toBe('Email me at [email] or [phone]')
    expect(redactText('Call 090 123 4567 or +84.901.234.567')).toBe('Call [phone] or [phone]')
  })

  it('returns deterministic results in mock mode without calling the LLM', async () => {
    process.env.AI_MODERATION_MOCK = 'true'

    const result = await aiModerationService.reviewText('[ai-hide] unsafe advice')

    expect(result).toMatchObject({
      severity: 'high',
      categories: ['medical_harm'],
      confidence: 0.95,
      shouldHide: true,
      suggestedAction: 'hide'
    })
    expect(axios.post).not.toHaveBeenCalled()
  })

  it('queues forced manual reviews without conflicting attempts updates', async () => {
    process.env.AI_MODERATION_MOCK = 'true'
    const message = { _id: new ObjectId(), roomId: new ObjectId(), senderId: new ObjectId(), content: 'hello' }
    const processSpy = vi.spyOn(aiModerationService, 'processPendingJobs').mockResolvedValueOnce({ processed: 0 })
    mockCommunityMessages.findOne.mockResolvedValueOnce(message)

    await aiModerationService.enqueueManualReview(message._id)

    const update = mockModerationAiJobs.updateOne.mock.calls[0]?.[1]
    expect(update.$setOnInsert.attempts).toBeUndefined()
    expect(update.$set.attempts).toBe(0)
    processSpy.mockRestore()
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
    expect(mockModerationFindings.updateOne).toHaveBeenCalledWith(
      { messageId },
      expect.objectContaining({
        $set: expect.objectContaining({
          ai: expect.objectContaining({
            suggestedAction: 'hide',
            reason: 'Dangerous medication dosage advice'
          })
        })
      })
    )
  })

  it('[ai-review] mock returns medium severity, shouldHide=false, suggestedAction=review', async () => {
    process.env.AI_MODERATION_MOCK = 'true'

    const result = await aiModerationService.reviewText('[ai-review] possibly misleading advice')

    expect(result).toMatchObject({
      severity: 'medium',
      confidence: 0.82,
      shouldHide: false,
      requiresHumanReview: true,
      suggestedAction: 'review'
    })
    expect(axios.post).not.toHaveBeenCalled()
  })

  it('safe content mock returns low severity and shouldHide=false', async () => {
    process.env.AI_MODERATION_MOCK = 'true'

    const result = await aiModerationService.reviewText('How do I take vitamin C supplements?')

    expect(result).toMatchObject({
      severity: 'low',
      shouldHide: false,
      requiresHumanReview: false,
      suggestedAction: 'none'
    })
    expect(axios.post).not.toHaveBeenCalled()
  })

  it('AI result below autoHide threshold → not auto-hidden, not queued (low severity)', async () => {
    process.env.AI_MODERATION_BASE_URL = 'http://ai.local/v1'
    process.env.AI_MODERATION_MODEL = 'test-model'

    const roomId = new ObjectId()
    const senderId = new ObjectId()
    const messageId = new ObjectId()
    const jobId = new ObjectId()
    const message = { _id: messageId, roomId, senderId, content: 'What vitamins should I take?', status: 'visible' }

    mockModerationAiJobs.findOneAndUpdate.mockResolvedValueOnce({
      _id: jobId, messageId, roomId, senderId,
      ruleResult: { severity: 'low', categories: [] }
    })
    mockCommunityMessages.findOne.mockResolvedValueOnce(message).mockResolvedValueOnce(message)
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        choices: [{
          message: {
            content: JSON.stringify({
              severity: 'low',
              categories: [],
              confidence: 0.45,
              shouldHide: false,
              requiresHumanReview: false,
              reason: 'Benign health question',
              suggestedAction: 'none'
            })
          }
        }]
      }
    })

    const result = await aiModerationService.processNextJob()

    expect(result?.applied).toMatchObject({ queued: false, autoHidden: false })
    expect(mockCommunityMessages.updateOne).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ $set: expect.objectContaining({ status: 'hidden' }) })
    )
    expect(mockModerationFindings.findOneAndUpdate).not.toHaveBeenCalled()
    expect(mockModerationFindings.updateOne).toHaveBeenCalledWith(
      { messageId },
      expect.objectContaining({
        $set: expect.objectContaining({
          ai: expect.objectContaining({
            suggestedAction: 'none',
            reason: 'Benign health question'
          })
        })
      })
    )
  })

  it('AI result above review threshold only → queued=true but autoHidden=false', async () => {
    process.env.AI_MODERATION_BASE_URL = 'http://ai.local/v1'
    process.env.AI_MODERATION_MODEL = 'test-model'

    const roomId = new ObjectId()
    const senderId = new ObjectId()
    const messageId = new ObjectId()
    const jobId = new ObjectId()
    const findingId = new ObjectId()
    const message = { _id: messageId, roomId, senderId, content: 'Possibly misleading content', status: 'visible' }

    mockModerationAiJobs.findOneAndUpdate.mockResolvedValueOnce({
      _id: jobId, messageId, roomId, senderId,
      ruleResult: { severity: 'medium', categories: ['spam'] }
    })
    mockCommunityMessages.findOne.mockResolvedValueOnce(message).mockResolvedValueOnce(message)
    mockModerationFindings.findOneAndUpdate.mockResolvedValueOnce({ _id: findingId })
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        choices: [{
          message: {
            content: JSON.stringify({
              severity: 'medium',
              categories: ['spam'],
              confidence: 0.62, // above review threshold (0.55) but below hide threshold (0.78)
              shouldHide: false,
              requiresHumanReview: true,
              reason: 'Possibly misleading – needs review',
              suggestedAction: 'review'
            })
          }
        }]
      }
    })

    const result = await aiModerationService.processNextJob()

    expect(result?.applied).toMatchObject({ queued: true, autoHidden: false })
    expect(mockModerationFindings.findOneAndUpdate).toHaveBeenCalledTimes(1)
    expect(mockModerationFindings.updateOne).toHaveBeenCalledWith(
      { messageId },
      expect.objectContaining({
        $set: expect.objectContaining({
          ai: expect.objectContaining({
            suggestedAction: 'review',
            reason: expect.stringContaining('AI phát hiện')
          })
        })
      })
    )
    // Message should NOT have been hidden
    expect(mockCommunityMessages.updateOne).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ $set: expect.objectContaining({ status: 'hidden' }) })
    )
  })

  it('policy sends high-confidence toxic personal attacks to human review', async () => {
    process.env.AI_MODERATION_BASE_URL = 'http://ai.local/v1'
    process.env.AI_MODERATION_MODEL = 'test-model'
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        choices: [{
          message: {
            content: JSON.stringify({
              severity: 'medium',
              categories: ['toxic'],
              confidence: 0.95,
              shouldHide: false,
              requiresHumanReview: false,
              reason: 'Công kích cá nhân.',
              suggestedAction: 'none'
            })
          }
        }]
      }
    })

    const result = await aiModerationService.reviewText('Mày dốt thì đừng có lên đây hỏi bậy bạ, làm phiền người khác')

    expect(result).toMatchObject({
      severity: 'medium',
      categories: expect.arrayContaining(['toxic']),
      shouldHide: false,
      requiresHumanReview: true,
      suggestedAction: 'review'
    })
  })

  it('policy hides severe profanity and death-wish harassment', async () => {
    process.env.AI_MODERATION_BASE_URL = 'http://ai.local/v1'
    process.env.AI_MODERATION_MODEL = 'test-model'

    for (const content of ['đụ má', 'óc chó', 'mày đi chết con mẹ mày đi']) {
      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                severity: 'high',
                categories: ['toxic'],
                confidence: 0.95,
                shouldHide: false,
                requiresHumanReview: true,
                reason: 'Công kích nghiêm trọng.',
                suggestedAction: 'review'
              })
            }
          }]
        }
      })

      const result = await aiModerationService.reviewText(content)

      expect(result).toMatchObject({
        severity: 'high',
        categories: expect.arrayContaining(['toxic', 'harassment']),
        shouldHide: true,
        requiresHumanReview: true,
        suggestedAction: 'hide'
      })
    }
  })

  it('policy hides protected-group attacks even when the LLM is too lenient', async () => {
    process.env.AI_MODERATION_BASE_URL = 'http://ai.local/v1'
    process.env.AI_MODERATION_MODEL = 'test-model'
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        choices: [{
          message: {
            content: JSON.stringify({
              severity: 'medium',
              categories: ['toxic'],
              confidence: 0.95,
              shouldHide: false,
              requiresHumanReview: false,
              reason: 'Miệt thị nhóm người.',
              suggestedAction: 'none'
            })
          }
        }]
      }
    })

    const result = await aiModerationService.reviewText('Dân tộc X toàn người lười biếng, bảo sao nghèo')

    expect(result).toMatchObject({
      severity: 'high',
      categories: expect.arrayContaining(['toxic', 'harassment']),
      shouldHide: true,
      requiresHumanReview: true,
      suggestedAction: 'hide'
    })
  })

  it('policy sends authority-based medical misinformation to human review', async () => {
    process.env.AI_MODERATION_BASE_URL = 'http://ai.local/v1'
    process.env.AI_MODERATION_MODEL = 'test-model'
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        choices: [{
          message: {
            content: JSON.stringify({
              severity: 'low',
              categories: [],
              confidence: 0.9,
              shouldHide: false,
              requiresHumanReview: false,
              reason: 'Không phát hiện vi phạm.',
              suggestedAction: 'none'
            })
          }
        }]
      }
    })

    const result = await aiModerationService.reviewText('Bác sĩ Bệnh viện Bạch Mai đã xác nhận với tôi riêng là vắc xin này có hại')

    expect(result).toMatchObject({
      severity: 'medium',
      categories: expect.arrayContaining(['unsafe_advice']),
      shouldHide: false,
      requiresHumanReview: true,
      suggestedAction: 'review'
    })
  })

  it('policy sends serious pharmacy accusations to human review without auto-hiding', async () => {
    process.env.AI_MODERATION_BASE_URL = 'http://ai.local/v1'
    process.env.AI_MODERATION_MODEL = 'test-model'
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        choices: [{
          message: {
            content: JSON.stringify({
              severity: 'medium',
              categories: ['spam', 'unsafe_advice'],
              confidence: 0.9,
              shouldHide: false,
              requiresHumanReview: false,
              reason: 'Cảnh báo về nhà thuốc.',
              suggestedAction: 'none'
            })
          }
        }]
      }
    })

    const result = await aiModerationService.reviewText('Nhà thuốc Long Châu bán thuốc giả, tôi mua phải hàng dỏm ở đó, mọi người cẩn thận')

    expect(result).toMatchObject({
      severity: 'medium',
      categories: expect.arrayContaining(['other']),
      shouldHide: false,
      requiresHumanReview: true,
      suggestedAction: 'review'
    })
  })

  it('policy sends described report-abuse patterns to human review', async () => {
    process.env.AI_MODERATION_BASE_URL = 'http://ai.local/v1'
    process.env.AI_MODERATION_MODEL = 'test-model'
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        choices: [{
          message: {
            content: JSON.stringify({
              severity: 'low',
              categories: ['other'],
              confidence: 0.9,
              shouldHide: false,
              requiresHumanReview: false,
              reason: 'Mô tả hành vi báo cáo.',
              suggestedAction: 'none'
            })
          }
        }]
      }
    })

    const result = await aiModerationService.reviewText('User A report hàng loạt 20 bài hợp lệ của User B trong 5 phút để trù dập cá nhân')

    expect(result).toMatchObject({
      severity: 'medium',
      categories: expect.arrayContaining(['other']),
      shouldHide: false,
      requiresHumanReview: true,
      suggestedAction: 'review'
    })
  })

  it('policy sends sexual medicine advice questions to human review', async () => {
    process.env.AI_MODERATION_BASE_URL = 'http://ai.local/v1'
    process.env.AI_MODERATION_MODEL = 'test-model'
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        choices: [{
          message: {
            content: JSON.stringify({
              severity: 'medium',
              categories: ['unsafe_advice', 'spam'],
              confidence: 0.9,
              shouldHide: false,
              requiresHumanReview: false,
              reason: 'Hỏi kinh nghiệm thuốc kích dục.',
              suggestedAction: 'none'
            })
          }
        }]
      }
    })

    const result = await aiModerationService.reviewText('Ai có kinh nghiệm dùng thuốc kích dục không, chỉ mình với 😏')

    expect(result).toMatchObject({
      severity: 'medium',
      categories: expect.arrayContaining(['unsafe_advice']),
      shouldHide: false,
      requiresHumanReview: true,
      suggestedAction: 'review'
    })
  })

  it('policy hides sexual medicine purchase or private-sale intent', async () => {
    process.env.AI_MODERATION_BASE_URL = 'http://ai.local/v1'
    process.env.AI_MODERATION_MODEL = 'test-model'
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        choices: [{
          message: {
            content: JSON.stringify({
              severity: 'medium',
              categories: ['unsafe_advice'],
              confidence: 0.9,
              shouldHide: false,
              requiresHumanReview: false,
              reason: 'Hỏi mua thuốc sinh lý.',
              suggestedAction: 'none'
            })
          }
        }]
      }
    })

    const result = await aiModerationService.reviewText('Mình muốn thuốc làm chuyện ấy sung hơn, ai có loại mạnh chỉ mình riêng nha')

    expect(result).toMatchObject({
      severity: 'high',
      categories: expect.arrayContaining(['spam', 'unsafe_advice']),
      shouldHide: true,
      requiresHumanReview: true,
      suggestedAction: 'hide'
    })
  })
})
