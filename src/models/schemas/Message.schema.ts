import { ObjectId } from 'mongodb'

export enum MessageType {
  Text = 'text',
  Image = 'image',
  Product = 'product', // Dược sĩ gửi product card
  System = 'system' // Tin nhắn hệ thống trung gian
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

export type AIClassification =
  | 'emergency'
  | 'mental_health_crisis'
  | 'prescription_request'
  | 'personalized_dosage'
  | 'prescription_status'
  | 'general'
  | 'drug_info_general'
  | 'product_search'
  | 'image_only_triage'
  | 'prescription_image_info'
  | 'product_image_info'
  | 'image_symptom_triage'
  | 'order_tracking'
  | 'loyalty_inquiry'
  | 'coupon_inquiry'
  | 'return_request'
  | string

interface MessageSchemaType {
  _id?: ObjectId
  conversationId: ObjectId
  senderId: ObjectId
  senderRole: 'customer' | 'pharmacist'
  content: string
  type: MessageType
  imageUrl?: string
  productRef?: ProductRef // chỉ có khi type === 'product'
  suggestedProducts?: ProductRef[] // sản phẩm được gợi ý bởi AI
  suggestedQuestions?: string[] // câu hỏi được gợi ý bởi AI
  feedback?: 'up' | 'down' // phản hồi từ khách hàng
  isRead: boolean
  isAI?: boolean
  aiClassification?: AIClassification
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
  suggestedProducts?: ProductRef[]
  suggestedQuestions?: string[]
  feedback?: 'up' | 'down'
  isRead: boolean
  isAI?: boolean
  aiClassification?: AIClassification
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
    this.suggestedProducts = message.suggestedProducts
    this.suggestedQuestions = message.suggestedQuestions
    this.feedback = message.feedback
    this.isRead = message.isRead || false
    this.isAI = message.isAI
    this.aiClassification = message.aiClassification
    this.createdAt = message.createdAt || date
    this.updatedAt = message.updatedAt || date
  }
}
