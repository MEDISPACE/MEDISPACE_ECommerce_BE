import { ObjectId } from 'mongodb'

export type NotificationTypeEnum = 'order' | 'prescription' | 'promotion' | 'reminder' | 'system'

interface NotificationConstructor {
  _id?: ObjectId
  userId: ObjectId
  type: NotificationTypeEnum
  title: string
  message: string
  isRead?: boolean
  actionUrl?: string
  createdAt?: Date
  expiresAt?: Date
}

export default class Notification {
  _id?: ObjectId
  userId: ObjectId
  type: NotificationTypeEnum
  title: string
  message: string
  isRead: boolean
  actionUrl?: string
  createdAt: Date
  expiresAt?: Date

  constructor(notification: NotificationConstructor) {
    const date = new Date()
    this._id = notification._id
    this.userId = notification.userId
    this.type = notification.type
    this.title = notification.title
    this.message = notification.message
    this.isRead = notification.isRead || false
    this.actionUrl = notification.actionUrl
    this.createdAt = notification.createdAt || date
    this.expiresAt = notification.expiresAt
  }
}
