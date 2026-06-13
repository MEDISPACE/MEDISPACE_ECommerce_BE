import axios from 'axios'
import { ObjectId } from 'mongodb'
import databaseService from '~/services/database.services'
import { ReviewStatus } from '~/constants/enum'
import notificationService from '~/services/notifications.services'

// ─── Types ──────────────────────────────────────────────────────────────────

type AiSeverity = 'low' | 'medium' | 'high' | 'critical'
type AiCategory = 'pii' | 'spam' | 'toxic' | 'medical_harm' | 'harassment' | 'unsafe_advice' | 'self_harm' | 'other'

export type ReviewAiResult = {
  severity: AiSeverity
  categories: AiCategory[]
  confidence: number
  shouldHide: boolean
  requiresHumanReview: boolean
  reason: string
  suggestedAction: 'none' | 'review' | 'hide'
  model: string
  reviewedAt: Date
  latencyMs: number
}

type AiConfig = {
  enabled: boolean
  mockEnabled: boolean
  configured: boolean
  baseUrl: string
  model: string
  apiKey?: string
  timeoutMs: number
  hideConfidence: number
  reviewConfidence: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SEVERITY_VALUES: AiSeverity[] = ['low', 'medium', 'high', 'critical']
const CATEGORY_VALUES: AiCategory[] = ['pii', 'spam', 'toxic', 'medical_harm', 'harassment', 'unsafe_advice', 'self_harm', 'other']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function asNumber(val: string | undefined, fallback: number): number {
  const n = Number(val)
  return Number.isFinite(n) ? n : fallback
}

function pickJson(raw: string): string {
  // Strip markdown code fences (Gemma often wraps JSON in ```json ... ```)
  const stripped = raw
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/```\s*$/im, '')
    .trim()

  // Extract first complete JSON object
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start >= 0 && end > start) return stripped.slice(start, end + 1)

  // Fallback: try original raw string
  const startRaw = raw.indexOf('{')
  const endRaw = raw.lastIndexOf('}')
  if (startRaw >= 0 && endRaw > startRaw) return raw.slice(startRaw, endRaw + 1)

  return stripped
}

function normalizeResult(raw: any, model: string, latencyMs: number): ReviewAiResult {
  const severity: AiSeverity = SEVERITY_VALUES.includes(raw?.severity) ? raw.severity : 'low'
  const categories: AiCategory[] = Array.isArray(raw?.categories)
    ? raw.categories.filter((c: string) => CATEGORY_VALUES.includes(c as AiCategory))
    : []
  const confidence = Math.max(0, Math.min(1, Number(raw?.confidence ?? 0)))
  const shouldHide =
    typeof raw?.shouldHide === 'boolean'
      ? raw.shouldHide
      : (severity === 'high' || severity === 'critical') && confidence >= 0.75
  const requiresHumanReview =
    typeof raw?.requiresHumanReview === 'boolean'
      ? raw.requiresHumanReview
      : severity === 'medium' || severity === 'high' || severity === 'critical'
  const suggestedAction =
    raw?.suggestedAction === 'hide' || raw?.suggestedAction === 'review' || raw?.suggestedAction === 'none'
      ? raw.suggestedAction
      : shouldHide
        ? 'hide'
        : requiresHumanReview
          ? 'review'
          : 'none'

  return {
    severity,
    categories: categories.length > 0 ? categories : severity === 'low' ? [] : ['other'],
    confidence,
    shouldHide,
    requiresHumanReview,
    reason: String(raw?.reason || '').trim().slice(0, 500) || 'AI moderation result',
    suggestedAction,
    model,
    reviewedAt: new Date(),
    latencyMs
  }
}

// ─── Mock mode (dùng cho dev/test — không cần LLM thật) ─────────────────────
// Magic keywords trong comment/title:
//   "ai_e2e_hide"   → simulate AI phát hiện nội dung nghiêm trọng → shouldHide=true
//   "ai_e2e_review" → simulate AI cần human review → requiresHumanReview=true
//   (bình thường)   → safe, confidence thấp

function mockScore(content: string): Omit<ReviewAiResult, 'model' | 'reviewedAt' | 'latencyMs'> {
  const lower = content.toLowerCase()

  if (lower.includes('[ai-hide]') || lower.includes('ai_e2e_hide')) {
    return {
      severity: 'high',
      categories: ['medical_harm'],
      confidence: 0.95,
      shouldHide: true,
      requiresHumanReview: true,
      reason: '[Mock] Phát hiện nội dung y tế có thể gây nguy hiểm.',
      suggestedAction: 'hide'
    }
  }

  if (lower.includes('[ai-review]') || lower.includes('ai_e2e_review')) {
    return {
      severity: 'medium',
      categories: ['spam'],
      confidence: 0.72,
      shouldHide: false,
      requiresHumanReview: true,
      reason: '[Mock] Nội dung đáng ngờ, cần admin xem xét.',
      suggestedAction: 'review'
    }
  }

  return {
    severity: 'low',
    categories: [],
    confidence: 0.04,
    shouldHide: false,
    requiresHumanReview: false,
    reason: '[Mock] Nội dung an toàn.',
    suggestedAction: 'none'
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

class ReviewAiModerationService {
  getConfig(): AiConfig {
    const baseUrl = (process.env.AI_MODERATION_BASE_URL || process.env.CUSTOM_LLM_BASE_URL || '').replace(/\/$/, '')
    const apiKey = process.env.AI_MODERATION_API_KEY || process.env.CUSTOM_LLM_API_KEY
    const mockEnabled = process.env.REVIEW_AI_MOCK === 'true'
    const enabled = process.env.REVIEW_AI_ENABLED === 'true'
    const model =
      process.env.AI_MODERATION_MODEL || process.env.CUSTOM_LLM_MODEL || (mockEnabled ? 'mock-review-ai' : 'gemma-4-e4b-it.gguf')

    return {
      enabled,
      mockEnabled,
      configured: mockEnabled || Boolean(baseUrl && model),
      baseUrl,
      model,
      apiKey,
      timeoutMs: asNumber(process.env.AI_MODERATION_TIMEOUT_MS, 20000),  // 20s for real LLM
      hideConfidence: asNumber(process.env.REVIEW_AI_HIDE_CONFIDENCE, 0.78),
      reviewConfidence: asNumber(process.env.REVIEW_AI_REVIEW_CONFIDENCE, 0.55)
    }
  }

  /**
   * Gọi LLM hoặc mock để đánh giá nội dung review.
   * Trả về kết quả AI với severity, categories, confidence.
   */
  async scoreReview(content: string): Promise<ReviewAiResult> {
    const config = this.getConfig()
    if (!config.configured) throw new Error('[ReviewAI] AI moderation is not configured')

    const startedAt = Date.now()

    if (config.mockEnabled) {
      // Simulate latency của AI trong mock mode
      await new Promise((r) => setTimeout(r, 50))
      const mock = mockScore(content)
      return { ...mock, model: config.model, reviewedAt: new Date(), latencyMs: Date.now() - startedAt }
    }

    // Gọi LLM thật qua OpenAI-compatible API
    // Endpoint: baseUrl + /v1/chat/completions (OpenAI-compatible)
    const response = await axios.post(
      `${config.baseUrl}/v1/chat/completions`,
      {
        model: config.model,
        temperature: 0,
        max_tokens: 300,
        messages: [
          {
            role: 'system',
            content:
              'You are a product review content moderator for a Vietnamese medical e-commerce platform. ' +
              'Always respond with valid JSON only. No markdown, no explanation outside JSON.'
          },
          {
            role: 'user',
            content: [
              'Moderate the following product review. Return ONLY valid JSON with these exact fields:',
              '- severity: one of ["low", "medium", "high", "critical"]',
              '- categories: array, each item one of ["pii", "spam", "toxic", "medical_harm", "harassment", "unsafe_advice", "self_harm", "other"] — empty array if safe',
              '- confidence: float 0.0-1.0',
              '- shouldHide: boolean — true ONLY for dangerous medical advice, PII, self_harm, or critical toxic content',
              '- requiresHumanReview: boolean — true for medium/high/critical severity',
              '- reason: string, one sentence in English',
              '- suggestedAction: one of ["none", "review", "hide"]',
              '',
              `Review text: "${content}"`
            ].join('\n')
          }
        ]
      },
      {
        timeout: config.timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
        }
      }
    )

    const rawContent = response.data?.choices?.[0]?.message?.content
    if (!rawContent) throw new Error('[ReviewAI] LLM returned empty response')

    const latencyMs = Date.now() - startedAt
    const jsonStr = pickJson(rawContent)

    let parsed: any
    try {
      parsed = JSON.parse(jsonStr)
    } catch (parseErr) {
      // LLM returned non-JSON despite instructions — log and return safe fallback
      console.warn('[ReviewAI] JSON parse failed, raw:', rawContent.slice(0, 200))
      // Fallback: treat as low severity safe review (do not block customer)
      parsed = {
        severity: 'low', categories: [], confidence: 0.1,
        shouldHide: false, requiresHumanReview: false,
        reason: 'AI response could not be parsed', suggestedAction: 'none'
      }
    }

    return normalizeResult(parsed, config.model, latencyMs)
  }

  /**
   * Fire-and-forget AI scoring sau khi review đã được save vào DB.
   * KHÔNG block response về customer — chạy hoàn toàn nền.
   *
   * Logic xử lý kết quả:
   * - shouldHide=true + confidence≥hideConfidence → Downgrade "approved" → "pending"
   * - requiresHumanReview=true + confidence≥reviewConfidence → Set aiFlag, notify admin
   * - Ngược lại → Chỉ lưu AI score vào document
   */
  async analyzeAsync(reviewId: ObjectId, userId: ObjectId, content: string): Promise<void> {
    const config = this.getConfig()
    if (!config.enabled || !config.configured) return

    try {
      const aiResult = await this.scoreReview(content)
      await this.applyAiResult(reviewId, userId, aiResult, config)
    } catch (err) {
      // AI failure phải KHÔNG ảnh hưởng đến review đã save
      console.error('[ReviewAI] analyzeAsync failed (non-critical):', err instanceof Error ? err.message : err)
    }
  }

  private async applyAiResult(
    reviewId: ObjectId,
    userId: ObjectId,
    aiResult: ReviewAiResult,
    config: AiConfig
  ): Promise<void> {
    const now = new Date()

    // Lấy review hiện tại
    const review = await databaseService.reviews.findOne({ _id: reviewId })
    if (!review) return

    // BUG-7 fix: Nếu admin đã moderate (approve/reject), KHÔNG override bằng AI
    // Admin decision luôn có quyền cao nhất — tránh race condition
    if (review.moderatedBy) {
      // Vẫn lưu AI score để audit, nhưng không thay đổi status/flag
      await databaseService.reviews.updateOne(
        { _id: reviewId },
        { $set: { aiModeration: aiResult, updatedAt: now } }
      )
      console.log(`[ReviewAI] Skipped action for review ${reviewId} — already moderated by admin`)
      return
    }

    const shouldAutoDowngrade =
      aiResult.shouldHide &&
      (aiResult.severity === 'high' || aiResult.severity === 'critical') &&
      aiResult.confidence >= config.hideConfidence

    const shouldFlag =
      !shouldAutoDowngrade &&
      aiResult.requiresHumanReview &&
      aiResult.severity !== 'low' &&
      aiResult.confidence >= config.reviewConfidence

    // Cập nhật review với kết quả AI
    const updateFields: Record<string, any> = {
      aiModeration: aiResult,
      updatedAt: now
    }

    if (shouldAutoDowngrade && review.status === ReviewStatus.Approved) {
      // Downgrade: approved → pending (AI phát hiện vấn đề nghiêm trọng)
      updateFields.status = ReviewStatus.Pending
      updateFields.autoApproved = false
      updateFields.aiFlag = true
      console.log(`[ReviewAI] Downgraded review ${reviewId} approved→pending (confidence=${aiResult.confidence.toFixed(2)})`)
    } else if (shouldFlag) {
      // Flag: giữ status, nhưng đánh dấu cần admin xem xét
      updateFields.aiFlag = true
      console.log(`[ReviewAI] Flagged review ${reviewId} for admin review (confidence=${aiResult.confidence.toFixed(2)})`)
    }

    await databaseService.reviews.updateOne({ _id: reviewId }, { $set: updateFields })

    // BUG-5 fix: Recalculate product rating when AI downgrades approved → pending
    if (shouldAutoDowngrade && review.status === ReviewStatus.Approved) {
      try {
        const { default: reviewService } = await import('~/services/reviews.services')
        await reviewService.updateProductRating(review.productId)
      } catch (ratingErr) {
        console.error('[ReviewAI] Failed to recalculate product rating after downgrade:', ratingErr)
      }
    }

    // (DB update moved above — before product rating recalculation)

    // Notify admin nếu cần
    if (shouldAutoDowngrade || shouldFlag) {
      try {
        const { getIO } = await import('~/sockets/chat.socket')
        let io: any
        try { io = getIO() } catch { io = undefined }
        if (io) {
          io.to('admins').emit('review:ai:flagged', {
            reviewId,
            userId,
            aiResult: {
              severity: aiResult.severity,
              confidence: aiResult.confidence,
              suggestedAction: aiResult.suggestedAction,
              reason: aiResult.reason
            },
            downgraded: shouldAutoDowngrade
          })
        }
      } catch {
        // Socket emit failure không block
      }
    }
  }
}

const reviewAiModerationService = new ReviewAiModerationService()
export default reviewAiModerationService
