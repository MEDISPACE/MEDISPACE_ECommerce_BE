import { Server as SocketIOServer, Socket } from 'socket.io'
import { Server as HTTPServer } from 'http'
import { createAdapter } from '@socket.io/redis-adapter'
import { verifyToken } from '~/utils/jwt'
import { TokenPayload } from '~/models/requests/User.request'
import chatsService from '~/services/chats.services'
import databaseService from '~/services/database.services'
import typesenseService from '~/services/typesense.services'
import { redis } from '~/services/cache.services'
import { ObjectId } from 'mongodb'
import { config } from 'dotenv'
import { USERS_MESSAGES, CHATS_MESSAGES } from '~/constants/message'
import { TokenType, UserRole, UserStatus } from '~/constants/enum'
import { COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS } from '~/constants/communityVideoEvents'
import communityVideoEventAccessService from '~/services/communityVideoEventAccess.services'

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const GREETING_RESPONSE = 'Chào bạn, mình là Trợ lý Sức khỏe AI của Medispace. Mình có thể hỗ trợ bạn tra cứu thông tin thuốc, sản phẩm, đơn hàng hoặc hướng dẫn kết nối Dược sĩ khi cần. Bạn cần mình hỗ trợ gì hôm nay?'

function normalizeVietnameseText(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function isSimpleGreeting(content?: string, imageUrl?: string): boolean {
  if (imageUrl) return false
  const normalized = normalizeVietnameseText(content || '').replace(/[!?.。\s]+$/g, '')
  return /^(chao|chao ban|xin chao|hello|hi|hey|alo|aloo|medispace oi)$/.test(normalized)
}

config()

// ── Intent keyword detection (nhanh, không cần gọi LLM) ───────────────────────
const ORDER_KEYWORDS = [
  'đơn hàng', 'ord-', 'đặt hàng', 'giao hàng', 'vận chuyển', 'tracking',
  'đến đâu', 'bao giờ giao', 'tình trạng đơn', 'trạng thái đơn',
  'đã mua', 'lịch sử mua', 'mua gì', 'mua ngày', 'hóa đơn'
]
const LOYALTY_KEYWORDS = [
  'điểm thưởng', 'điểm tích lũy', 'hạng thành viên', 'thành viên',
  'hạng bạc', 'hạng vàng', 'hạng kim', 'loyalty', 'tích điểm',
  'bao nhiêu điểm', 'còn điểm', 'điểm của tôi'
]

function detectContextIntent(message: string): 'order' | 'loyalty' | null {
  const lower = message.toLowerCase()
  if (ORDER_KEYWORDS.some(kw => lower.includes(kw))) return 'order'
  if (LOYALTY_KEYWORDS.some(kw => lower.includes(kw))) return 'loyalty'
  return null
}

// ── Extract order numbers từ message (e.g. ORD-1767014893436-927 hoặc DH...) ──
function extractOrderNumbers(message: string): string[] {
  // Match ORD-xxx và DH-xxx patterns
  const matches = message.match(/(?:ORD|DH)[-\w]+/gi) || []
  return [...new Set(matches.map(m => m.toUpperCase()))]
}

// ── Fetch real user data từ MongoDB để inject vào AI context ──────────────────
async function fetchUserContextData(
  userId: string,
  intent: 'order' | 'loyalty',
  message: string = ''
): Promise<Record<string, any> | null> {
  try {
    if (intent === 'order') {
      const mentionedOrderNumbers = extractOrderNumbers(message)
      console.log('[Socket] fetchUserContextData | userId:', userId, '| mentioned orders:', mentionedOrderNumbers)

      // 1. Lấy 5 đơn hàng gần nhất của user đang login
      const recentOrders = await databaseService.orders
        .find({ userId: new ObjectId(userId) })
        .sort({ createdAt: -1 })
        .limit(5)
        .toArray()

      // 2. Nếu user nhắc đến orderNumber cụ thể → tìm thêm đơn đó
      let mentionedOrders: any[] = []
      if (mentionedOrderNumbers.length > 0) {
        mentionedOrders = await databaseService.orders
          .find({
            orderNumber: { $in: mentionedOrderNumbers },
            userId: new ObjectId(userId)   // Chỉ lấy nếu thuộc user này
          })
          .toArray()

        // Log nếu order tồn tại nhưng không thuộc user này
        if (mentionedOrders.length === 0 && mentionedOrderNumbers.length > 0) {
          const anyMatch = await databaseService.orders.findOne({
            orderNumber: { $in: mentionedOrderNumbers }
          })
          if (anyMatch) {
            console.log('[Socket] Order', mentionedOrderNumbers, 'tồn tại nhưng thuộc user khác')
          } else {
            console.log('[Socket] Order', mentionedOrderNumbers, 'không tồn tại trong DB')
          }
        }
      }

      // 3. Merge: ưu tiên đơn được nhắc đến, sau đó recent orders
      const allOrders = [...mentionedOrders]
      for (const o of recentOrders) {
        if (!allOrders.find((x: any) => x._id?.toString() === o._id?.toString())) {
          allOrders.push(o)
        }
      }

      if (!allOrders.length) {
        // Không có đơn nào → trả về flag để AI biết user chưa có đơn
        return { orders: [], purchaseHistory: [], noOrdersFound: true }
      }

      const formattedOrders = allOrders.slice(0, 5).map((o: any) => ({
        _id: o._id?.toString(),
        orderCode: o.orderNumber,
        status: o.orderStatus,
        totalAmount: o.totalAmount || 0,
        createdAt: o.createdAt
          ? new Date(o.createdAt).toLocaleDateString('vi-VN')
          : 'N/A',
        trackingCode: o.trackingNumber || null,
        items: (o.items || []).slice(0, 3).map((item: any) => ({
          name: item.name || 'Sản phẩm',
          quantity: item.quantity || 1,
          price: item.unitPrice || 0
        }))
      }))

      const purchaseHistory: any[] = []
      for (const o of allOrders.slice(0, 5)) {
        const date = o.createdAt
          ? new Date(o.createdAt).toLocaleDateString('vi-VN')
          : 'N/A'
        for (const item of (o.items || []).slice(0, 3)) {
          purchaseHistory.push({
            date,
            orderCode: o.orderNumber,
            productName: item.name || 'Sản phẩm',
            quantity: item.quantity || 1
          })
        }
      }

      return { orders: formattedOrders, purchaseHistory }
    }

    if (intent === 'loyalty') {
      const account = await databaseService.loyaltyAccounts.findOne(
        { userId: new ObjectId(userId) }
      )
      if (!account) return null
      return {
        loyalty: {
          points: account.pointsBalance || 0,
          tier: account.tier || 'member',
          totalSpent: account.totalSpent || 0
        }
      }
    }
  } catch (err) {
    console.error('[Socket] fetchUserContextData error:', err)
  }
  return null
}

// ── Socket Rate Limiting ─────────────────────────────────────────────────────
const SOCKET_RATE_LIMIT_MAX = 15
const SOCKET_RATE_LIMIT_WINDOW_MS = 60_000
const socketMessageCounts = new Map<string, { count: number; resetAt: number }>()
const SOCKET_MESSAGE_TYPES = new Set(['text', 'image', 'product'])

function checkSocketRateLimit(userId: string): boolean {
  const now = Date.now()
  const record = socketMessageCounts.get(userId)

  if (!record || now > record.resetAt) {
    socketMessageCounts.set(userId, { count: 1, resetAt: now + SOCKET_RATE_LIMIT_WINDOW_MS })
    return true
  }

  if (record.count >= SOCKET_RATE_LIMIT_MAX) {
    return false
  }

  record.count++
  return true
}

function validateSocketMessagePayload(
  data: any,
  role: 'customer' | 'pharmacist' | 'admin'
): { ok: true } | { ok: false; message: string } {
  if (!data || typeof data !== 'object') return { ok: false, message: 'Dữ liệu tin nhắn không hợp lệ' }
  if (data.conversationId && !ObjectId.isValid(data.conversationId)) return { ok: false, message: 'Cuộc trò chuyện không hợp lệ' }
  const type = data.type || 'text'
  if (!SOCKET_MESSAGE_TYPES.has(type)) return { ok: false, message: 'Loại tin nhắn không hợp lệ' }
  if (typeof data.content === 'string' && data.content.length > 2000) {
    return { ok: false, message: 'Nội dung tin nhắn không được vượt quá 2000 ký tự' }
  }
  if (type === 'product' && role !== 'pharmacist') {
    return { ok: false, message: 'Chỉ dược sĩ mới có thể gửi thẻ sản phẩm' }
  }
  if (type !== 'product' && !data.content && !data.imageUrl) {
    return { ok: false, message: 'Nội dung tin nhắn không được để trống' }
  }
  return { ok: true }
}

interface AuthenticatedSocket extends Socket {
  userId?: string
  userRole?: 'customer' | 'pharmacist' | 'admin'
}

const socketChatRole = (socket: AuthenticatedSocket) => socket.userRole || 'customer'

async function assertSocketConversationAccess(socket: AuthenticatedSocket, conversationId: string) {
  if (!socket.userId || !socket.userRole || !ObjectId.isValid(conversationId)) {
    throw new Error('Access denied')
  }
  return chatsService.assertConversationAccess(conversationId, socket.userId, socketChatRole(socket))
}

let _io: SocketIOServer | null = null

export const getIO = (): SocketIOServer => {
  if (!_io) throw new Error('Socket.IO not initialized')
  return _io
}

export const initChatSocket = (httpServer: HTTPServer) => {
  const allowedOrigins = (process.env.FRONTEND_URLS || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)

  _io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins.length > 0 ? allowedOrigins : true,
      credentials: true,
      methods: ['GET', 'POST']
    }
  })
  const io = _io

  if (process.env.SOCKET_IO_REDIS_ADAPTER !== 'false') {
    const pubClient = redis.duplicate()
    const subClient = redis.duplicate()
    Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
        io.adapter(createAdapter(pubClient, subClient))
        console.log('[Socket.IO] Redis adapter enabled')
      })
      .catch((error) => {
        console.warn('[Socket.IO] Redis adapter unavailable; using local adapter:', error?.message || error)
      })
  }

  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token
      if (!token) {
        return next(new Error('Authentication error'))
      }

      const decoded = (await verifyToken({
        token,
        secretOrPublicKey: process.env.JWT_SECRET_ACCESS_TOKEN as string
      })) as TokenPayload

      if (decoded.tokenType !== TokenType.AccessToken) {
        return next(new Error(USERS_MESSAGES.INVALID_ACCESS_TOKEN))
      }

      const user = await databaseService.users.findOne(
        { _id: new ObjectId(decoded.userId) },
        { projection: { role: 1, status: 1 } }
      )

      if (!user || user.status === UserStatus.Banned) {
        return next(new Error(USERS_MESSAGES.UNAUTHENTICATED))
      }

      socket.userId = decoded.userId
      if (user.role === UserRole.Pharmacist) socket.userRole = 'pharmacist'
      else if (user.role === UserRole.Admin) socket.userRole = 'admin'
      else socket.userRole = 'customer'

      next()
    } catch (error) {
      next(new Error(USERS_MESSAGES.UNAUTHENTICATED))
    }
  })

  // Connection handler
  io.on('connection', async (socket: AuthenticatedSocket) => {
    // --- FIX 3.4: dùng atomic increment thay bool để handle đa tab ---
    // Pharmacist availability is controlled manually from /pharmacist/online-status.
    // Socket presence must not overwrite that preference during refresh/reconnect.
    if (socket.userId) {
      if (socket.userRole === 'pharmacist') {
        await databaseService.users.updateOne(
          { _id: new ObjectId(socket.userId) },
          {
            $inc: { onlineCount: 1 },
            $set: { updatedAt: new Date() }
          }
        )
      } else {
        await databaseService.users.updateOne(
          { _id: new ObjectId(socket.userId) },
          {
            $inc: { onlineCount: 1 },
            $set: { isOnline: true, updatedAt: new Date() }
          }
        )
      }

      // Broadcast online status
      io.emit('user:online', { userId: socket.userId })

      // Join personal room
      socket.join(`user:${socket.userId}`)

      // Pharmacists also join shared pharmacist room
      if (socket.userRole === 'pharmacist') {
        socket.join('pharmacists')
      }
      // Admins join shared admin room
      if (socket.userRole === 'admin') {
        socket.join('admins')
      }
    }

    // Manual join personal room (Backup)
    socket.on('user:join', () => {
      if (socket.userId) {
        socket.join(`user:${socket.userId}`)
        if (socket.userRole === 'pharmacist') {
          socket.join('pharmacists')
        }
        if (socket.userRole === 'admin') {
          socket.join('admins')
        }
      }
    })

    // Join conversation room
    socket.on('conversation:join', async (conversationId: string) => {
      try {
        await assertSocketConversationAccess(socket, conversationId)
        socket.join(`conversation:${conversationId}`)
      } catch {
        socket.emit('error', { message: 'Access denied' })
      }
    })

    // Leave conversation room
    socket.on('conversation:leave', (conversationId: string) => {
      if (ObjectId.isValid(conversationId)) {
        socket.leave(`conversation:${conversationId}`)
      }
    })

    socket.on('community:room:join', async (roomId: string, ack?: (payload: { ok: boolean; roomId?: string; message?: string }) => void) => {
      try {
        if (!socket.userId || !ObjectId.isValid(roomId)) {
          ack?.({ ok: false, message: 'roomId không hợp lệ' })
          return
        }
        const roomObjectId = new ObjectId(roomId)
        const userObjectId = new ObjectId(socket.userId)
        const room = await databaseService.communityRooms.findOne({ _id: roomObjectId, status: 'active' })
        const member = await databaseService.communityRoomMembers.findOne({ roomId: roomObjectId, userId: userObjectId })
        const canAccess = socket.userRole === 'admin' || (Boolean(room) && member?.status === 'active')
        if (!canAccess) {
          socket.emit('error', { message: 'Bạn chưa tham gia phòng cộng đồng này.' })
          ack?.({ ok: false, message: 'Bạn chưa tham gia phòng cộng đồng này.' })
          return
        }
        socket.join(`community:room:${roomId}`)
        ack?.({ ok: true, roomId })
      } catch {
        socket.emit('error', { message: 'Không thể tham gia kênh realtime cộng đồng.' })
        ack?.({ ok: false, message: 'Không thể tham gia kênh realtime cộng đồng.' })
      }
    })

    socket.on('community:room:leave', (roomId: string) => {
      socket.leave(`community:room:${roomId}`)
    })

    socket.on(COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS.JOIN_ROOM, async (eventId: string, ack?: (payload: { ok: boolean; eventId?: string; message?: string }) => void) => {
      try {
        if (!socket.userId || !ObjectId.isValid(eventId)) {
          ack?.({ ok: false, message: 'eventId kh?ng h?p l?' })
          return
        }
        const eventObjectId = new ObjectId(eventId)
        const userObjectId = new ObjectId(socket.userId)
        const role = socket.userRole === 'admin'
          ? UserRole.Admin
          : socket.userRole === 'pharmacist'
            ? UserRole.Pharmacist
            : UserRole.Customer
        await communityVideoEventAccessService.assertCanSubscribeRealtime(eventObjectId, { userId: userObjectId, role })
        socket.join(`community:video-event:${eventId}`)
        ack?.({ ok: true, eventId })
      } catch (error) {
        console.error('[Socket] community video event join failed', { eventId, userId: socket.userId, error })
        ack?.({ ok: false, message: 'Kh?ng th? tham gia k?nh realtime h?i th?o.' })
      }
    })

    socket.on(COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS.LEAVE_ROOM, (eventId: string) => {
      socket.leave(`community:video-event:${eventId}`)
    })

    // --- FIX 3.2: emit gọn lại – chỉ dùng room-based, bỏ fetchSockets loop ---
    socket.on(
      'message:send',
      async (data: {
        conversationId?: string
        pharmacistId?: string
        content?: string
        type?: 'text' | 'image' | 'product'
        imageUrl?: string
        productRef?: any
        aiMode?: boolean // <-- AI Hub flag
      }) => {
        try {
          if (!socket.userId || !socket.userRole) {
            socket.emit('error', { message: USERS_MESSAGES.UNAUTHENTICATED })
            return
          }

          // Admin không gửi tin nhắn qua socket này
          if (socket.userRole === 'admin') return

          const validation = validateSocketMessagePayload(data, socket.userRole)
          if (!validation.ok) {
            socket.emit('error', { message: validation.message })
            return
          }

          // ── Rate Limit Check (Redis-backed cho AI, in-memory cho non-AI) ────────
          if (!checkSocketRateLimit(socket.userId)) {
            socket.emit('error', { message: 'Bạn đang gửi tin nhắn quá nhanh. Vui lòng chờ một chút trước khi gửi tiếp.' })
            return
          }

          const message = await chatsService.sendMessage(socket.userId, socket.userRole, data as any)

          const convIdStr = message.conversationId.toString()

          // 1. Gửi đến conversation room (tất cả đang xem conversation này)
          io.to(`conversation:${convIdStr}`).emit('message:new', message)

          if (socket.userRole === 'customer') {
            const conversation = await databaseService.conversations.findOne({
              _id: new ObjectId(convIdStr)
            })

            if (conversation?.pharmacistId) {
              io.to(`user:${conversation.pharmacistId.toString()}`).emit('message:new', message)
            } else {
              // Chỉ phát lên hàng chờ chung khi conversation chưa có dược sĩ phụ trách.
              io.to('pharmacists').emit('message:new', message)
            }

            // Detect tin nhắn đầu tiên → notify admin realtime
            const msgCount = await databaseService.messages.countDocuments({
              conversationId: new ObjectId(convIdStr)
            })
            if (msgCount === 1) {
              io.to('admins').emit('conversation:new', { conversationId: convIdStr })
            }

            if (conversation) {
              if (conversation.type === 'ai') {
                // Fast path for simple greetings: no RAG, no LLM slot, near-instant response.
                if (isSimpleGreeting(data.content, data.imageUrl)) {
                  const aiMessage = await chatsService.sendAIMessage(
                    convIdStr,
                    GREETING_RESPONSE,
                    'general'
                  )
                  io.to(`conversation:${convIdStr}`).emit('message:new', aiMessage)
                  io.to(`conversation:${convIdStr}`).emit('message:stream:done', { conversationId: convIdStr })
                  io.to('pharmacists').emit('message:new', aiMessage)
                  return
                }

                // Khách hàng đang ở AI Mode
                try {
                  // 1. Lấy lịch sử hội thoại (Conversation Memory) - tối đa 6 tin nhắn trước tin nhắn hiện tại
                  const dbMessages = await databaseService.messages
                    .find({
                      conversationId: new ObjectId(convIdStr),
                      _id: { $ne: message._id }
                    })
                    .sort({ createdAt: -1 })
                    .limit(6)
                    .toArray()

                  // FIX: Include ALL message types (customer + AI + pharmacist)
                  // Pharmacist messages → 'assistant' role (AI biết DS đã nói gì)
                  const history = dbMessages
                    .reverse()
                    .filter((m: any) => m.type === 'text' && m.content?.trim())
                    .map((m: any) => ({
                      role: m.senderRole === 'customer' ? 'user' : 'assistant',
                      content: m.content.trim()
                    }))

                  // 2. Tìm kiếm sản phẩm liên quan (RAG) - Chỉ lấy sản phẩm không kê đơn (requiresPrescription: false)
                  let contextProducts: any[] = []
                  try {
                    let tsResult = await typesenseService.searchProducts({
                      q: data.content || '',
                      limit: 6, // Tăng từ 3 → 6 (Task 2.3) để AI có context phong phú hơn
                      inStock: true,
                      requiresPrescription: undefined
                    })

                    let hits = tsResult?.hits
                    if (!tsResult) {
                      // Fallback MongoDB
                      const query = data.content || ''
                      const mongoFilter: Record<string, any> = {
                        isActive: true,
                        requiresPrescription: { $in: [true, false] },
                        stockQuantity: { $gt: 0 }
                      }
                      if (query) {
                        const safeQuery = escapeRegex(query)
                        mongoFilter.$or = [
                          { name: { $regex: safeQuery, $options: 'i' } },
                          { sku: { $regex: safeQuery, $options: 'i' } }
                        ]
                      }
                      const products = await databaseService.products
                        .find(mongoFilter)
                        .sort({ rating: -1 })
                        .limit(3)
                        .toArray()
                      hits = products.map((p) => ({ document: p }))
                    }

                    contextProducts = hits?.map((h: any) => {
                      const doc = h.document
                      const defaultVariant = doc.priceVariants?.find((v: any) => v.isDefault) || doc.priceVariants?.[0]
                      const unit = defaultVariant?.unit || 'Sản phẩm'
                      return {
                        mongoId: doc.mongoId || doc._id?.toString() || '',
                        name: doc.name,
                        price: doc.price || defaultVariant?.price || 0,
                        activeIngredients: doc.activeIngredients || doc.details?.activeIngredients || '',
                        indications: doc.indications || doc.details?.indications || '',
                        slug: doc.slug || '',
                        imageUrl: doc.featuredImage || '',
                        unit: unit,
                        requiresPrescription: Boolean(doc.requiresPrescription)
                      }
                    }) || []
                  } catch (tsErr) {
                    console.error('[Socket] Error fetching RAG products:', tsErr)
                  }

                  const aiServiceUrl = process.env.CHAT_AI_URL || 'http://localhost:8003'

                  // ── Phase 3: Fetch real user data (orders, loyalty) để inject vào AI ──
                  const contextIntent = detectContextIntent(data.content || '')
                  let contextData: Record<string, any> | null = null
                  if (contextIntent) {
                    contextData = await fetchUserContextData(socket.userId, contextIntent, data.content || '')
                  }

                  const aiRes = await fetch(`${aiServiceUrl}/chat/stream`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      message: data.content || '',
                      conversation_id: convIdStr,
                      user_id: socket.userId,
                      history,
                      context_products: contextProducts,
                      context_data: contextData || undefined,
                      image_url: data.imageUrl || undefined
                    }),
                    signal: AbortSignal.timeout(data.imageUrl ? 180000 : 65000)
                  })

                  if (!aiRes.body) throw new Error("No response body from AI stream");

                  const reader = aiRes.body.getReader()
                  const decoder = new TextDecoder()
                  let aiData: any = null
                  let streamError: Error | null = null
                  let buffer = ''

                  // Emit streaming start
                  io.to(`conversation:${convIdStr}`).emit('message:stream:start', { conversationId: convIdStr })

                  while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    buffer += decoder.decode(value, { stream: true })
                    const lines = buffer.split('\n')
                    buffer = lines.pop() || ''

                    for (const line of lines) {
                      // Bỏ qua comment lines (SSE heartbeat: ': heartbeat')
                      if (!line.trim() || line.startsWith(':')) continue
                      // Bỏ qua [DONE] terminator
                      if (line === 'data: [DONE]') continue

                      // FIX BUG: SSE format là 'data: {...}' — phải strip prefix 'data: '
                      let jsonStr = line
                      if (line.startsWith('data: ')) {
                        jsonStr = line.slice(6).trim()
                      }
                      if (!jsonStr) continue

                      try {
                        const parsed = JSON.parse(jsonStr)
                        if (parsed.type === 'chunk' && parsed.content) {
                          io.to(`conversation:${convIdStr}`).emit('message:stream:chunk', {
                            conversationId: convIdStr,
                            content: parsed.content
                          })
                        } else if (parsed.type === 'done') {
                          aiData = parsed
                        } else if (parsed.type === 'error') {
                          streamError = new Error(parsed.message || parsed.content || 'AI stream error')
                        }
                      } catch (e) {
                        // ignore JSON parse error for incomplete/malformed lines
                      }
                    }
                  }

                  if (streamError) throw streamError
                  if (!aiData) throw new Error("AI Stream disconnected early")

                  const suggestedProducts = aiData.products_suggested && Array.isArray(aiData.products_suggested)
                    ? aiData.products_suggested.map((prod: any) => ({
                        productId: prod.mongoId,
                        name: prod.name,
                        price: prod.price,
                        slug: prod.slug || '',
                        imageUrl: prod.imageUrl || '',
                        unit: prod.unit || 'Sản phẩm',
                        requiresPrescription: Boolean(prod.requiresPrescription)
                      }))
                    : undefined

                  const aiMessage = await chatsService.sendAIMessage(
                    convIdStr,
                    aiData.reply,
                    aiData.classification,
                    undefined,
                    undefined,
                    suggestedProducts,
                    aiData.suggested_questions
                  )

                  io.to(`conversation:${convIdStr}`).emit('message:new', aiMessage)
                  io.to(`conversation:${convIdStr}`).emit('message:stream:done', { conversationId: convIdStr })
                  io.to('pharmacists').emit('message:new', aiMessage) // DS thấy AI reply

                  // Nếu AI nhận diện cần chuyển giao sang Dược sĩ (ví dụ hỏi mua thuốc kê đơn)
                  if (aiData.is_escalated) {
                    // Check online pharmacists
                    const onlineCount = await databaseService.users.countDocuments({ role: 1, isOnline: true })
                    if (onlineCount > 0) {
                      // Cập nhật type cuộc trò chuyện thành pharmacist
                      await databaseService.conversations.updateOne(
                        { _id: new ObjectId(convIdStr) },
                        { $set: { type: 'pharmacist', updatedAt: new Date() } }
                      )

                      const { pharmacistId } = await chatsService.assignPharmacist(convIdStr)
                      if (pharmacistId) {
                        const assignedPayload = {
                          conversationId: convIdStr,
                          pharmacistId: pharmacistId.toString()
                        }
                        io.to(`conversation:${convIdStr}`).emit('conversation:assigned', assignedPayload)
                        io.to('pharmacists').emit('conversation:assigned', assignedPayload)

                        const systemMsg = await chatsService.sendAIMessage(
                          convIdStr,
                          'Đang kết nối bạn với Dược sĩ của Medispace...'
                        )
                        io.to(`conversation:${convIdStr}`).emit('message:new', systemMsg)
                      }
                    } else {
                      // Báo không có dược sĩ online, tiếp tục giữ AI mode
                      const systemMsg = await chatsService.sendAIMessage(
                        convIdStr,
                        'Trợ lý AI nhận thấy bạn cần tư vấn từ Dược sĩ chuyên môn, tuy nhiên hiện tại các Dược sĩ đang offline. Tôi sẽ tiếp tục hỗ trợ bạn, hoặc bạn có thể để lại lời nhắn kèm SĐT.'
                      )
                      io.to(`conversation:${convIdStr}`).emit('message:new', systemMsg)
                    }
                  }
                } catch (aiErr) {
                  console.error('Error calling AI Service:', aiErr)
                  io.to(`conversation:${convIdStr}`).emit('message:stream:error', {
                    conversationId: convIdStr,
                    message: aiErr instanceof Error ? aiErr.message : 'AI stream error'
                  })
                  const fallback = 'Trợ lý ảo hiện đang gặp sự cố. Bạn có muốn kết nối với Dược sĩ thật không?'
                  const aiMessage = await chatsService.sendAIMessage(convIdStr, fallback)
                  io.to(`conversation:${convIdStr}`).emit('message:new', aiMessage)
                }
              } else {
                // Khách hàng đang ở luồng Dược sĩ thật (pharmacist) nhưng chưa được assign
                if (!conversation.pharmacistId) {
                  const { pharmacistId } = await chatsService.assignPharmacist(convIdStr)
                  if (pharmacistId) {
                    const assignedPayload = {
                      conversationId: convIdStr,
                      pharmacistId: pharmacistId.toString()
                    }
                    io.to(`conversation:${convIdStr}`).emit('conversation:assigned', assignedPayload)
                    io.to('pharmacists').emit('conversation:assigned', assignedPayload)
                  }
                }
              }
            }
          } else {
            // Pharmacist gửi → notify customer cụ thể
            const conversation = await chatsService.getConversationById(convIdStr)
            if (conversation) {
              const customerIdStr = conversation.customerId.toString()
              io.to(`user:${customerIdStr}`).emit('message:new', message)
            }
          }
        } catch (error: any) {
          socket.emit('error', { message: error?.message || CHATS_MESSAGES.SEND_MESSAGE_FAILED })
        }
      }
    )

    // Khách hàng chủ động yêu cầu chuyển sang Dược sĩ thật từ AI Mode
    socket.on('conversation:request_human', async ({ conversationId }) => {
      try {
        // 1. Kiểm tra dược sĩ online
        if (socket.userRole !== 'customer') throw new Error('Access denied')
        const conversation = await assertSocketConversationAccess(socket, conversationId)
        if (conversation.status === 'closed') throw new Error('Conversation is closed')
        const onlineCount = await databaseService.users.countDocuments({ role: 1, isOnline: true })
        if (onlineCount === 0) {
          const systemMsg = await chatsService.sendAIMessage(
            conversationId,
            'Hiện tại các Dược sĩ của Medispace đang không online. Trợ lý AI sẽ tiếp tục hỗ trợ bạn. Bạn cũng có thể để lại lời nhắn kèm số điện thoại.'
          )
          io.to(`conversation:${conversationId}`).emit('message:new', systemMsg)
          return
        }

        // 2. Chuyển đổi type cuộc hội thoại thành pharmacist
        await databaseService.conversations.updateOne(
          { _id: new ObjectId(conversationId) },
          { $set: { type: 'pharmacist', updatedAt: new Date() } }
        )

        // 3. Gán dược sĩ
        const { pharmacistId } = await chatsService.assignPharmacist(conversationId)

        // 4. Gửi tin nhắn thông báo hệ thống kết nối
        const systemMsg = await chatsService.sendAIMessage(
          conversationId,
                          'Đang kết nối bạn với Dược sĩ của Medispace...'
        )
        io.to(`conversation:${conversationId}`).emit('message:new', systemMsg)

        if (pharmacistId) {
          const assignedPayload = {
            conversationId,
            pharmacistId: pharmacistId.toString()
          }
          io.to(`conversation:${conversationId}`).emit('conversation:assigned', assignedPayload)
          io.to('pharmacists').emit('conversation:assigned', assignedPayload)
        }
      } catch (error) {
        socket.emit('error', { message: 'Không thể kết nối với Dược sĩ lúc này' })
      }
    })

    // Typing indicator
    socket.on('typing:start', async (conversationId: string) => {
      try {
        await assertSocketConversationAccess(socket, conversationId)
        socket.to(`conversation:${conversationId}`).emit('typing:user', {
          userId: socket.userId,
          conversationId
        })
      } catch {
        socket.emit('error', { message: 'Access denied' })
      }
    })

    socket.on('typing:stop', async (conversationId: string) => {
      try {
        await assertSocketConversationAccess(socket, conversationId)
        socket.to(`conversation:${conversationId}`).emit('typing:stop', {
          userId: socket.userId,
          conversationId
        })
      } catch {
        socket.emit('error', { message: 'Access denied' })
      }
    })

    // Mark messages as read
    socket.on('messages:read', async (data: { conversationId: string }) => {
      try {
        if (!socket.userId || !socket.userRole) return
        if (socket.userRole === 'admin') return
        await assertSocketConversationAccess(socket, data.conversationId)

        await chatsService.markAsRead(data.conversationId, socket.userId, socket.userRole)

        socket.to(`conversation:${data.conversationId}`).emit('messages:read', {
          conversationId: data.conversationId,
          userId: socket.userId
        })
      } catch (error) {
        // Silent fail
      }
    })

    // Disconnect handler
    socket.on('disconnect', async () => {
      if (socket.userId) {
        for (const room of socket.rooms) {
          if (room.startsWith('community:video-event:')) {
            const eventId = room.replace('community:video-event:', '')
            socket.to(room).emit(COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS.ATTENDEE_LEFT, {
              eventId,
              userId: socket.userId,
              leftAt: new Date()
            })
          }
        }
      }

      if (socket.userId) {
        // --- FIX 3.4: decrement counter, chỉ set offline khi count về 0 ---
        const user = await databaseService.users.findOneAndUpdate(
          { _id: new ObjectId(socket.userId) },
          {
            $inc: { onlineCount: -1 },
            $set: { updatedAt: new Date() }
          },
          { returnDocument: 'after' }
        )

        const newCount = user?.onlineCount ?? 0
        if (newCount <= 0) {
          if (socket.userRole === 'pharmacist') {
            await databaseService.users.updateOne(
              { _id: new ObjectId(socket.userId) },
              { $set: { onlineCount: 0 } }
            )
          } else {
            await databaseService.users.updateOne(
              { _id: new ObjectId(socket.userId) },
              { $set: { isOnline: false, onlineCount: 0 } }
            )
          }
          io.emit('user:offline', { userId: socket.userId })
        }
      }
    })
  })

  return io
}

