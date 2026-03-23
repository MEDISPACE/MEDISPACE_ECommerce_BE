import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import Conversation from '~/models/schemas/Conversation.schema'
import Message, { MessageType } from '~/models/schemas/Message.schema'
import { SendMessageReqBody } from '~/models/requests/Chat.request'

class ChatsService {
    // Get or create conversation for customer (shared inbox - no specific pharmacist)
    async getOrCreateConversation(customerId: string) {
        const customerObjectId = new ObjectId(customerId)

        // Try to find existing conversation for this customer
        let conversation = await databaseService.conversations.findOne({
            customerId: customerObjectId
        })

        // If no conversation exists, create one
        if (!conversation) {
            const newConversation = new Conversation({
                customerId: customerObjectId,
                // No pharmacistId - shared inbox model
                status: 'active'
            })

            const result = await databaseService.conversations.insertOne(newConversation)
            conversation = { ...newConversation, _id: result.insertedId }
        }

        return conversation
    }

    // Get all conversations for a user (customer or pharmacist)
    async getConversations(userId: string, role: 'customer' | 'pharmacist', page = 1, limit = 20) {
        const userObjectId = new ObjectId(userId)
        const skip = (page - 1) * limit

        // Shared inbox: pharmacists see ALL conversations, customers see only their own
        const query = role === 'customer' ? { customerId: userObjectId } : {}

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
}

const chatsService = new ChatsService()
export default chatsService
