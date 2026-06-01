import axios from 'axios'
import { ObjectId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'
import databaseService from '~/services/database.services'
import { getIO } from '~/sockets/chat.socket'

type AiModerationSeverity = 'low' | 'medium' | 'high' | 'critical'
type AiModerationCategory =
  | 'pii'
  | 'spam'
  | 'toxic'
  | 'medical_harm'
  | 'harassment'
  | 'unsafe_advice'
  | 'self_harm'
  | 'other'

type AiModerationResult = {
  severity: AiModerationSeverity
  categories: AiModerationCategory[]
  confidence: number
  shouldHide: boolean
  requiresHumanReview: boolean
  reason: string
  suggestedAction: 'none' | 'review' | 'hide'
}

type RuleModerationResult = {
  severity?: string
  categories?: string[]
  confidence?: string | number
  reasons?: string[]
}

type AiModerationConfig = {
  autoEnabled: boolean
  configured: boolean
  baseUrl: string
  model: string
  apiKey?: string
  timeoutMs: number
  maxAttempts: number
  workerIntervalMs: number
  autoHideConfidence: number
  reviewConfidence: number
}

const PROMPT_VERSION = 'community-moderation-v1'
const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const PHONE_REGEX = /\b(\+84|0)(\d{9})\b/g
const CATEGORY_VALUES: AiModerationCategory[] = [
  'pii',
  'spam',
  'toxic',
  'medical_harm',
  'harassment',
  'unsafe_advice',
  'self_harm',
  'other'
]
const SEVERITY_VALUES: AiModerationSeverity[] = ['low', 'medium', 'high', 'critical']

function asNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function redactText(text: string) {
  return text.replace(EMAIL_REGEX, '[email]').replace(PHONE_REGEX, '[phone]')
}

function pickJson(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1] || raw
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start >= 0 && end > start) return candidate.slice(start, end + 1)
  return candidate
}

function normalizeResult(raw: any): AiModerationResult {
  const severity = SEVERITY_VALUES.includes(raw?.severity) ? raw.severity : 'low'
  const categories = Array.isArray(raw?.categories)
    ? raw.categories.filter((cat: string) => CATEGORY_VALUES.includes(cat as AiModerationCategory))
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
    suggestedAction
  }
}

function emitRoom(event: string, roomId: ObjectId | string, payload: unknown) {
  try {
    getIO().to(`community:room:${roomId.toString()}`).emit(event, payload)
  } catch {
    // Socket is optional for REST flows and tests.
  }
}

function emitUser(event: string, userId: ObjectId | string, payload: unknown) {
  try {
    getIO().to(`user:${userId.toString()}`).emit(event, payload)
  } catch {
    // Socket is optional for REST flows and tests.
  }
}

function emitAdmins(event: string, payload: unknown) {
  try {
    getIO().to('admins').emit(event, payload)
  } catch {
    // Socket is optional for REST flows and tests.
  }
}

class AiModerationService {
  private timer?: NodeJS.Timeout
  private running = false

  getConfig(): AiModerationConfig {
    const baseUrl = (process.env.AI_MODERATION_BASE_URL || process.env.CUSTOM_LLM_BASE_URL || '').replace(/\/$/, '')
    const apiKey = process.env.AI_MODERATION_API_KEY || process.env.CUSTOM_LLM_API_KEY
    const model = process.env.AI_MODERATION_MODEL || process.env.CUSTOM_LLM_MODEL || 'gemma-4-e4b-it.gguf'
    const autoEnabled = process.env.AI_MODERATION_ENABLED === 'true'

    return {
      autoEnabled,
      configured: Boolean(baseUrl && model),
      baseUrl,
      model,
      apiKey,
      timeoutMs: asNumber(process.env.AI_MODERATION_TIMEOUT_MS, 12000),
      maxAttempts: Math.max(1, asNumber(process.env.AI_MODERATION_MAX_ATTEMPTS, 3)),
      workerIntervalMs: Math.max(1000, asNumber(process.env.AI_MODERATION_WORKER_INTERVAL_MS, 5000)),
      autoHideConfidence: Math.max(0, Math.min(1, asNumber(process.env.AI_MODERATION_HIDE_CONFIDENCE, 0.78))),
      reviewConfidence: Math.max(0, Math.min(1, asNumber(process.env.AI_MODERATION_REVIEW_CONFIDENCE, 0.55)))
    }
  }

  async enqueueMessageReview(params: { message: any; ruleResult?: RuleModerationResult; force?: boolean }) {
    const config = this.getConfig()
    if ((!config.autoEnabled && !params.force) || !config.configured || !params.message?._id) return null

    const now = new Date()
    await databaseService.moderationAiJobs.updateOne(
      { messageId: params.message._id, promptVersion: PROMPT_VERSION },
      {
        $setOnInsert: {
          messageId: params.message._id,
          roomId: params.message.roomId,
          senderId: params.message.senderId,
          promptVersion: PROMPT_VERSION,
          createdAt: now,
          attempts: 0
        },
        $set: {
          status: 'pending',
          ruleResult: params.ruleResult,
          lastError: null,
          lockedUntil: null,
          updatedAt: now,
          ...(params.force ? { attempts: 0 } : {})
        }
      },
      { upsert: true }
    )

    return { messageId: params.message._id, promptVersion: PROMPT_VERSION, status: 'pending' }
  }

  async enqueueManualReview(messageId: ObjectId) {
    const config = this.getConfig()
    if (!config.configured) {
      throw new ErrorWithStatus({
        message: 'AI moderation chưa được cấu hình.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const message = await databaseService.communityMessages.findOne({ _id: messageId })
    if (!message) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy tin nhắn.', status: HTTP_STATUS.NOT_FOUND })
    }

    const queued = await this.enqueueMessageReview({ message, ruleResult: message.moderated, force: true })
    this.processPendingJobs(1).catch(() => {})
    return queued
  }

  startWorker() {
    const config = this.getConfig()
    if (!config.autoEnabled || !config.configured || this.timer) return

    this.timer = setInterval(() => {
      this.processPendingJobs(2).catch(() => {})
    }, config.workerIntervalMs)
    this.timer.unref?.()
  }

  async processPendingJobs(limit = 2) {
    if (this.running) return { processed: 0 }
    this.running = true
    let processed = 0

    try {
      for (let i = 0; i < limit; i += 1) {
        const result = await this.processNextJob()
        if (!result) break
        processed += 1
      }
      return { processed }
    } finally {
      this.running = false
    }
  }

  async processNextJob() {
    const config = this.getConfig()
    if (!config.configured) return null

    const now = new Date()
    const lockedUntil = new Date(Date.now() + Math.max(config.timeoutMs * 2, 30000))
    const job = await databaseService.moderationAiJobs.findOneAndUpdate(
      {
        status: 'pending',
        attempts: { $lt: config.maxAttempts },
        $or: [{ lockedUntil: null }, { lockedUntil: { $exists: false } }, { lockedUntil: { $lte: now } }]
      },
      {
        $set: { status: 'running', lockedUntil, updatedAt: now },
        $inc: { attempts: 1 }
      },
      { sort: { createdAt: 1 }, returnDocument: 'after' }
    )

    if (!job) return null

    try {
      const message = await databaseService.communityMessages.findOne({ _id: job.messageId })
      if (!message) throw new Error('Message not found for AI moderation job')

      const startedAt = Date.now()
      const aiResult = await this.reviewText(message.content || '', {
        roomId: message.roomId?.toString(),
        ruleResult: job.ruleResult
      })
      const latencyMs = Date.now() - startedAt
      const applied = await this.applyResult({ job, message, aiResult, latencyMs })

      await databaseService.moderationAiJobs.updateOne(
        { _id: job._id },
        {
          $set: {
            status: 'succeeded',
            aiResult,
            applied,
            latencyMs,
            updatedAt: new Date()
          },
          $unset: { lockedUntil: '', lastError: '' }
        }
      )

      return { jobId: job._id, aiResult, applied }
    } catch (error: any) {
      await databaseService.moderationAiJobs.updateOne(
        { _id: job._id },
        {
          $set: {
            status: 'failed',
            lastError: String(error?.message || error).slice(0, 500),
            lockedUntil: null,
            updatedAt: new Date()
          }
        }
      )
      return { jobId: job._id, failed: true }
    }
  }

  async reviewText(content: string, context?: { roomId?: string; ruleResult?: RuleModerationResult }) {
    const config = this.getConfig()
    if (!config.configured) throw new Error('AI moderation is not configured')

    const response = await axios.post(
      `${config.baseUrl}/chat/completions`,
      {
        model: config.model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You are a strict but careful Vietnamese healthcare community moderator. Return only valid JSON. Do not add markdown.'
          },
          {
            role: 'user',
            content: [
              'Review this community chat message for moderation.',
              'Categories allowed: pii, spam, toxic, medical_harm, harassment, unsafe_advice, self_harm, other.',
              'Severity allowed: low, medium, high, critical.',
              'Only set shouldHide=true for high confidence harmful content, PII, self-harm, or dangerous medical advice.',
              'Return JSON with keys: severity, categories, confidence, shouldHide, requiresHumanReview, reason, suggestedAction.',
              `Rule-based signal: ${JSON.stringify(context?.ruleResult || null)}`,
              `Room: ${context?.roomId || 'unknown'}`,
              `Message: ${redactText(content)}`
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
    if (!rawContent) throw new Error('AI moderation returned an empty response')

    return normalizeResult(JSON.parse(pickJson(rawContent)))
  }

  private async applyResult(params: { job: any; message: any; aiResult: AiModerationResult; latencyMs: number }) {
    const config = this.getConfig()
    const { job, message, aiResult, latencyMs } = params
    const now = new Date()
    const shouldAutoHide =
      aiResult.shouldHide &&
      (aiResult.severity === 'high' || aiResult.severity === 'critical') &&
      aiResult.confidence >= config.autoHideConfidence
    const shouldQueue =
      shouldAutoHide ||
      (aiResult.requiresHumanReview && aiResult.severity !== 'low' && aiResult.confidence >= config.reviewConfidence)

    await databaseService.communityMessages.updateOne(
      { _id: message._id },
      {
        $set: {
          updatedAt: now,
          'moderated.ai': {
            ...aiResult,
            model: config.model,
            promptVersion: PROMPT_VERSION,
            reviewedAt: now,
            latencyMs
          },
          ...(shouldAutoHide && message.status !== 'deleted'
            ? {
                status: 'hidden',
                'moderated.autoHidden': true,
                'moderated.aiAutoHidden': true
              }
            : {})
        }
      }
    )

    if (!shouldQueue) {
      return { queued: false, autoHidden: false }
    }

    const finding = await databaseService.moderationFindings.findOneAndUpdate(
      { messageId: message._id },
      {
        $setOnInsert: {
          roomId: message.roomId,
          messageId: message._id,
          senderId: message.senderId,
          reportCount: 0,
          createdAt: now
        },
        $set: {
          trigger: 'ai',
          status: 'open',
          severity: aiResult.severity,
          categories: aiResult.categories,
          confidence: aiResult.confidence,
          reasons: [`AI: ${aiResult.reason}`],
          ai: {
            ...aiResult,
            model: config.model,
            promptVersion: PROMPT_VERSION,
            reviewedAt: now,
            latencyMs
          },
          updatedAt: now
        }
      },
      { upsert: true, returnDocument: 'after' }
    )

    emitAdmins('community:moderation:queued', {
      findingId: finding?._id,
      roomId: message.roomId,
      messageId: message._id,
      trigger: 'ai'
    })

    if (shouldAutoHide) {
      const updatedMessage = await databaseService.communityMessages.findOne({ _id: message._id })
      emitRoom('community:message:hidden', message.roomId, updatedMessage)
      emitUser('community:message:hidden', message.senderId, updatedMessage)
    }

    return { queued: true, autoHidden: shouldAutoHide, findingId: finding?._id || job._id }
  }
}

const aiModerationService = new AiModerationService()
export default aiModerationService
export { PROMPT_VERSION as AI_MODERATION_PROMPT_VERSION, redactText }
