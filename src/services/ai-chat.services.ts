/**
 * ai-chat.services.ts
 * BE Proxy Service for AI Chat — Phase 3
 *
 * Responsibilities:
 *  1. Load conversation history từ MongoDB (source of truth)
 *  2. Redis-based rate limiting (30 msg/user/hour)
 *  3. Response dedup cache (3 phút TTL)
 *  4. Proxy HTTP request → AI Service (non-streaming)
 *  5. Proxy SSE stream → AI Service (streaming)
 *  6. Save AI reply vào MongoDB (async, non-blocking)
 */

import { ObjectId } from 'mongodb'
import crypto from 'crypto'
import databaseService from './database.services'
import chatsService from './chats.services'
import cacheService, { redis } from './cache.services'
import { MessageType } from '~/models/schemas/Message.schema'

// ── Config ────────────────────────────────────────────────────────────────────
const AI_SERVICE_URL = process.env.CHAT_AI_URL || 'http://localhost:8003'
const AI_TIMEOUT_MS = Number(process.env.CHAT_AI_TIMEOUT_MS || 60_000)
const AI_IMAGE_TIMEOUT_MS = Number(process.env.CHAT_AI_IMAGE_TIMEOUT_MS || 180_000)

// Rate limit: 30 messages/user/hour (Redis-based, survives restart)
const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW = 3600 // 1 giờ (seconds)

// Response dedup cache: 3 phút
const RESPONSE_CACHE_TTL = 180

// History: lấy tối đa 20 messages gần nhất (~10 lượt)
const HISTORY_LIMIT = 12

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AIContextProduct {
  mongoId: string
  name: string
  slug: string
  price: number
  imageUrl?: string
  unit?: string
  requiresPrescription?: boolean
}

export interface AIHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AIChatResponse {
  reply: string
  classification: string
  is_escalated: boolean
  products_suggested: Array<{
    mongoId: string
    name: string
    price: number
    slug: string
    imageUrl: string
    unit: string
    requiresPrescription?: boolean
  }>
  suggested_questions: string[]
}

// ── 1. Build History từ MongoDB ───────────────────────────────────────────────
/**
 * Load N messages gần nhất từ MongoDB và format thành history cho AI.
 * Bao gồm cả tin nhắn từ pharmacist thật — AI biết toàn bộ context.
 */
export async function buildHistory(conversationId: string, options: { excludeMessageId?: ObjectId | string } = {}): Promise<AIHistoryMessage[]> {
  try {
    const conversationObjectId = new ObjectId(conversationId)
    const filter: Record<string, any> = { conversationId: conversationObjectId }
    if (options.excludeMessageId) {
      filter._id = { $ne: typeof options.excludeMessageId === 'string' ? new ObjectId(options.excludeMessageId) : options.excludeMessageId }
    }

    const messages = await databaseService.messages
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(HISTORY_LIMIT)
      .toArray()

    // Reverse để oldest first, rồi map sang format AI
    return messages
      .reverse()
      .filter((m) => m.content && m.content.trim())
      .map((m) => ({
        role: (m.isAI || m.senderRole === 'pharmacist') ? 'assistant' : 'user',
        content: m.content.trim()
      }))
  } catch (err) {
    console.error('[AI Chat] buildHistory error:', err)
    return []
  }
}

// ── 2. Rate Limiting (Redis) ──────────────────────────────────────────────────
/**
 * Kiểm tra rate limit per user.
 * Returns: { allowed: boolean, remaining: number, resetIn: number }
 * Dùng Redis INCR + EXPIRE (atomic, survives restart)
 */
export async function checkAIRateLimit(
  userId: string
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const key = `rate:ai:${userId}`

  try {
    // INCR trả về giá trị sau khi tăng
    const count = await redis.incr(key)

    // Lần đầu tiên trong window → set TTL
    if (count === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW)
    }

    const ttl = await redis.ttl(key)
    const remaining = Math.max(0, RATE_LIMIT_MAX - count)

    return {
      allowed: count <= RATE_LIMIT_MAX,
      remaining,
      resetIn: ttl > 0 ? ttl : RATE_LIMIT_WINDOW
    }
  } catch {
    // Redis down → allow request (graceful degradation)
    return { allowed: true, remaining: RATE_LIMIT_MAX, resetIn: RATE_LIMIT_WINDOW }
  }
}

// ── 3. Response Cache ─────────────────────────────────────────────────────────
/**
 * Key: hash của conversationId + message (50 ký tự đầu)
 * TTL: 3 phút — đủ để dedup câu hỏi lặp lại trong cùng session
 */
function stableFingerprint(value: unknown): string {
  if (value === null || value === undefined) return 'none'
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
}

function normalizeMessage(message: string): string {
  return message.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()
}

function _buildCacheKey(params: {
  userId: string
  conversationId: string
  message: string
  medicalInfo?: Record<string, any> | null
  contextProducts?: AIContextProduct[]
  contextData?: Record<string, any> | null
}): string {
  const raw = JSON.stringify({
    userId: params.userId,
    conversationId: params.conversationId,
    message: normalizeMessage(params.message),
    medical: stableFingerprint(params.medicalInfo ?? null),
    products: stableFingerprint((params.contextProducts ?? []).map((p) => ({ id: p.mongoId, rx: p.requiresPrescription }))),
    context: stableFingerprint(params.contextData ?? null)
  })
  const hash = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24)
  return `ai:resp:${hash}`
}

export async function getResponseCache(
  userId: string,
  conversationId: string,
  message: string,
  medicalInfo: Record<string, any> | null = null,
  contextProducts: AIContextProduct[] = [],
  contextData: Record<string, any> | null = null
): Promise<AIChatResponse | null> {
  const key = _buildCacheKey({ userId, conversationId, message, medicalInfo, contextProducts, contextData })
  return cacheService.get<AIChatResponse>(key)
}

export async function setResponseCache(
  userId: string,
  conversationId: string,
  message: string,
  response: AIChatResponse,
  medicalInfo: Record<string, any> | null = null,
  contextProducts: AIContextProduct[] = [],
  contextData: Record<string, any> | null = null
): Promise<void> {
  const key = _buildCacheKey({ userId, conversationId, message, medicalInfo, contextProducts, contextData })
  // Fire-and-forget, không block response
  cacheService.set(key, response, RESPONSE_CACHE_TTL).catch(() => {})
}

// ── 4. Non-streaming: gọi AI và trả kết quả ──────────────────────────────────
export async function sendToAI(payload: {
  message: string
  conversation_id: string
  user_id: string
  history: AIHistoryMessage[]
  context_products?: AIContextProduct[]
  context_data?: Record<string, any> | null
  image_url?: string
}): Promise<AIChatResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), payload.image_url ? AI_IMAGE_TIMEOUT_MS : AI_TIMEOUT_MS)

  try {
    const response = await fetch(`${AI_SERVICE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: payload.message,
        conversation_id: payload.conversation_id,
        user_id: payload.user_id,
        history: payload.history,
        context_products: payload.context_products || [],
        context_data: payload.context_data ?? undefined,
        image_url: payload.image_url ?? undefined
      }),
      signal: controller.signal
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`AI Service error ${response.status}: ${errText}`)
    }

    return (await response.json()) as AIChatResponse
  } finally {
    clearTimeout(timeout)
  }
}

// ── 5. Save AI reply vào MongoDB (async, non-blocking) ────────────────────────
/**
 * Gọi sau khi nhận được response từ AI.
 * Không await — fire-and-forget để không block user.
 */
export function saveAIReplyAsync(
  conversationId: string,
  userMessage: string,
  aiResponse: AIChatResponse,
  senderId: string,
  options: { saveUserMessage?: boolean } = {}
): void {
  setImmediate(async () => {
    try {
      // 1. Save user message nếu chưa có
      // (Nếu FE đã lưu qua /messages thì skip, ở đây assume FE chưa lưu)
      const senderObjectId = new ObjectId(senderId)
      const convObjectId = new ObjectId(conversationId)

      if (options.saveUserMessage !== false) {
        await databaseService.messages.insertOne({
          _id: new ObjectId(),
          conversationId: convObjectId,
          senderId: senderObjectId,
          senderRole: 'customer',
          content: userMessage,
          type: MessageType.Text,
          isRead: false,
          isAI: false,
          createdAt: new Date(),
          updatedAt: new Date()
        } as any)
      }

      // 2. Save AI reply
      await chatsService.sendAIMessage(
        conversationId,
        aiResponse.reply,
        aiResponse.classification as any,
        MessageType.Text,
        undefined,
        aiResponse.products_suggested?.length > 0 ? aiResponse.products_suggested : undefined,
        aiResponse.suggested_questions?.length > 0 ? aiResponse.suggested_questions : undefined
      )
    } catch (err) {
      console.error('[AI Chat] saveAIReplyAsync error:', err)
      // Không throw — user đã nhận response rồi
    }
  })
}

// ── 6. SSE Streaming proxy ────────────────────────────────────────────────────
/**
 * Stream response từ AI Service về FE qua SSE.
 * Gọi trong controller với res.write() để forward chunks.
 *
 * AI service stream format:
 *   data: {"type":"chunk","content":"text..."}
 *   data: {"type":"done","reply":"...", "classification":"...", ...}
 *   data: [DONE]
 */
export async function streamFromAI(
  payload: {
    message: string
    conversation_id: string
    user_id: string
    history: AIHistoryMessage[]
    context_products?: AIContextProduct[]
    context_data?: Record<string, any> | null
    image_url?: string
  },
  onChunk: (chunk: string) => void,
  onDone: (response: AIChatResponse) => void,
  onError: (err: Error) => void
): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), payload.image_url ? AI_IMAGE_TIMEOUT_MS : AI_TIMEOUT_MS)

  try {
    const response = await fetch(`${AI_SERVICE_URL}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: payload.message,
        conversation_id: payload.conversation_id,
        user_id: payload.user_id,
        history: payload.history,
        context_products: payload.context_products || [],
        context_data: payload.context_data ?? undefined,
        image_url: payload.image_url ?? undefined
      }),
      signal: controller.signal
    })

    if (!response.ok || !response.body) {
      throw new Error(`AI Stream error ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalResponse: AIChatResponse | null = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // giữ lại dòng chưa hoàn chỉnh

      for (const line of lines) {
        if (!line.trim() || line.startsWith(':')) continue
        const raw = line.startsWith('data: ') ? line.slice(6).trim() : line.trim()
        if (raw === '[DONE]') continue

        try {
          const parsed = JSON.parse(raw)
          if (parsed.type === 'chunk' && parsed.content) {
            onChunk(`data: ${JSON.stringify({ type: 'chunk', content: parsed.content })}\n\n`)
          } else if (parsed.type === 'done') {
            finalResponse = parsed as AIChatResponse
            onChunk(`data: ${JSON.stringify({ type: 'done', ...parsed })}\n\n`)
          } else if (parsed.type === 'error') {
            throw new Error(parsed.message || parsed.content || 'AI stream error')
          }
        } catch (err) {
          if (err instanceof Error && err.message !== 'Unexpected end of JSON input') {
            throw err
          }
          // Malformed chunk — bỏ qua
        }
      }
    }

    if (finalResponse) {
      onDone(finalResponse)
    }
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  } finally {
    clearTimeout(timeout)
  }
}

