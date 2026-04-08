import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import Conversation from '~/models/schemas/Conversation.schema'
import Message, { MessageType } from '~/models/schemas/Message.schema'
import { SendMessageReqBody } from '~/models/requests/Chat.request'

class ChatsService {
    // Get or create conversation for customer (shared inbox - no specific pharmacist)
    async getOrCreateConversation(customerId: string) {
        const customerObjectId = new ObjectId(customerId)

        // Chỉ tìm conversation đang active — không dùng lại conversation đã đóng
        let conversation = await databaseService.conversations.findOne({
            customerId: customerObjectId,
            status: 'active'
        })

        // Không có active conversation → tạo mới
        if (!conversation) {
            const newConversation = new Conversation({
                customerId: customerObjectId,
                status: 'active'
            })

            const result = await databaseService.conversations.insertOne(newConversation)
            conversation = { ...newConversation, _id: result.insertedId }
        }

        return conversation
    }

    // Get all conversations for a user (customer or pharmacist)
    async getConversations(userId: string, role: 'customer' | 'pharmacist', page = 1, limit = 20, status?: 'active' | 'closed') {
        const userObjectId = new ObjectId(userId)
        const skip = (page - 1) * limit

        // Shared inbox: pharmacists see ALL conversations, customers see only their own
        const query: Record<string, unknown> = role === 'customer' ? { customerId: userObjectId } : {}
        if (status) query.status = status

        const [conversations, total] = await Promise.all([
            databaseService.conversations
                .aggregate([
                    { $match: query },
                    // Add a field for sorting - use lastMessageAt if exists, otherwise createdAt
                    {
                        $addFields: {
                            sortDate: {
                                $ifNull: ['$lastMessageAt', '$createdAt']
                            }
                        }
                    },
                    { $sort: { sortDate: -1 } },
                    { $skip: skip },
                    { $limit: limit },
                    {
                        $lookup: {
                            from: process.env.USERS_COLLECTION as string,
                            localField: 'customerId',
                            foreignField: '_id',
                            as: 'customer'
                        }
                    },
                    {
                        $lookup: {
                            from: process.env.USERS_COLLECTION as string,
                            localField: 'pharmacistId',
                            foreignField: '_id',
                            as: 'pharmacist'
                        }
                    },
                    { $unwind: '$customer' },
                    // Pharmacist may not exist (shared inbox), so use $unwind with preserveNullAndEmptyArrays
                    { $unwind: { path: '$pharmacist', preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            _id: 1,
                            customerId: 1,
                            pharmacistId: 1,
                            lastMessage: 1,
                            lastMessageAt: 1,
                            unreadCount: 1,
                            status: 1,
                            createdAt: 1,
                            updatedAt: 1,
                            'customer._id': 1,
                            'customer.firstName': 1,
                            'customer.lastName': 1,
                            'customer.avatar': 1,
                            'customer.isOnline': 1,
                            'pharmacist._id': 1,
                            'pharmacist.firstName': 1,
                            'pharmacist.lastName': 1,
                            'pharmacist.avatar': 1,
                            'pharmacist.isOnline': 1
                        }
                    }
                ])
                .toArray(),
            databaseService.conversations.countDocuments(query)
        ])

        return {
            conversations,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        }
    }

    // Send a message
    async sendMessage(
        senderId: string,
        senderRole: 'customer' | 'pharmacist',
        payload: SendMessageReqBody
    ) {
        const senderObjectId = new ObjectId(senderId)
        let conversationId: ObjectId

        // If conversationId is provided, use it
        if (payload.conversationId) {
            conversationId = new ObjectId(payload.conversationId)

            // Block sending to closed conversations
            const conv = await databaseService.conversations.findOne({ _id: conversationId })
            if (conv && conv.status === 'closed') {
                throw new Error('Conversation đã được đóng. Vui lòng bắt đầu cuộc tư vấn mới.')
            }
        } else {
            // Create or get conversation for customer (shared inbox)
            if (senderRole === 'customer') {
                const conversation = await this.getOrCreateConversation(senderId)
                conversationId = conversation._id as ObjectId
            } else {
                // Pharmacist must provide conversationId
                throw new Error('Pharmacist must provide conversationId')
            }
        }

        // Create message
        const message = new Message({
            conversationId,
            senderId: senderObjectId,
            senderRole,
            content: payload.content || '',
            type: (payload.type as MessageType) || MessageType.Text,
            imageUrl: payload.imageUrl,
            productRef: payload.productRef,   // Forward product card data
            isRead: false
        })

        const result = await databaseService.messages.insertOne(message)

        // Update conversation's last message
        const updateField = senderRole === 'customer' ? 'unreadCount.pharmacist' : 'unreadCount.customer'
        await databaseService.conversations.updateOne(
            { _id: conversationId },
            {
                $set: {
                    lastMessage: payload.content,
                    lastMessageAt: new Date(),
                    updatedAt: new Date()
                },
                $inc: {
                    [updateField]: 1
                }
            }
        )

        return {
            ...message,
            _id: result.insertedId
        }
    }

    // Get messages for a conversation
    async getMessages(conversationId: string, page = 1, limit = 50) {
        const conversationObjectId = new ObjectId(conversationId)
        const skip = (page - 1) * limit

        const [messages, total] = await Promise.all([
            databaseService.messages
                .find({ conversationId: conversationObjectId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .toArray(),
            databaseService.messages.countDocuments({ conversationId: conversationObjectId })
        ])

        return {
            messages: messages.reverse(), // Reverse to show oldest first
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        }
    }

    // Mark messages as read
    async markAsRead(conversationId: string, userId: string, userRole: 'customer' | 'pharmacist') {
        const conversationObjectId = new ObjectId(conversationId)
        const userObjectId = new ObjectId(userId)

        // Mark all unread messages from the other party as read
        await databaseService.messages.updateMany(
            {
                conversationId: conversationObjectId,
                senderId: { $ne: userObjectId },
                isRead: false
            },
            {
                $set: { isRead: true, updatedAt: new Date() }
            }
        )

        // Reset unread count for this user
        const updateField = userRole === 'customer' ? 'unreadCount.customer' : 'unreadCount.pharmacist'
        await databaseService.conversations.updateOne(
            { _id: conversationObjectId },
            {
                $set: {
                    [updateField]: 0,
                    updatedAt: new Date()
                }
            }
        )

        return { success: true }
    }

    // Get conversation by ID
    async getConversationById(conversationId: string) {
        const conversationObjectId = new ObjectId(conversationId)

        const conversations = await databaseService.conversations
            .aggregate([
                { $match: { _id: conversationObjectId } },
                {
                    $lookup: {
                        from: process.env.USERS_COLLECTION as string,
                        localField: 'customerId',
                        foreignField: '_id',
                        as: 'customer'
                    }
                },
                {
                    $lookup: {
                        from: process.env.USERS_COLLECTION as string,
                        localField: 'pharmacistId',
                        foreignField: '_id',
                        as: 'pharmacist'
                    }
                },
                { $unwind: '$customer' },
                { $unwind: { path: '$pharmacist', preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        customerId: 1,
                        pharmacistId: 1,
                        lastMessage: 1,
                        lastMessageAt: 1,
                        unreadCount: 1,
                        status: 1,
                        createdAt: 1,
                        updatedAt: 1,
                        'customer._id': 1,
                        'customer.firstName': 1,
                        'customer.lastName': 1,
                        'customer.avatar': 1,
                        'customer.isOnline': 1,
                        'pharmacist._id': 1,
                        'pharmacist.firstName': 1,
                        'pharmacist.lastName': 1,
                        'pharmacist.avatar': 1,
                        'pharmacist.isOnline': 1
                    }
                }
            ])
            .toArray()

        return conversations[0] || null
    }

    // Get available pharmacist (first pharmacist with role = 1)
    async getAvailablePharmacist() {
        const pharmacist = await databaseService.users.findOne({
            role: 1 // Pharmacist role
        })

        if (!pharmacist) {
            return null
        }

        return {
            _id: pharmacist._id,
            firstName: pharmacist.firstName,
            lastName: pharmacist.lastName
        }
    }

    // Smart assign: find online pharmacist with least open conversations (3.5)
    async assignPharmacist(conversationId: string): Promise<{ pharmacistId: ObjectId | null }> {
        const conversationObjectId = new ObjectId(conversationId)

        // Find all online pharmacists (role = 1, isOnline = true)
        const onlinePharmacists = await databaseService.users
            .find({ role: 1, isOnline: true })
            .toArray()

        if (onlinePharmacists.length === 0) {
            return { pharmacistId: null }
        }

        // Count open conversations per pharmacist
        const counts = await Promise.all(
            onlinePharmacists.map(async (p) => ({
                pharmacist: p,
                count: await databaseService.conversations.countDocuments({
                    pharmacistId: p._id,
                    status: 'active'
                })
            }))
        )

        // Pick pharmacist with fewest active conversations
        counts.sort((a, b) => a.count - b.count)
        const chosen = counts[0].pharmacist

        // Assign to conversation
        await databaseService.conversations.updateOne(
            { _id: conversationObjectId },
            { $set: { pharmacistId: chosen._id, updatedAt: new Date() } }
        )

        return { pharmacistId: chosen._id as ObjectId }
    }

    // Manual assign: assign specific pharmacist to conversation
    async assignConversationToPharmacist(conversationId: string, pharmacistId: string) {
        const conv = await databaseService.conversations.findOne({ _id: new ObjectId(conversationId) })
        if (!conv) throw new Error('Conversation not found')
        if (conv.status === 'closed') throw new Error('Không thể nhận cuộc hội thoại đã đóng')

        await databaseService.conversations.updateOne(
            { _id: new ObjectId(conversationId) },
            { $set: { pharmacistId: new ObjectId(pharmacistId), updatedAt: new Date() } }
        )
    }

    // Delete conversation and all its messages
    async deleteConversation(conversationId: string, userId: string) {
        const conversationObjectId = new ObjectId(conversationId)

        // Check if conversation exists
        const conversation = await databaseService.conversations.findOne({
            _id: conversationObjectId
        })

        if (!conversation) {
            throw new Error('Conversation not found')
        }

        // Permission check: customer can only delete their own, pharmacist can delete any
        const user = await databaseService.users.findOne({ _id: new ObjectId(userId) })
        if (!user) {
            throw new Error('User not found')
        }

        // If customer, must be their conversation
        if (user.role === 0 && conversation.customerId.toString() !== userId) {
            throw new Error('Access denied')
        }
        // Pharmacists (role 1) can delete any conversation in shared inbox

        // Delete all messages in this conversation
        await databaseService.messages.deleteMany({
            conversationId: conversationObjectId
        })

        // Delete the conversation
        await databaseService.conversations.deleteOne({
            _id: conversationObjectId
        })
    }

    // ==================== ADMIN METHODS ====================

    // Tổng quan số liệu chat cho admin dashboard
    async getChatStats() {
        const now = new Date()
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

        const [facetResult, todayMessages] = await Promise.all([
            databaseService.conversations.aggregate([
                {
                    $facet: {
                        total: [{ $count: 'count' }],
                        active: [{ $match: { status: 'active' } }, { $count: 'count' }],
                        closed: [{ $match: { status: 'closed' } }, { $count: 'count' }],
                        unassigned: [
                            { $match: { pharmacistId: { $exists: false }, status: 'active' } },
                            { $count: 'count' }
                        ],
                        todayNew: [
                            { $match: { createdAt: { $gte: todayStart } } },
                            { $count: 'count' }
                        ],
                        todayClosed: [
                            { $match: { status: 'closed', updatedAt: { $gte: todayStart } } },
                            { $count: 'count' }
                        ],
                        // Top 5 dược sĩ theo số conversation đang xử lý
                        topPharmacists: [
                            { $match: { pharmacistId: { $exists: true }, status: 'active' } },
                            { $group: { _id: '$pharmacistId', conversationCount: { $sum: 1 } } },
                            { $sort: { conversationCount: -1 } },
                            { $limit: 5 },
                            {
                                $lookup: {
                                    from: process.env.USERS_COLLECTION as string,
                                    localField: '_id',
                                    foreignField: '_id',
                                    as: 'pharmacist'
                                }
                            },
                            { $unwind: '$pharmacist' },
                            {
                                $project: {
                                    pharmacistId: '$_id',
                                    conversationCount: 1,
                                    'pharmacist.firstName': 1,
                                    'pharmacist.lastName': 1,
                                    'pharmacist.avatar': 1,
                                    'pharmacist.isOnline': 1
                                }
                            }
                        ]
                    }
                }
            ]).toArray(),
            databaseService.messages.countDocuments({
                createdAt: { $gte: todayStart }
            })
        ])

        const f = facetResult[0]
        return {
            totalConversations: f.total[0]?.count || 0,
            activeConversations: f.active[0]?.count || 0,
            closedConversations: f.closed[0]?.count || 0,
            unassignedConversations: f.unassigned[0]?.count || 0,
            todayStats: {
                newConversations: f.todayNew[0]?.count || 0,
                closedConversations: f.todayClosed[0]?.count || 0,
                messages: todayMessages
            },
            topPharmacists: f.topPharmacists || []
        }
    }

    // Danh sách conversations cho admin (có filter đầy đủ)
    async getAdminConversations(params: {
        page?: number
        limit?: number
        status?: string
        pharmacistId?: string
        search?: string
        dateFrom?: string
        dateTo?: string
    }) {
        const { page = 1, limit = 20, status, pharmacistId, search, dateFrom, dateTo } = params
        const skip = (page - 1) * limit

        const matchStage: Record<string, unknown> = {}
        if (status) matchStage.status = status
        if (pharmacistId) matchStage.pharmacistId = new ObjectId(pharmacistId)
        if (dateFrom || dateTo) {
            matchStage.createdAt = {}
            if (dateFrom) (matchStage.createdAt as Record<string, Date>).$gte = new Date(dateFrom)
            if (dateTo) (matchStage.createdAt as Record<string, Date>).$lte = new Date(dateTo + 'T23:59:59')
        }

        const pipeline = [
            { $match: matchStage },
            {
                $lookup: {
                    from: process.env.USERS_COLLECTION as string,
                    localField: 'customerId',
                    foreignField: '_id',
                    as: 'customer'
                }
            },
            {
                $lookup: {
                    from: process.env.USERS_COLLECTION as string,
                    localField: 'pharmacistId',
                    foreignField: '_id',
                    as: 'pharmacist'
                }
            },
            { $unwind: '$customer' },
            { $unwind: { path: '$pharmacist', preserveNullAndEmptyArrays: true } },
            // Filter by search (tên khách hàng)
            ...(search ? [{
                $match: {
                    $or: [
                        { 'customer.firstName': { $regex: search, $options: 'i' } },
                        { 'customer.lastName': { $regex: search, $options: 'i' } }
                    ]
                }
            }] : []),
            {
                $lookup: {
                    from: process.env.DB_MESSAGES_COLLECTION as string || 'messages',
                    localField: '_id',
                    foreignField: 'conversationId',
                    as: 'messageCount'
                }
            },
            {
                $project: {
                    _id: 1, customerId: 1, pharmacistId: 1, status: 1,
                    lastMessage: 1, lastMessageAt: 1, unreadCount: 1,
                    createdAt: 1, updatedAt: 1,
                    messageCount: { $size: '$messageCount' },
                    'customer._id': 1, 'customer.firstName': 1, 'customer.lastName': 1,
                    'customer.avatar': 1, 'customer.email': 1, 'customer.isOnline': 1,
                    'pharmacist._id': 1, 'pharmacist.firstName': 1, 'pharmacist.lastName': 1,
                    'pharmacist.avatar': 1, 'pharmacist.isOnline': 1
                }
            },
            { $sort: { lastMessageAt: -1, createdAt: -1 } as Record<string, 1 | -1> },
            // Admin chỉ thấy conversation đã có ít nhất 1 tin nhắn
            { $match: { messageCount: { $gt: 0 } } }
        ]

        const [conversations, totalResult] = await Promise.all([
            databaseService.conversations.aggregate([...pipeline, { $skip: skip }, { $limit: limit }]).toArray(),
            databaseService.conversations.aggregate([...pipeline, { $count: 'total' }]).toArray()
        ])

        const total = totalResult[0]?.total || 0
        return {
            conversations,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        }
    }

    // Admin đóng conversation
    async adminCloseConversation(conversationId: string) {
        const result = await databaseService.conversations.findOneAndUpdate(
            { _id: new ObjectId(conversationId) },
            { $set: { status: 'closed', updatedAt: new Date() } },
            { returnDocument: 'after' }
        )
        if (!result) throw new Error('Conversation not found')
        return result
    }

    // Admin chuyển conversation sang dược sĩ khác
    async adminTransferConversation(conversationId: string, targetPharmacistId: string) {
        // Verify pharmacist tồn tại và là dược sĩ
        const pharmacist = await databaseService.users.findOne({
            _id: new ObjectId(targetPharmacistId),
            role: 1
        })
        if (!pharmacist) throw new Error('Pharmacist not found')

        const result = await databaseService.conversations.findOneAndUpdate(
            { _id: new ObjectId(conversationId) },
            { $set: { pharmacistId: new ObjectId(targetPharmacistId), updatedAt: new Date() } },
            { returnDocument: 'after' }
        )
        if (!result) throw new Error('Conversation not found')
        return result
    }
}

const chatsService = new ChatsService()
export default chatsService
