import { Server as SocketIOServer, Socket } from 'socket.io'
import { Server as HTTPServer } from 'http'
import { verifyToken } from '~/utils/jwt'
import { TokenPayload } from '~/models/requests/User.request'
import chatsService from '~/services/chats.services'
import databaseService from '~/services/database.services'
import { ObjectId } from 'mongodb'
import { config } from 'dotenv'

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

            // verifyToken returns TokenPayload directly with userId, role, etc.
            const decoded = await verifyToken({
                token,
                secretOrPublicKey: process.env.JWT_SECRET_ACCESS_TOKEN as string
            }) as TokenPayload

            socket.userId = decoded.userId
            socket.userRole = decoded.role === 1 ? 'pharmacist' : 'customer'

            next()
        } catch (error) {
            console.error('❌ Socket auth error:', error)
            next(new Error('Authentication error'))
        }
    })

    // Connection handler
    io.on('connection', async (socket: AuthenticatedSocket) => {
        // Update user online status
        if (socket.userId) {
            await databaseService.users.updateOne(
                { _id: new ObjectId(socket.userId) },
                { $set: { isOnline: true, updatedAt: new Date() } }
            )

            // Broadcast online status to all clients
            io.emit('user:online', { userId: socket.userId })
        }

        // Join user's personal room
        if (socket.userId) {
            const userIdStr = socket.userId.toString()
            socket.join(`user:${userIdStr}`)
            console.log(`User ${userIdStr} joined personal room: user:${userIdStr}`)
        }

        // Manual join personal room (Backup)
        socket.on('user:join', () => {
            if (socket.userId) {
                const userIdStr = socket.userId.toString()
                socket.join(`user:${userIdStr}`)
                console.log(`[Manual] User ${userIdStr} joined personal room`)
            }
        })

        // Join conversation room
        socket.on('conversation:join', async (conversationId: string) => {
            socket.join(`conversation:${conversationId}`)
            console.log(`Socket ${socket.id} joined conversation:${conversationId}`)
        })

        // Leave conversation room
        socket.on('conversation:leave', (conversationId: string) => {
            socket.leave(`conversation:${conversationId}`)
        })

        // Send message
        socket.on('message:send', async (data: { conversationId?: string; pharmacistId?: string; content: string; type?: 'text' | 'image'; imageUrl?: string }) => {
            try {
                if (!socket.userId || !socket.userRole) {
                    socket.emit('error', { message: 'Not authenticated' })
                    return
                }

                console.log(`User ${socket.userId} sending message to convo ${data.conversationId}`)

                const message = await chatsService.sendMessage(socket.userId, socket.userRole, data)

                // 0. Emit back to sender directly (Fail-safe for sender visibility)
                socket.emit('message:new', message)

                // 1. Emit to conversation room (Standard way)
                io.to(`conversation:${message.conversationId}`).emit('message:new', message)

                // 2. Extra Redundancy: Emit strictly to receiver's personal room
                if (socket.userRole === 'customer') {
                    // Sender is Customer => Receiver is Pharmacists
                    // Broadcast to all connected pharmacists
                    const sockets = await io.fetchSockets()
                    sockets.forEach(s => {
                        const authSocket = s as unknown as AuthenticatedSocket
                        if (authSocket.userRole === 'pharmacist') {
                            s.emit('message:new', message)
                            s.emit('notification:new-message', {
                                conversationId: message.conversationId,
                                message
                            })
                        }
                    })
                } else {
                    // Sender is Pharmacist => Receiver is Customer
                    const conversation = await chatsService.getConversationById(message.conversationId.toString())
                    if (conversation) {
                        const customerIdStr = conversation.customerId.toString()
                        console.log(`Emitting to customer room: user:${customerIdStr}`)

                        // Emit to specific user room
                        io.to(`user:${customerIdStr}`).emit('message:new', message)

                        // For redundant safety, emit to notification event too
                        io.to(`user:${customerIdStr}`).emit('notification:new-message', {
                            conversationId: message.conversationId,
                            message
                        })
                    }
                }
            } catch (error) {
                console.error('Error sending message:', error)
                socket.emit('error', { message: 'Failed to send message' })
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
                if (!socket.userId || !socket.userRole) {
                    return
                }

                await chatsService.markAsRead(data.conversationId, socket.userId, socket.userRole)

                // Notify other party that messages were read
                socket.to(`conversation:${data.conversationId}`).emit('messages:read', {
                    conversationId: data.conversationId,
                    userId: socket.userId
                })
            } catch (error) {
                console.error('Error marking messages as read:', error)
            }
        })

        // Disconnect handler
        socket.on('disconnect', async () => {
            // Update user offline status
            if (socket.userId) {
                await databaseService.users.updateOne(
                    { _id: new ObjectId(socket.userId) },
                    { $set: { isOnline: false, updatedAt: new Date() } }
                )

                // Broadcast offline status
                io.emit('user:offline', { userId: socket.userId })
            }
        })
    })

    return io
}
