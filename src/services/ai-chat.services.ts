/**
 * ai-chat.services.ts
 * BE Proxy Service for AI Chat â€” Phase 3
 *
 * Responsibilities:
 *  1. Load conversation history tá»« MongoDB (source of truth)
 *  2. Redis-based rate limiting (30 msg/user/hour)
 *  3. Response dedup cache (3 phÃºt TTL)
 *  4. Proxy HTTP request â†’ AI Service (non-streaming)
 *  5. Proxy SSE stream â†’ AI Service (streaming)
 *  6. Save AI reply vÃ o MongoDB (async, non-blocking)
 */

import { ObjectId } from 'mongodb'
import crypto from 'crypto'
import databaseService from './database.services'
import chatsService from './chats.services'
import cacheService, { redis } from './cache.services'
import { MessageType } from '~/models/schemas/Message.schema'

// â”€â”€ Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const AI_SERVICE_URL = process.env.CHAT_AI_URL || 'http://localhost:8003'
const AI_TIMEOUT_MS = Number(process.env.CHAT_AI_TIMEOUT_MS || 60_000)
const AI_IMAGE_TIMEOUT_MS = Number(process.env.CHAT_AI_IMAGE_TIMEOUT_MS || 180_000)

// Rate limit: 30 messages/user/hour (Redis-based, survives restart)
const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW = 3600 // 1 giá» (seconds)

// Response dedup cache: 3 phÃºt
const RESPONSE_CACHE_TTL = 180

// History: láº¥y tá»‘i Ä‘a 20 messages gáº§n nháº¥t (~10 lÆ°á»£t)
const HISTORY_LIMIT = 12

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ 1. Build History tá»« MongoDB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Load N messages gáº§n nháº¥t tá»« MongoDB vÃ  format thÃ nh history cho AI.
 * Bao gá»“m cáº£ tin nháº¯n tá»« pharmacist tháº­t â€” AI biáº¿t toÃ n bá»™ context.
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

    // Reverse Ä‘á»ƒ oldest first, rá»“i map sang format AI
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

// â”€â”€ 2. Rate Limiting (Redis) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Kiá»ƒm tra rate limit per user.
 * Returns: { allowed: boolean, remaining: number, resetIn: number }
 * DÃ¹ng Redis INCR + EXPIRE (atomic, survives restart)
 */
export async function checkAIRateLimit(
  userId: string
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const key = `rate:ai:${userId}`

  try {
    // INCR tráº£ vá» giÃ¡ trá»‹ sau khi tÄƒng
    const count = await redis.incr(key)

    // Láº§n Ä‘áº§u tiÃªn trong window â†’ set TTL
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
    // Redis down â†’ allow request (graceful degradation)
    return { allowed: true, remaining: RATE_LIMIT_MAX, resetIn: RATE_LIMIT_WINDOW }
  }
}

// â”€â”€ 3. Response Cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Key: hash cá»§a conversationId + message (50 kÃ½ tá»± Ä‘áº§u)
 * TTL: 3 phÃºt â€” Ä‘á»§ Ä‘á»ƒ dedup cÃ¢u há»i láº·p láº¡i trong cÃ¹ng session
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
  // Fire-and-forget, khÃ´ng block response
  cacheService.set(key, response, RESPONSE_CACHE_TTL).catch(() => {})
}

// â”€â”€ 4. Non-streaming: gá»i AI vÃ  tráº£ káº¿t quáº£ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ 5. Save AI reply vÃ o MongoDB (async, non-blocking) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Gá»i sau khi nháº­n Ä‘Æ°á»£c response tá»« AI.
 * KhÃ´ng await â€” fire-and-forget Ä‘á»ƒ khÃ´ng block user.
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
      // 1. Save user message náº¿u chÆ°a cÃ³
      // (Náº¿u FE Ä‘Ã£ lÆ°u qua /messages thÃ¬ skip, á»Ÿ Ä‘Ã¢y assume FE chÆ°a lÆ°u)
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
      // KhÃ´ng throw â€” user Ä‘Ã£ nháº­n response rá»“i
    }
  })
}

// â”€â”€ 6. SSE Streaming proxy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Stream response tá»« AI Service vá» FE qua SSE.
 * Gá»i trong controller vá»›i res.write() Ä‘á»ƒ forward chunks.
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
      buffer = lines.pop() || '' // giá»¯ láº¡i dÃ²ng chÆ°a hoÃ n chá»‰nh

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
          // Malformed chunk â€” bá» qua
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

