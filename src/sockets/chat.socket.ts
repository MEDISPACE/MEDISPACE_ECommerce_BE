import { Server as SocketIOServer, Socket } from 'socket.io'
import { Server as HTTPServer } from 'http'
import { verifyToken } from '~/utils/jwt'
import { TokenPayload } from '~/models/requests/User.request'
import chatsService from '~/services/chats.services'
import databaseService from '~/services/database.services'
import typesenseService from '~/services/typesense.services'
import { ObjectId } from 'mongodb'
import { config } from 'dotenv'
import { USERS_MESSAGES, CHATS_MESSAGES } from '~/constants/message'

config()

// ── Socket Rate Limiting (Task 1.2) ─────────────────────────────────────────
// Giới hạn: 15 messages / 60 giây / user để tránh spam AI
const SOCKET_RATE_LIMIT_MAX = 15
const SOCKET_RATE_LIMIT_WINDOW_MS = 60_000
const socketMessageCounts = new Map<string, { count: number; resetAt: number }>()

function checkSocketRateLimit(userId: string): boolean {
  const now = Date.now()
  const record = socketMessageCounts.get(userId)

  if (!record || now > record.resetAt) {
    socketMessageCounts.set(userId, { count: 1, resetAt: now + SOCKET_RATE_LIMIT_WINDOW_MS })
    return true // Allowed
  }

  if (record.count >= SOCKET_RATE_LIMIT_MAX) {
    return false // Rate limited
  }

  record.count++
  return true // Allowed
}

interface AuthenticatedSocket extends Socket {
  userId?: string
  userRole?: 'customer' | 'pharmacist' | 'admin'
}

let _io: SocketIOServer | null = null

export const getIO = (): SocketIOServer => {
  if (!_io) throw new Error('Socket.IO not initialized')
  return _io
}

export const initChatSocket = (httpServer: HTTPServer) => {
  const allowedOrigins = process.env.FRONTEND_URLS?.split(',').map(url => url.trim()) || '*'
  _io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins,
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

      socket.userId = decoded.userId
      if (decoded.role === 1) socket.userRole = 'pharmacist'
      else if (decoded.role === 2) socket.userRole = 'admin'
      else socket.userRole = 'customer'

      next()
    } catch (error) {
      next(new Error(USERS_MESSAGES.UNAUTHENTICATED))
    }
  })

  // Connection handler
  io.on('connection', async (socket: AuthenticatedSocket) => {
    // --- FIX 3.4: dùng atomic increment thay bool để handle đa tab ---
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
    socket.on('conversation:join', (conversationId: string) => {
      socket.join(`conversation:${conversationId}`)
    })

    // Leave conversation room
    socket.on('conversation:leave', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`)
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

          // ── Rate Limit Check (Task 1.2) ──────────────────────────────────────
          if (!checkSocketRateLimit(socket.userId)) {
            socket.emit('error', { message: 'Bạn đang gửi tin nhắn quá nhanh. Vui lòng chờ một chút trước khi gửi tiếp.' })
            return
          }

          const message = await chatsService.sendMessage(socket.userId, socket.userRole, data as any)

          const convIdStr = message.conversationId.toString()

          // 1. Gửi đến conversation room (tất cả đang xem conversation này)
          io.to(`conversation:${convIdStr}`).emit('message:new', message)

          if (socket.userRole === 'customer') {
            // Customer gửi → broadcast cho pharmacists để cập nhật list
            io.to('pharmacists').emit('message:new', message)

            const conversation = await databaseService.conversations.findOne({
              _id: new ObjectId(convIdStr)
            })

            // Detect tin nhắn đầu tiên → notify admin realtime
            const msgCount = await databaseService.messages.countDocuments({
              conversationId: new ObjectId(convIdStr)
            })
            if (msgCount === 1) {
              io.to('admins').emit('conversation:new', { conversationId: convIdStr })
            }

            if (conversation) {
              if (conversation.type === 'ai') {
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

                  // Task 1.4: Chỉ lấy tin nhắn của customer VÀ AI làm history
                  // Loại bỏ tin nhắn của Dược sĩ thật để tránh AI bị confused
                  const history = dbMessages
                    .reverse()
                    .filter((m: any) =>
                      m.type === 'text' &&
                      (m.senderRole === 'customer' || m.isAI === true)
                    )
                    .map((m: any) => ({
                      role: m.senderRole === 'customer' ? 'user' : 'assistant',
                      content: m.content
                    }))

                  // 2. Tìm kiếm sản phẩm liên quan (RAG) - Chỉ lấy sản phẩm không kê đơn (requiresPrescription: false)
                  let contextProducts: any[] = []
                  try {
                    let tsResult = await typesenseService.searchProducts({
                      q: data.content || '',
                      limit: 6, // Tăng từ 3 → 6 (Task 2.3) để AI có context phong phú hơn
                      inStock: true,
                      requiresPrescription: false
                    })

                    let hits = tsResult?.hits
                    if (!tsResult) {
                      // Fallback MongoDB
                      const query = data.content || ''
                      const mongoFilter: Record<string, any> = {
                        isActive: true,
                        requiresPrescription: false,
                        stockQuantity: { $gt: 0 }
                      }
                      if (query) {
                        mongoFilter.$or = [
                          { name: { $regex: query, $options: 'i' } },
                          { sku: { $regex: query, $options: 'i' } }
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
                        unit: unit
                      }
                    }) || []
                  } catch (tsErr) {
                    console.error('[Socket] Error fetching RAG products:', tsErr)
                  }

                  const aiServiceUrl = process.env.CHAT_AI_URL || 'http://localhost:8003'
                  const aiRes = await fetch(`${aiServiceUrl}/chat/stream`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      message: data.content,
                      conversation_id: convIdStr,
                      user_id: socket.userId,
                      history,
                      context_products: contextProducts
                    }),
                    signal: AbortSignal.timeout(65000)
                  })

                  if (!aiRes.body) throw new Error("No response body from AI stream");

                  const reader = aiRes.body.getReader()
                  const decoder = new TextDecoder()
                  let aiData: any = null
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
                      if (!line.trim()) continue
                      try {
                        const parsed = JSON.parse(line)
                        if (parsed.type === 'chunk') {
                          io.to(`conversation:${convIdStr}`).emit('message:stream:chunk', {
                            conversationId: convIdStr,
                            content: parsed.content
                          })
                        } else if (parsed.type === 'done') {
                          aiData = parsed
                        } else if (parsed.type === 'error') {
                          throw new Error(parsed.content)
                        }
                      } catch (e) {
                        // ignore JSON parse error for incomplete lines
                      }
                    }
                  }

                  if (!aiData) throw new Error("AI Stream disconnected early")

                  const suggestedProducts = aiData.products_suggested && Array.isArray(aiData.products_suggested)
                    ? aiData.products_suggested.map((prod: any) => ({
                        productId: prod.mongoId,
                        name: prod.name,
                        price: prod.price,
                        slug: prod.slug || '',
                        imageUrl: prod.imageUrl || '',
                        unit: prod.unit || 'Sản phẩm',
                        requiresPrescription: false
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
                  const fallback = 'Trợ lý Ảo hiện đang gặp sự cố. Bạn có muốn kết nối với Dược sĩ thật không?'
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
        } catch (error) {
          socket.emit('error', { message: CHATS_MESSAGES.SEND_MESSAGE_FAILED })
        }
      }
    )

    // Khách hàng chủ động yêu cầu chuyển sang Dược sĩ thật từ AI Mode
    socket.on('conversation:request_human', async ({ conversationId }) => {
      try {
        // 1. Kiểm tra dược sĩ online
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
    socket.on('typing:start', (conversationId: string) => {
      socket.to(`conversation:${conversationId}`).emit('typing:user', {
        userId: socket.userId,
        conversationId
      })
    })

    socket.on('typing:stop', (conversationId: string) => {
      socket.to(`conversation:${conversationId}`).emit('typing:stop', {
        userId: socket.userId,
        conversationId
      })
    })

    // Mark messages as read
    socket.on('messages:read', async (data: { conversationId: string }) => {
      try {
        if (!socket.userId || !socket.userRole) return
        if (socket.userRole === 'admin') return

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
