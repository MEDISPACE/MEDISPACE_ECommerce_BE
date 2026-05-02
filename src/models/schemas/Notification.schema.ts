import { ObjectId } from 'mongodb'

export type NotificationTypeEnum = 'order' | 'prescription' | 'promotion' | 'reminder' | 'system'
export type NotificationTargetRole = 'customer' | 'admin' | 'pharmacist'

interface NotificationConstructor {
  _id?: ObjectId
  userId: ObjectId
  type: NotificationTypeEnum
  title: string
  message: string
  isRead?: boolean
  readAt?: Date
  actionUrl?: string
  metadata?: Record<string, unknown>  // orderId, prescriptionId, etc. for deep-linking
  targetRole?: NotificationTargetRole // who this notification is for
  createdAt?: Date
}

export default class Notification {
  _id?: ObjectId
  userId: ObjectId
  type: NotificationTypeEnum
  title: string
  message: string
  isRead: boolean
  readAt?: Date
  actionUrl?: string
  metadata?: Record<string, unknown>
  targetRole: NotificationTargetRole
  createdAt: Date

  constructor(notification: NotificationConstructor) {
    const date = new Date()
    this._id = notification._id
    this.userId = notification.userId
    this.type = notification.type
    this.title = notification.title
    this.message = notification.message
    this.isRead = notification.isRead || false
    this.readAt = notification.readAt
    this.actionUrl = notification.actionUrl
    this.metadata = notification.metadata
    this.targetRole = notification.targetRole || 'customer'
    this.createdAt = notification.createdAt || date
  }
}
