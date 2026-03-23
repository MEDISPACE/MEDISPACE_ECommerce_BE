import { Server as SocketIOServer, Socket } from 'socket.io'
import { Server as HTTPServer } from 'http'
import { verifyToken } from '~/utils/jwt'
import { TokenPayload } from '~/models/requests/User.request'
import chatsService from '~/services/chats.services'
import databaseService from '~/services/database.services'
import { ObjectId } from 'mongodb'
import { config } from 'dotenv'
import { USERS_MESSAGES, CHATS_MESSAGES } from '~/constants/message'

config()

interface AuthenticatedSocket extends Socket {
    userId?: string
    userRole?: 'customer' | 'pharmacist'
}

export const initChatSocket = (httpServer: HTTPServer) => {
    const io = new SocketIOServer(httpServer, {
        cors: {
            origin: process.env.FRONTEND_URLS,
            credentials: true,
            methods: ['GET', 'POST']
        }
    })

    // Authentication middleware
    io.use(async (socket: AuthenticatedSocket, next) => {
        try {
            const token = socket.handshake.auth.token
            if (!token) {
                return next(new Error('Authentication error'))
            }

            const decoded = await verifyToken({
                token,
                secretOrPublicKey: process.env.JWT_SECRET_ACCESS_TOKEN as string
            }) as TokenPayload

            socket.userId = decoded.userId
            socket.userRole = decoded.role === 1 ? 'pharmacist' : 'customer'

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
        }

        // Manual join personal room (Backup)
        socket.on('user:join', () => {
            if (socket.userId) {
                socket.join(`user:${socket.userId}`)
                if (socket.userRole === 'pharmacist') {
                    socket.join('pharmacists')
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
        socket.on('message:send', async (data: {
            conversationId?: string
            pharmacistId?: string
            content: string
            type?: 'text' | 'image'
            imageUrl?: string
        }) => {
            try {
                if (!socket.userId || !socket.userRole) {
                    socket.emit('error', { message: USERS_MESSAGES.UNAUTHENTICATED })
                    return
                }

                const message = await chatsService.sendMessage(socket.userId, socket.userRole, data)

                const convIdStr = message.conversationId.toString()

                // 1. Gửi đến conversation room (tất cả đang xem conversation này)
                io.to(`conversation:${convIdStr}`).emit('message:new', message)

                if (socket.userRole === 'customer') {
                    // Customer gửi → notify tất cả pharmacists (shared inbox)
                    io.to('pharmacists').emit('message:new', message)
                    io.to('pharmacists').emit('notification:new-message', {
                        conversationId: convIdStr,
                        message
                    })

                    // --- 3.5: Auto-assign nếu conversation chưa có dược sĩ ---
                    const conversation = await databaseService.conversations.findOne({
                        _id: new ObjectId(convIdStr)
                    })
                    if (conversation && !conversation.pharmacistId) {
                        const { pharmacistId } = await chatsService.assignPharmacist(convIdStr)
                        if (pharmacistId) {
                            io.to('pharmacists').emit('conversation:assigned', {
                                conversationId: convIdStr,
                                pharmacistId: pharmacistId.toString()
                            })
                        }
                    }
                } else {
                    // Pharmacist gửi → notify customer cụ thể
                    const conversation = await chatsService.getConversationById(convIdStr)
                    if (conversation) {
                        const customerIdStr = conversation.customerId.toString()
                        io.to(`user:${customerIdStr}`).emit('message:new', message)
                        io.to(`user:${customerIdStr}`).emit('notification:new-message', {
                            conversationId: convIdStr,
                            message
                        })
                    }
                }
            } catch (error) {
                socket.emit('error', { message: CHATS_MESSAGES.SEND_MESSAGE_FAILED })
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
