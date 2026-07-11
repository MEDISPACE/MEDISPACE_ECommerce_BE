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
  mockEnabled: boolean
  baseUrl: string
  model: string
  apiKey?: string
  timeoutMs: number
  maxAttempts: number
  workerIntervalMs: number
  autoHideConfidence: number
  reviewConfidence: number
}

type AiJobStatus = 'pending' | 'running' | 'failed' | 'succeeded'

const PROMPT_VERSION = 'community-moderation-v1'
const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const PHONE_REGEX = /(?<!\w)(?:\+84|0)(?:[\s.-]?\d){9,10}\b/g
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

const VIETNAMESE_REASON_BY_CATEGORY: Record<AiModerationCategory, string> = {
  pii: 'nội dung có dấu hiệu chia sẻ thông tin cá nhân hoặc thông tin liên hệ',
  spam: 'nội dung có dấu hiệu quảng cáo, mua bán thuốc hoặc dẫn tới nguồn bán hàng đáng ngờ',
  toxic: 'nội dung có ngôn từ xúc phạm hoặc công kích người khác',
  medical_harm: 'nội dung có thể gây hại cho sức khỏe hoặc khuyến khích xử trí y tế nguy hiểm',
  harassment: 'nội dung có dấu hiệu quấy rối, miệt thị hoặc tấn công cá nhân',
  unsafe_advice: 'nội dung đưa ra lời khuyên y tế không an toàn',
  self_harm: 'nội dung có dấu hiệu tự hại hoặc khuyến khích tự hại',
  other: 'nội dung cần được điều phối viên xem xét'
}

function asNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function redactText(text: string) {
  return text.replace(EMAIL_REGEX, '[email]').replace(PHONE_REGEX, '[phone]')
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/(api[_-]?key=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, 500)
}

function mockReview(content: string): AiModerationResult {
  const lower = content.toLowerCase()
  if (lower.includes('[ai-hide]') || lower.includes('ai_e2e_hide')) {
    return {
      severity: 'high',
      categories: ['medical_harm'],
      confidence: 0.95,
      shouldHide: true,
      requiresHumanReview: true,
      reason: 'Mock AI hide result for e2e moderation',
      suggestedAction: 'hide'
    }
  }

  if (lower.includes('[ai-review]') || lower.includes('ai_e2e_review')) {
    return {
      severity: 'medium',
      categories: ['other'],
      confidence: 0.82,
      shouldHide: false,
      requiresHumanReview: true,
      reason: 'Mock AI review result for e2e moderation',
      suggestedAction: 'review'
    }
  }

  return {
    severity: 'low',
    categories: [],
    confidence: 0.05,
    shouldHide: false,
    requiresHumanReview: false,
    reason: 'Mock AI safe result for e2e moderation',
    suggestedAction: 'none'
  }
}

function pickJson(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1] || raw
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start >= 0 && end > start) return candidate.slice(start, end + 1)
  return candidate
}

function looksEnglish(text: string) {
  return /\b(message|contains|commercial|medicine|explicit|self[-\s]?harm|encouragement|violating|website|private|wholesale|pricing|buying|suspicious|safe|review|rules?)\b/i.test(text)
}

function normalizeVietnameseReason(rawReason: string, categories: AiModerationCategory[], severity: AiModerationSeverity) {
  const reason = rawReason.trim().slice(0, 500)
  if (reason && !looksEnglish(reason)) return reason

  if (severity === 'low' && categories.length === 0) return 'Nội dung an toàn, không phát hiện dấu hiệu vi phạm.'

  const parts = uniqueValues(categories).map((category) => VIETNAMESE_REASON_BY_CATEGORY[category]).filter(Boolean)
  if (parts.length === 0) return 'AI phát hiện nội dung cần được điều phối viên xem xét.'
  return `AI phát hiện ${parts.join('; ')}.`
}

function normalizeResult(raw: any): AiModerationResult {
  const severity = SEVERITY_VALUES.includes(raw?.severity) ? raw.severity : 'low'
  const categories = uniqueValues(
    Array.isArray(raw?.categories)
      ? raw.categories.filter((cat: string) => CATEGORY_VALUES.includes(cat as AiModerationCategory))
      : []
  ) as AiModerationCategory[]
  const confidence = Math.max(0, Math.min(1, Number(raw?.confidence ?? 0)))
  const shouldHide =
    typeof raw?.shouldHide === 'boolean'
      ? raw.shouldHide
      : (severity === 'high' || severity === 'critical') && confidence >= 0.75
  const requiresHumanReview = shouldHide
    ? true
    : typeof raw?.requiresHumanReview === 'boolean'
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

  const normalizedCategories = categories.length > 0 ? categories : severity === 'low' ? [] : ['other']

  return {
    severity,
    categories: normalizedCategories,
    confidence,
    shouldHide,
    requiresHumanReview,
    reason: normalizeVietnameseReason(String(raw?.reason || ''), normalizedCategories, severity),
    suggestedAction
  }
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function normalizeForPolicy(text: string) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function ensureCategories(categories: AiModerationCategory[], additions: AiModerationCategory[]) {
  return uniqueValues([...categories, ...additions]) as AiModerationCategory[]
}

function minSeverity(current: AiModerationSeverity, minimum: AiModerationSeverity): AiModerationSeverity {
  const currentIndex = SEVERITY_VALUES.indexOf(current)
  const minimumIndex = SEVERITY_VALUES.indexOf(minimum)
  return currentIndex >= minimumIndex ? current : minimum
}

function applyReviewPolicy(
  result: AiModerationResult,
  params: { severity?: AiModerationSeverity; categories?: AiModerationCategory[]; reason?: string }
): AiModerationResult {
  return {
    ...result,
    severity: params.severity ? minSeverity(result.severity, params.severity) : result.severity,
    categories: params.categories ? ensureCategories(result.categories, params.categories) : result.categories,
    shouldHide: false,
    requiresHumanReview: true,
    suggestedAction: 'review',
    reason: params.reason || result.reason
  }
}

function applyHidePolicy(
  result: AiModerationResult,
  params: { severity?: AiModerationSeverity; categories?: AiModerationCategory[]; reason?: string }
): AiModerationResult {
  return {
    ...result,
    severity: params.severity ? minSeverity(result.severity, params.severity) : result.severity,
    categories: params.categories ? ensureCategories(result.categories, params.categories) : result.categories,
    shouldHide: true,
    requiresHumanReview: true,
    suggestedAction: 'hide',
    reason: params.reason || result.reason
  }
}

function applyModerationPolicy(result: AiModerationResult, content: string): AiModerationResult {
  const text = normalizeForPolicy(content)
  const hasToxic = result.categories.includes('toxic') || result.categories.includes('harassment')

  const protectedGroupAttack =
    /\b(dan toc|nguoi dan toc|lgbt|dong tinh|chuyen gioi|ton giao|khuyet tat)\b/.test(text) &&
    /\b(toan|bon|b[o0]n|ban|b[aă]n|luoi|ngheo|cuc|cut|bien|do|rac|kinh|ghe)\b/.test(text)

  if (protectedGroupAttack) {
    return applyHidePolicy(result, {
      severity: 'high',
      categories: ['toxic', 'harassment'],
      reason: 'Nội dung có dấu hiệu miệt thị hoặc công kích một nhóm được bảo vệ.'
    })
  }

  const authorityMisinformation =
    /\b(bac si|duoc si|benh vien|chuyen gia)\b/.test(text) &&
    /\b(xac nhan|khang dinh|noi rieng|bao rieng)\b/.test(text) &&
    /(vac xin|vaccine|thuoc|ung thu|chua khoi|100%)/.test(text) &&
    /(co hai|hai|lua|lua dao|chua khoi|100%)/.test(text)

  if (authorityMisinformation) {
    return applyReviewPolicy(result, {
      severity: 'medium',
      categories: ['unsafe_advice'],
      reason: 'Nội dung viện dẫn chuyên môn y tế để đưa ra tuyên bố y tế chưa được kiểm chứng.'
    })
  }

  const commercialDefamation =
    /\b(nha thuoc|phong kham|benh vien|long chau|pharmacity|ankhang|an khang)\b/.test(text) &&
    /\b(ban thuoc gia|thuoc gia|hang gia|hang dom|lua dao|kem chat luong)\b/.test(text)

  if (commercialDefamation) {
    return applyReviewPolicy(result, {
      severity: 'medium',
      categories: ['other'],
      reason: 'Nội dung có cáo buộc nghiêm trọng về tổ chức hoặc nhà thuốc và cần điều phối viên xác minh.'
    })
  }

  const reportAbuseDescription =
    /\b(report|bao cao)\b/.test(text) &&
    /\b(hang loat|tru dap|brigading|nhieu tai khoan|cung report|tat ca bai)\b/.test(text)

  if (reportAbuseDescription) {
    return applyReviewPolicy(result, {
      severity: 'medium',
      categories: ['other'],
      reason: 'Nội dung mô tả dấu hiệu lạm dụng báo cáo hàng loạt và cần điều phối viên xem xét.'
    })
  }

  const sexualMedicine = /\b(thuoc kich duc|kich duc|tang cuong sinh ly|cuong duong|sung hon|loai manh)\b/.test(text)
  const commercialIntent = /\b(mua|ban|can gap|inbox|ib|chi minh rieng|gia|ship|zalo|lh)\b/.test(text)

  if (sexualMedicine && commercialIntent) {
    return applyHidePolicy(result, {
      severity: 'high',
      categories: ['spam', 'unsafe_advice'],
      reason: 'Nội dung có dấu hiệu tìm mua hoặc quảng bá thuốc kích dục/sinh lý không an toàn.'
    })
  }

  if (sexualMedicine && result.categories.includes('unsafe_advice') && result.confidence >= 0.8) {
    return applyReviewPolicy(result, {
      severity: 'medium',
      categories: ['unsafe_advice'],
      reason: 'Nội dung hỏi về thuốc kích dục/sinh lý và cần điều phối viên xem xét an toàn y tế.'
    })
  }

  if (hasToxic && result.confidence >= 0.85 && !result.shouldHide && !result.requiresHumanReview) {
    return applyReviewPolicy(result, {
      severity: 'medium',
      reason: 'Nội dung có ngôn từ xúc phạm hoặc công kích người khác và cần điều phối viên xem xét.'
    })
  }

  return result
}

function moderationEndpointCandidates(baseUrl: string, path: 'chat/completions' | 'completions') {
  const base = baseUrl.replace(/\/$/, '')
  const withoutV1 = base.replace(/\/v1$/, '')
  return uniqueValues([
    base.endsWith('/v1') ? `${base}/${path}` : `${base}/v1/${path}`,
    `${base}/${path}`,
    `${withoutV1}/v1/${path}`
  ])
}

function shouldTryNextEndpoint(error: unknown) {
  if (axios.isAxiosError(error)) {
    return error.response?.status === 404 || error.code === 'ECONNABORTED'
  }
  return false
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
    const mockEnabled = process.env.AI_MODERATION_MOCK === 'true'
    const model =
      process.env.AI_MODERATION_MODEL || process.env.CUSTOM_LLM_MODEL || (mockEnabled ? 'mock-ai-moderation' : 'gemma-4-e4b-it.gguf')
    const autoEnabled = process.env.AI_MODERATION_ENABLED === 'true'

    return {
      autoEnabled,
      configured: mockEnabled || Boolean(baseUrl && model),
      mockEnabled,
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
    const setOnInsert: Record<string, unknown> = {
      messageId: params.message._id,
      roomId: params.message.roomId,
      senderId: params.message.senderId,
      promptVersion: PROMPT_VERSION,
      createdAt: now
    }
    if (!params.force) setOnInsert.attempts = 0

    await databaseService.moderationAiJobs.updateOne(
      { messageId: params.message._id, promptVersion: PROMPT_VERSION },
      {
        $setOnInsert: setOnInsert,
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

  async getJobs(params: {
    page: number
    limit: number
    status?: AiJobStatus
    roomId?: ObjectId
    messageId?: ObjectId
    search?: string
  }) {
    const skip = (params.page - 1) * params.limit
    const match: any = {}
    if (params.status) match.status = params.status
    if (params.roomId) match.roomId = params.roomId
    if (params.messageId) match.messageId = params.messageId

    const pipeline: any[] = [
      { $match: match },
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
          from: process.env.DB_COMMUNITY_MESSAGES_COLLECTION || 'communityMessages',
          localField: 'messageId',
          foreignField: '_id',
          as: 'message'
        }
      },
      { $unwind: { path: '$message', preserveNullAndEmptyArrays: true } }
    ]

    const search = params.search?.trim()
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i')
      pipeline.push({
        $match: {
          $or: [{ 'room.name': regex }, { 'room.slug': regex }, { 'message.content': regex }, { lastError: regex }]
        }
      })
    }

    pipeline.push({
      $facet: {
        items: [
          { $sort: { updatedAt: -1, createdAt: -1 } },
          { $skip: skip },
          { $limit: params.limit },
          {
            $project: {
              roomId: 1,
              messageId: 1,
              senderId: 1,
              promptVersion: 1,
              status: 1,
              attempts: 1,
              lastError: 1,
              lockedUntil: 1,
              latencyMs: 1,
              aiResult: 1,
              applied: 1,
              createdAt: 1,
              updatedAt: 1,
              room: { _id: 1, name: 1, slug: 1, visibility: 1, diseaseKey: 1 },
              message: { _id: 1, content: 1, status: 1, createdAt: 1 }
            }
          }
        ],
        total: [{ $count: 'count' }]
      }
    })

    const [result] = await databaseService.moderationAiJobs.aggregate(pipeline).toArray()
    return {
      items: result?.items || [],
      page: params.page,
      limit: params.limit,
      total: result?.total?.[0]?.count || 0
    }
  }

  async retryJob(jobId: ObjectId) {
    const config = this.getConfig()
    if (!config.configured) {
      throw new ErrorWithStatus({
        message: 'AI moderation chưa được cấu hình.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const job = await databaseService.moderationAiJobs.findOne({ _id: jobId })
    if (!job) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy AI moderation job.', status: HTTP_STATUS.NOT_FOUND })
    }

    await databaseService.moderationAiJobs.updateOne(
      { _id: jobId },
      {
        $set: {
          status: 'pending',
          attempts: 0,
          lockedUntil: null,
          lastError: null,
          updatedAt: new Date()
        }
      }
    )
    this.processPendingJobs(1).catch(() => {})
    return { jobId, status: 'pending' }
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
            lastError: safeErrorMessage(error),
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
    if (config.mockEnabled) return mockReview(content)

    const systemPrompt =
      'You are a strict but careful Vietnamese healthcare community moderator. Return only valid JSON. Do not add markdown. The reason field must always be written in Vietnamese.'
    const userPrompt = [
      'Review this community chat message for moderation.',
      'Categories allowed: pii, spam, toxic, medical_harm, harassment, unsafe_advice, self_harm, other.',
      'Severity allowed: low, medium, high, critical.',
      'Set shouldHide=true when the message contains PII/contact sharing, self-harm intent, dangerous medical advice, advice to delay/avoid emergency care for severe symptoms, prescription/drug misuse, overdose intent, or medicine-sale spam.',
      'Set requiresHumanReview=true for toxic personal attacks, harassment, unverified accusations against clinics/pharmacies, suspected report abuse, or medical claims that cite doctors/hospitals without verifiable evidence.',
      'Set shouldHide=true for attacks against protected groups such as ethnicity, religion, disability, gender identity, or sexual orientation.',
      'Use self_harm for intent to die, not wake up, overdose, or consume sleeping pills/medicine for self-harm.',
      'Use medical_harm and unsafe_advice for advice that could endanger health, including telling someone with chest pain, breathing trouble, stroke symptoms, seizure, loss of consciousness, or heavy bleeding not to seek emergency care.',
      'Use spam for commercial promotion, medicine-sale links/domains, wholesale pricing, inbox-for-price, or suspicious pharmacy sales.',
      'Use toxic or harassment for insults, commands to leave the group, slurs, or hostile language toward a person or protected group.',
      'Safe general health questions should be severity=low, shouldHide=false.',
      'Return JSON with keys: severity, categories, confidence, shouldHide, requiresHumanReview, reason, suggestedAction.',
      'The reason value must be one concise Vietnamese sentence for moderators. Never write reason in English.',
      'Example safe response: {"severity":"low","categories":[],"confidence":0.05,"shouldHide":false,"requiresHumanReview":false,"reason":"Nội dung an toàn, không phát hiện dấu hiệu vi phạm.","suggestedAction":"none"}',
      `Rule-based signal: ${JSON.stringify(context?.ruleResult || null)}`,
      `Room: ${context?.roomId || 'unknown'}`,
      `Message: ${redactText(content)}`
    ].join('\n')
    const headers = {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
    }
    let lastError: unknown

    for (const url of moderationEndpointCandidates(config.baseUrl, 'chat/completions')) {
      try {
        const response = await axios.post(
          url,
          {
            model: config.model,
            temperature: 0,
            max_tokens: 350,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ]
          },
          { timeout: config.timeoutMs, headers }
        )
        const rawContent = response.data?.choices?.[0]?.message?.content
        if (!rawContent) continue
        return applyModerationPolicy(normalizeResult(JSON.parse(pickJson(rawContent))), content)
      } catch (error) {
        lastError = error
        if (!shouldTryNextEndpoint(error)) throw error
      }
    }

    let rawContent = ''
    for (const url of moderationEndpointCandidates(config.baseUrl, 'completions')) {
      try {
        const response = await axios.post(
          url,
          {
            model: config.model,
            temperature: 0,
            max_tokens: 350,
            prompt: `${systemPrompt}\n\n${userPrompt}\n\nJSON:`
          },
          { timeout: config.timeoutMs, headers }
        )
        rawContent = response.data?.choices?.[0]?.text || response.data?.choices?.[0]?.message?.content || ''
        if (!rawContent) continue
        break
      } catch (error) {
        lastError = error
        if (!shouldTryNextEndpoint(error)) throw error
      }
    }

    if (!rawContent) throw new Error('AI moderation returned an empty response')

    try {
      return applyModerationPolicy(normalizeResult(JSON.parse(pickJson(rawContent))), content)
    } catch (error) {
      if (lastError) throw lastError
      throw error
    }
  }

  private async applyResult(params: { job: any; message: any; aiResult: AiModerationResult; latencyMs: number }) {
    const config = this.getConfig()
    const { job, message, aiResult, latencyMs } = params
    const now = new Date()
    const shouldAutoHide =
      aiResult.shouldHide &&
      aiResult.severity !== 'low' &&
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

    const aiModerationPayload = {
      ...aiResult,
      model: config.model,
      promptVersion: PROMPT_VERSION,
      reviewedAt: now,
      latencyMs
    }

    await databaseService.moderationFindings.updateOne(
      { messageId: message._id },
      {
        $set: {
          ai: aiModerationPayload,
          updatedAt: now
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
          ai: aiModerationPayload,
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
