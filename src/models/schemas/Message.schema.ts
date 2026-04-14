import { ObjectId } from 'mongodb'

export enum MessageType {
  Text = 'text',
  Image = 'image',
  Product = 'product' // Dược sĩ gửi product card
}

export interface ProductRef {
  productId: string
  name: string
  slug: string
  price: number
  unit: string
  imageUrl?: string
  requiresPrescription?: boolean
}

interface MessageSchemaType {
  _id?: ObjectId
  conversationId: ObjectId
  senderId: ObjectId
  senderRole: 'customer' | 'pharmacist'
  content: string
  type: MessageType
  imageUrl?: string
  productRef?: ProductRef // chỉ có khi type === 'product'
  isRead: boolean
  createdAt?: Date
  updatedAt?: Date
}

export default class Message {
  _id?: ObjectId
  conversationId: ObjectId
  senderId: ObjectId
  senderRole: 'customer' | 'pharmacist'
  content: string
  type: MessageType
  imageUrl?: string
  productRef?: ProductRef
  isRead: boolean
  createdAt?: Date
  updatedAt?: Date

  constructor(message: MessageSchemaType) {
    const date = new Date()
    this._id = message._id
    this.conversationId = message.conversationId
    this.senderId = message.senderId
    this.senderRole = message.senderRole
    this.content = message.content
    this.type = message.type || MessageType.Text
    this.imageUrl = message.imageUrl
    this.productRef = message.productRef
    this.isRead = message.isRead || false
    this.createdAt = message.createdAt || date
    this.updatedAt = message.updatedAt || date
  }
}
