import { Server as SocketIOServer, Socket } from 'socket.io'
import { Server as HTTPServer } from 'http'
import { verifyToken } from '~/utils/jwt'
import { TokenPayload } from '~/models/requests/User.request'
import chatsService from '~/services/chats.services'
import databaseService from '~/services/database.services'
import typesenseService from '~/services/typesense.services'
import { checkAIRateLimit } from '~/services/ai-chat.services'
import { ObjectId } from 'mongodb'
import { config } from 'dotenv'
import { USERS_MESSAGES, CHATS_MESSAGES } from '~/constants/message'
import { TokenType, UserRole, UserStatus } from '~/constants/enum'

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

// â”€â”€ Intent keyword detection (nhanh, khÃ´ng cáº§n gá»i LLM) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ORDER_KEYWORDS = [
  'Ä‘Æ¡n hÃ ng', 'ord-', 'Ä‘áº·t hÃ ng', 'giao hÃ ng', 'váº­n chuyá»ƒn', 'tracking',
  'Ä‘áº¿n Ä‘Ã¢u', 'bao giá» giao', 'tÃ¬nh tráº¡ng Ä‘Æ¡n', 'tráº¡ng thÃ¡i Ä‘Æ¡n',
  'Ä‘Ã£ mua', 'lá»‹ch sá»­ mua', 'mua gÃ¬', 'mua ngÃ y', 'hÃ³a Ä‘Æ¡n'
]
const LOYALTY_KEYWORDS = [
  'Ä‘iá»ƒm thÆ°á»Ÿng', 'Ä‘iá»ƒm tÃ­ch lÅ©y', 'háº¡ng thÃ nh viÃªn', 'thÃ nh viÃªn',
  'háº¡ng báº¡c', 'háº¡ng vÃ ng', 'háº¡ng kim', 'loyalty', 'tÃ­ch Ä‘iá»ƒm',
  'bao nhiÃªu Ä‘iá»ƒm', 'cÃ²n Ä‘iá»ƒm', 'Ä‘iá»ƒm cá»§a tÃ´i'
]

function detectContextIntent(message: string): 'order' | 'loyalty' | null {
  const lower = message.toLowerCase()
  if (ORDER_KEYWORDS.some(kw => lower.includes(kw))) return 'order'
  if (LOYALTY_KEYWORDS.some(kw => lower.includes(kw))) return 'loyalty'
  return null
}

// â”€â”€ Extract order numbers tá»« message (e.g. ORD-1767014893436-927 hoáº·c DH...) â”€â”€
function extractOrderNumbers(message: string): string[] {
  // Match ORD-xxx vÃ  DH-xxx patterns
  const matches = message.match(/(?:ORD|DH)[-\w]+/gi) || []
  return [...new Set(matches.map(m => m.toUpperCase()))]
}

// â”€â”€ Fetch real user data tá»« MongoDB Ä‘á»ƒ inject vÃ o AI context â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function fetchUserContextData(
  userId: string,
  intent: 'order' | 'loyalty',
  message: string = ''
): Promise<Record<string, any> | null> {
  try {
    if (intent === 'order') {
      const mentionedOrderNumbers = extractOrderNumbers(message)
      console.log('[Socket] fetchUserContextData | userId:', userId, '| mentioned orders:', mentionedOrderNumbers)

      // 1. Láº¥y 5 Ä‘Æ¡n hÃ ng gáº§n nháº¥t cá»§a user Ä‘ang login
      const recentOrders = await databaseService.orders
        .find({ userId: new ObjectId(userId) })
        .sort({ createdAt: -1 })
        .limit(5)
        .toArray()

      // 2. Náº¿u user nháº¯c Ä‘áº¿n orderNumber cá»¥ thá»ƒ â†’ tÃ¬m thÃªm Ä‘Æ¡n Ä‘Ã³
      let mentionedOrders: any[] = []
      if (mentionedOrderNumbers.length > 0) {
        mentionedOrders = await databaseService.orders
          .find({
            orderNumber: { $in: mentionedOrderNumbers },
            userId: new ObjectId(userId)   // Chá»‰ láº¥y náº¿u thuá»™c user nÃ y
          })
          .toArray()

        // Log náº¿u order tá»“n táº¡i nhÆ°ng khÃ´ng thuá»™c user nÃ y
        if (mentionedOrders.length === 0 && mentionedOrderNumbers.length > 0) {
          const anyMatch = await databaseService.orders.findOne({
            orderNumber: { $in: mentionedOrderNumbers }
          })
          if (anyMatch) {
            console.log('[Socket] Order', mentionedOrderNumbers, 'tá»“n táº¡i nhÆ°ng thuá»™c user khÃ¡c')
          } else {
            console.log('[Socket] Order', mentionedOrderNumbers, 'khÃ´ng tá»“n táº¡i trong DB')
          }
        }
      }

      // 3. Merge: Æ°u tiÃªn Ä‘Æ¡n Ä‘Æ°á»£c nháº¯c Ä‘áº¿n, sau Ä‘Ã³ recent orders
      const allOrders = [...mentionedOrders]
      for (const o of recentOrders) {
        if (!allOrders.find((x: any) => x._id?.toString() === o._id?.toString())) {
          allOrders.push(o)
        }
      }

      if (!allOrders.length) {
        // KhÃ´ng cÃ³ Ä‘Æ¡n nÃ o â†’ tráº£ vá» flag Ä‘á»ƒ AI biáº¿t user chÆ°a cÃ³ Ä‘Æ¡n
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
          name: item.name || 'Sáº£n pháº©m',
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
            productName: item.name || 'Sáº£n pháº©m',
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

// â”€â”€ Socket Rate Limiting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ÄÃ£ chuyá»ƒn sang Redis-backed rate limit (checkAIRateLimit tá»« ai-chat.services)
// In-memory fallback váº«n giá»¯ cho non-AI messages (pharmacist)
const SOCKET_RATE_LIMIT_MAX = 15
const SOCKET_RATE_LIMIT_WINDOW_MS = 60_000
const socketMessageCounts = new Map<string, { count: number; resetAt: number }>()

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
    // --- FIX 3.4: dÃ¹ng atomic increment thay bool Ä‘á»ƒ handle Ä‘a tab ---
    if (socket.userId) {
      await databaseService.users.updateOne(
        { _id: new ObjectId(socket.userId) },
        {
          $inc: { onlineCount: 1 },
          $set: { isOnline: true, updatedAt: new Date() }
        }
      )

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
          ack?.({ ok: false, message: 'roomId khÃ´ng há»£p lá»‡' })
          return
        }
        const roomObjectId = new ObjectId(roomId)
        const userObjectId = new ObjectId(socket.userId)
        const room = await databaseService.communityRooms.findOne({ _id: roomObjectId, status: 'active' })
        const member = await databaseService.communityRoomMembers.findOne({ roomId: roomObjectId, userId: userObjectId })
        const canAccess = socket.userRole === 'admin' || (Boolean(room) && member?.status === 'active')
        if (!canAccess) {
          socket.emit('error', { message: 'Báº¡n chÆ°a tham gia phÃ²ng cá»™ng Ä‘á»“ng nÃ y.' })
          ack?.({ ok: false, message: 'Báº¡n chÆ°a tham gia phÃ²ng cá»™ng Ä‘á»“ng nÃ y.' })
          return
        }
        socket.join(`community:room:${roomId}`)
        ack?.({ ok: true, roomId })
      } catch {
        socket.emit('error', { message: 'KhÃ´ng thá»ƒ tham gia kÃªnh realtime cá»™ng Ä‘á»“ng.' })
        ack?.({ ok: false, message: 'KhÃ´ng thá»ƒ tham gia kÃªnh realtime cá»™ng Ä‘á»“ng.' })
      }
    })

    socket.on('community:room:leave', (roomId: string) => {
      socket.leave(`community:room:${roomId}`)
    })

    // --- FIX 3.2: emit gá»n láº¡i â€“ chá»‰ dÃ¹ng room-based, bá» fetchSockets loop ---
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

          // Admin khÃ´ng gá»­i tin nháº¯n qua socket nÃ y
          if (socket.userRole === 'admin') return

          // â”€â”€ Rate Limit Check (Redis-backed cho AI, in-memory cho non-AI) â”€â”€â”€â”€â”€â”€â”€â”€
          if (socket.userRole === 'customer') {
            // DÃ¹ng Redis rate limit cho AI messages (persist qua restart)
            const rateCheck = await checkAIRateLimit(socket.userId)
            if (!rateCheck.allowed) {
              socket.emit('error', {
                message: `Báº¡n Ä‘Ã£ vÆ°á»£t giá»›i háº¡n tin nháº¯n AI (30/giá»). Thá»­ láº¡i sau ${Math.ceil(rateCheck.resetIn / 60)} phÃºt.`
              })
              return
            }
          } else {
            // Pharmacist dÃ¹ng in-memory rate limit (Ã­t quan trá»ng hÆ¡n)
            if (!checkSocketRateLimit(socket.userId)) {
              socket.emit('error', { message: 'Báº¡n Ä‘ang gá»­i tin nháº¯n quÃ¡ nhanh. Vui lÃ²ng chá» má»™t chÃºt trÆ°á»›c khi gá»­i tiáº¿p.' })
              return
            }
          }

          const message = await chatsService.sendMessage(socket.userId, socket.userRole, data as any)

          const convIdStr = message.conversationId.toString()

          // 1. Gá»­i Ä‘áº¿n conversation room (táº¥t cáº£ Ä‘ang xem conversation nÃ y)
          io.to(`conversation:${convIdStr}`).emit('message:new', message)

          if (socket.userRole === 'customer') {
            // Customer gá»­i â†’ broadcast cho pharmacists Ä‘á»ƒ cáº­p nháº­t list
            io.to('pharmacists').emit('message:new', message)

            const conversation = await databaseService.conversations.findOne({
              _id: new ObjectId(convIdStr)
            })

            // Detect tin nháº¯n Ä‘áº§u tiÃªn â†’ notify admin realtime
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

                // KhÃ¡ch hÃ ng Ä‘ang á»Ÿ AI Mode
                try {
                  // 1. Láº¥y lá»‹ch sá»­ há»™i thoáº¡i (Conversation Memory) - tá»‘i Ä‘a 6 tin nháº¯n trÆ°á»›c tin nháº¯n hiá»‡n táº¡i
                  const dbMessages = await databaseService.messages
                    .find({
                      conversationId: new ObjectId(convIdStr),
                      _id: { $ne: message._id }
                    })
                    .sort({ createdAt: -1 })
                    .limit(6)
                    .toArray()

                  // FIX: Include ALL message types (customer + AI + pharmacist)
                  // Pharmacist messages â†’ 'assistant' role (AI biáº¿t DS Ä‘Ã£ nÃ³i gÃ¬)
                  const history = dbMessages
                    .reverse()
                    .filter((m: any) => m.type === 'text' && m.content?.trim())
                    .map((m: any) => ({
                      role: m.senderRole === 'customer' ? 'user' : 'assistant',
                      content: m.content.trim()
                    }))

                  // 2. TÃ¬m kiáº¿m sáº£n pháº©m liÃªn quan (RAG) - Chá»‰ láº¥y sáº£n pháº©m khÃ´ng kÃª Ä‘Æ¡n (requiresPrescription: false)
                  let contextProducts: any[] = []
                  try {
                    let tsResult = await typesenseService.searchProducts({
                      q: data.content || '',
                      limit: 6, // TÄƒng tá»« 3 â†’ 6 (Task 2.3) Ä‘á»ƒ AI cÃ³ context phong phÃº hÆ¡n
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
                      const unit = defaultVariant?.unit || 'Sáº£n pháº©m'
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

                  // â”€â”€ Phase 3: Fetch real user data (orders, loyalty) Ä‘á»ƒ inject vÃ o AI â”€â”€
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
                      // Bá» qua comment lines (SSE heartbeat: ': heartbeat')
                      if (!line.trim() || line.startsWith(':')) continue
                      // Bá» qua [DONE] terminator
                      if (line === 'data: [DONE]') continue

                      // FIX BUG: SSE format lÃ  'data: {...}' â€” pháº£i strip prefix 'data: '
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
                        unit: prod.unit || 'Sáº£n pháº©m',
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
                  io.to('pharmacists').emit('message:new', aiMessage) // DS tháº¥y AI reply

                  // Náº¿u AI nháº­n diá»‡n cáº§n chuyá»ƒn giao sang DÆ°á»£c sÄ© (vÃ­ dá»¥ há»i mua thuá»‘c kÃª Ä‘Æ¡n)
                  if (aiData.is_escalated) {
                    // Check online pharmacists
                    const onlineCount = await databaseService.users.countDocuments({ role: 1, isOnline: true })
                    if (onlineCount > 0) {
                      // Cáº­p nháº­t type cuá»™c trÃ² chuyá»‡n thÃ nh pharmacist
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
                      // BÃ¡o khÃ´ng cÃ³ dÆ°á»£c sÄ© online, tiáº¿p tá»¥c giá»¯ AI mode
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
                // KhÃ¡ch hÃ ng Ä‘ang á»Ÿ luá»“ng DÆ°á»£c sÄ© tháº­t (pharmacist) nhÆ°ng chÆ°a Ä‘Æ°á»£c assign
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
            // Pharmacist gá»­i â†’ notify customer cá»¥ thá»ƒ
            const conversation = await chatsService.getConversationById(convIdStr)
            if (conversation) {
              const customerIdStr = conversation.customerId.toString()
              io.to(`user:${customerIdStr}`).emit('message:new', message)
            }
          }
        } catch (error) {
          socket.emit('error', { message: CHATS_MESSAGES.SEND_MESSAGE_FAILED })
        }
      }
    )

    // KhÃ¡ch hÃ ng chá»§ Ä‘á»™ng yÃªu cáº§u chuyá»ƒn sang DÆ°á»£c sÄ© tháº­t tá»« AI Mode
    socket.on('conversation:request_human', async ({ conversationId }) => {
      try {
        // 1. Kiá»ƒm tra dÆ°á»£c sÄ© online
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

        // 2. Chuyá»ƒn Ä‘á»•i type cuá»™c há»™i thoáº¡i thÃ nh pharmacist
        await databaseService.conversations.updateOne(
          { _id: new ObjectId(conversationId) },
          { $set: { type: 'pharmacist', updatedAt: new Date() } }
        )

        // 3. GÃ¡n dÆ°á»£c sÄ©
        const { pharmacistId } = await chatsService.assignPharmacist(conversationId)

        // 4. Gá»­i tin nháº¯n thÃ´ng bÃ¡o há»‡ thá»‘ng káº¿t ná»‘i
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
        socket.emit('error', { message: 'KhÃ´ng thá»ƒ káº¿t ná»‘i vá»›i DÆ°á»£c sÄ© lÃºc nÃ y' })
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
        // --- FIX 3.4: decrement counter, chá»‰ set offline khi count vá» 0 ---
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
          await databaseService.users.updateOne(
            { _id: new ObjectId(socket.userId) },
            { $set: { isOnline: false, onlineCount: 0 } }
          )
          io.emit('user:offline', { userId: socket.userId })
        }
      }
    })
  })

  return io
}




