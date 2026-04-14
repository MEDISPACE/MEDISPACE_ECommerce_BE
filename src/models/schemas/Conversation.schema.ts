import { ObjectId } from 'mongodb'

interface ConversationType {
  _id?: ObjectId
  customerId: ObjectId
  pharmacistId?: ObjectId // Optional for shared inbox
  lastMessage?: string
  lastMessageAt?: Date
  unreadCount?: {
    customer: number
    pharmacist: number
  }
  status?: 'active' | 'closed'
  createdAt?: Date
  updatedAt?: Date
  lastRepliedBy?: ObjectId
}

export default class Conversation {
  _id?: ObjectId
  customerId: ObjectId
  pharmacistId?: ObjectId // Optional - for shared inbox, any pharmacist can reply
  lastMessage: string
  lastMessageAt: Date
  unreadCount: {
    customer: number
    pharmacist: number
  }
  status: 'active' | 'closed'
  createdAt: Date
  updatedAt: Date
  lastRepliedBy?: ObjectId // Track which pharmacist replied last

  constructor(conversation: ConversationType) {
    this._id = conversation._id
    this.customerId = conversation.customerId
    this.pharmacistId = conversation.pharmacistId // Can be undefined
    this.lastMessage = conversation.lastMessage || ''
    this.lastMessageAt = conversation.lastMessageAt || new Date()
    this.unreadCount = conversation.unreadCount || { customer: 0, pharmacist: 0 }
    this.status = conversation.status || 'active'
    this.createdAt = conversation.createdAt || new Date()
    this.updatedAt = conversation.updatedAt || new Date()
    this.lastRepliedBy = conversation.lastRepliedBy
  }
}
