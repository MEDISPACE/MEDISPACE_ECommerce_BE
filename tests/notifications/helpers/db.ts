import { ObjectId } from 'mongodb'
import { vi } from 'vitest'
import { makeNotificationFixture, type NotificationFixture, type TestNotificationChannel } from '../fixtures/notifications'
import {
  allNotificationUsers,
  defaultNotificationPreferences,
  type NotificationPreferenceFixture,
  type NotificationPreferenceType,
  type NotificationUserFixture
} from '../fixtures/users'
import { makeCommunityVideoEventFixture, makeEventRegistrationFixture, type CommunityVideoEventFixture, type CommunityVideoEventRegistrationFixture } from '../fixtures/events'
import { makeOrderFixture, type OrderFixture } from '../fixtures/orders'
import { createMockEmailProvider } from './email'
import { createMockPushProvider } from './push'
import { createMockSocketServer } from './socket'

export class NotFoundError extends Error { name = 'NotFoundError' }
export class TemplateError extends Error { name = 'TemplateError' }
export class ValidationError extends Error { name = 'ValidationError' }

export const CRITICAL_TYPES: NotificationPreferenceType[] = ['order', 'payment', 'shipping', 'prescription', 'return', 'security']
export const ALL_TYPES: NotificationPreferenceType[] = ['order', 'payment', 'shipping', 'prescription', 'promotion', 'reminder', 'system', 'review', 'return', 'security', 'community']

export class NotificationTestStore {
  users = new Map<string, NotificationUserFixture>()
  notifications = new Map<string, NotificationFixture>()
  events = new Map<string, CommunityVideoEventFixture>()
  registrations = new Map<string, CommunityVideoEventRegistrationFixture>()
  orders = new Map<string, OrderFixture>()
  idempotency = new Map<string, Date>()
  deadLetters: Array<Record<string, unknown>> = []
  logs: Array<Record<string, unknown>> = []

  seedUsers(users: NotificationUserFixture[] = allNotificationUsers) {
    users.forEach((user) => this.users.set(user._id.toString(), { ...user, deviceTokens: [...user.deviceTokens] }))
  }

  seedNotifications(notifications: NotificationFixture[] = []) {
    notifications.forEach((notification) => this.notifications.set(notification._id.toString(), { ...notification }))
  }

  seedOrders(orders: OrderFixture[] = [makeOrderFixture()]) {
    orders.forEach((order) => this.orders.set(order._id.toString(), { ...order }))
  }

  seedEvents(events: CommunityVideoEventFixture[] = [makeCommunityVideoEventFixture()]) {
    events.forEach((event) => this.events.set(event._id.toString(), { ...event }))
  }

  seedRegistrations(registrations: CommunityVideoEventRegistrationFixture[] = [makeEventRegistrationFixture()]) {
    registrations.forEach((registration) => this.registrations.set(registration._id.toString(), { ...registration }))
  }

  reset() {
    this.users.clear()
    this.notifications.clear()
    this.events.clear()
    this.registrations.clear()
    this.orders.clear()
    this.idempotency.clear()
    this.deadLetters.length = 0
    this.logs.length = 0
  }

  findUser(userId: ObjectId | string) {
    return this.users.get(userId.toString())
  }

  createNotification(input: Partial<NotificationFixture> & Pick<NotificationFixture, 'userId' | 'type' | 'title' | 'message'>) {
    const eventKey = input.eventKey || `${input.type}:${input.userId.toString()}:${input.title}`
    const existing = Array.from(this.notifications.values()).find(
      (notification) => notification.userId.toString() === input.userId.toString() && notification.eventKey === eventKey
    )
    if (existing) return existing
    const notification = makeNotificationFixture({
      _id: input._id || new ObjectId(),
      targetRole: input.targetRole || 'customer',
      status: input.status || 'unread',
      channels: input.channels || ['inApp'],
      metadata: input.metadata || {},
      actionUrl: input.actionUrl,
      eventKey,
      ...input
    })
    this.notifications.set(notification._id.toString(), notification)
    this.idempotency.set(`${notification.userId.toString()}:${notification.eventKey}`, notification.createdAt)
    return notification
  }

  unreadFor(userId: ObjectId | string) {
    return Array.from(this.notifications.values()).filter(
      (notification) => notification.userId.toString() === userId.toString() && !notification.isRead
    )
  }
}

export function clonePreferences(preferences?: Partial<NotificationPreferenceFixture>): NotificationPreferenceFixture {
  return {
    channels: { ...defaultNotificationPreferences.channels, ...(preferences?.channels || {}) },
    types: { ...defaultNotificationPreferences.types, ...(preferences?.types || {}) }
  }
}

export function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function truncate(value: string, max = 120) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export function renderNotificationTemplate(type: NotificationPreferenceType, data: Record<string, unknown>) {
  const requireField = (key: string) => {
    const value = data[key]
    if (value === null || value === undefined || value === '') throw new TemplateError(`Missing required template field: ${key}`)
    return truncate(escapeHtml(String(value)))
  }
  const optional = (key: string, fallback: string) => truncate(escapeHtml(String(data[key] ?? fallback)))
  const templates: Record<NotificationPreferenceType, () => { title: string; html: string; text: string }> = {
    order: () => ({ title: 'Order confirmed', html: `<p>Đơn hàng ${requireField('orderNumber')} tổng ${requireField('total')} đã được xác nhận.</p>`, text: `Đơn hàng ${data.orderNumber} đã được xác nhận.` }),
    payment: () => ({ title: 'Payment update', html: `<p>Thanh toán ${optional('paymentStatus', 'đang xử lý')} cho ${requireField('orderNumber')}.</p>`, text: `Thanh toán ${data.paymentStatus ?? 'đang xử lý'} cho ${data.orderNumber}.` }),
    shipping: () => ({ title: 'Shipping update', html: `<p>Mã vận đơn ${optional('trackingNumber', 'đang cập nhật')}</p>`, text: `Mã vận đơn ${data.trackingNumber ?? 'đang cập nhật'}` }),
    prescription: () => ({ title: 'Prescription update', html: `<p>Đơn thuốc ${requireField('prescriptionNumber')} ${optional('status', 'đã cập nhật')}.</p>`, text: `Đơn thuốc ${data.prescriptionNumber} đã cập nhật.` }),
    promotion: () => ({ title: 'Promotion', html: `<p>${requireField('campaignName')}</p>`, text: String(data.campaignName) }),
    reminder: () => ({ title: 'Event reminder', html: `<p>${requireField('eventName')} bắt đầu lúc ${requireField('startTime')}.</p>`, text: `${data.eventName} bắt đầu lúc ${data.startTime}.` }),
    system: () => ({ title: 'System alert', html: `<p>${optional('message', 'Có cập nhật mới từ MediSpace')}</p>`, text: String(data.message ?? 'Có cập nhật mới từ MediSpace') }),
    review: () => ({ title: 'Review update', html: `<p>Đánh giá ${optional('productName', 'sản phẩm')} ${optional('status', 'đã cập nhật')}.</p>`, text: `Đánh giá ${data.productName ?? 'sản phẩm'} đã cập nhật.` }),
    return: () => ({ title: 'Return update', html: `<p>Yêu cầu ${requireField('requestNumber')} ${optional('status', 'đã cập nhật')}.</p>`, text: `Yêu cầu ${data.requestNumber} đã cập nhật.` }),
    security: () => ({ title: 'Security alert', html: `<p>${requireField('message')}</p>`, text: String(data.message) }),
    community: () => ({ title: 'Community event', html: `<p>${requireField('eventName')}</p>`, text: String(data.eventName) })
  }
  const template = templates[type]
  if (!template) throw new TemplateError(`Missing template: ${type}`)
  return template()
}

export function getChannelsFor(user: NotificationUserFixture, type: NotificationPreferenceType, requested: TestNotificationChannel[] = ['inApp', 'email', 'push', 'socket']) {
  const preferences = clonePreferences(user.notificationPreferences)
  const critical = CRITICAL_TYPES.includes(type)
  if (!critical && preferences.types[type] === false) return []
  return requested.filter((channel) => {
    if (channel === 'socket') return true
    if (channel === 'inApp') return critical || preferences.channels.inApp
    if (channel === 'email') return critical || preferences.channels.email
    if (channel === 'push') return preferences.channels.push
    if (channel === 'sms') return preferences.channels.sms
    return false
  })
}

export class NotificationHarness {
  store = new NotificationTestStore()
  email = createMockEmailProvider()
  push = createMockPushProvider()
  socket = createMockSocketServer()
  sms = { send: vi.fn(async () => ({ messageId: 'sms-mock' })) }

  reset() {
    this.store.reset()
    this.email.reset()
    this.push.reset()
    this.socket.reset()
    this.sms.send.mockClear()
    this.store.seedUsers()
  }

  getPreferences(userId: ObjectId | string) {
    const user = this.store.findUser(userId)
    if (!user) throw new NotFoundError('User not found')
    return clonePreferences(user.notificationPreferences)
  }

  updatePreferences(userId: ObjectId | string, preferences: Partial<NotificationPreferenceFixture>) {
    const invalidChannels = Object.keys(preferences.channels || {}).filter(
      (channel) => !['inApp', 'email', 'push', 'sms'].includes(channel)
    )
    if (invalidChannels.length > 0) throw new ValidationError(`Invalid channel: ${invalidChannels[0]}`)
    const user = this.store.findUser(userId)
    if (!user) throw new NotFoundError('User not found')
    user.notificationPreferences = clonePreferences(preferences)
    return user.notificationPreferences
  }

  createNotificationRecord(input: Partial<NotificationFixture> & Pick<NotificationFixture, 'userId' | 'type' | 'title' | 'message'>) {
    return this.store.createNotification(input)
  }

  async send(input: {
    userId: ObjectId
    type: NotificationPreferenceType | 'missing-template'
    data: Record<string, unknown>
    channels?: TestNotificationChannel[]
    title?: string
    message?: string
    actionUrl?: string
    eventKey?: string
  }) {
    const user = this.store.findUser(input.userId)
    if (!user) throw new NotFoundError('User not found')
    if (input.type === 'missing-template') throw new TemplateError('Missing template: missing-template')
    const rendered = renderNotificationTemplate(input.type, input.data)
    const channels = getChannelsFor(user, input.type, input.channels)
    const record = channels.includes('inApp')
      ? this.createNotificationRecord({
        userId: input.userId,
        type: input.type,
        title: input.title || rendered.title,
        message: input.message || rendered.text,
        actionUrl: input.actionUrl,
        metadata: input.data,
        channels,
        eventKey: input.eventKey
      })
      : null
    const deliveries: Array<{ channel: string; status: string; reason?: string }> = []
    for (const channel of channels) {
      try {
        if (channel === 'email') await this.email.send({ to: user.email, subject: rendered.title, html: rendered.html, text: rendered.text })
        if (channel === 'push') {
          for (const token of user.deviceTokens.filter((device) => device.isActive)) {
            const result = await this.push.send({ token: token.token, title: rendered.title, body: rendered.text, data: { type: input.type, deepLink: input.actionUrl } })
            if (result.reason === 'expired-token') token.isActive = false
          }
        }
        if (channel === 'socket') this.socket.to(`user:${input.userId.toString()}`).emit('notification:new', { type: input.type, title: rendered.title, message: rendered.text })
        if (channel === 'sms') await this.sms.send({ to: user.phoneNumber, message: rendered.text })
        deliveries.push({ channel, status: 'sent' })
      } catch (error) {
        this.store.logs.push({ userId: input.userId.toString(), type: input.type, channel, error, timestamp: new Date() })
        deliveries.push({ channel, status: 'failed' })
      }
    }
    return { userId: input.userId.toString(), type: input.type, skipped: channels.length === 0, notification: record, deliveries }
  }

  async sendBulk(userIds: ObjectId[], payload: Omit<Parameters<NotificationHarness['send']>[0], 'userId'>) {
    const results = await Promise.allSettled(userIds.map((userId) => this.send({ ...payload, userId })))
    return {
      total: userIds.length,
      sent: results.filter((result) => result.status === 'fulfilled' && !result.value.skipped).length,
      skipped: results.filter((result) => result.status === 'fulfilled' && result.value.skipped).length,
      failed: results.filter((result) => result.status === 'rejected').length,
      results
    }
  }

  markAsRead(notificationId: ObjectId | string, userId: ObjectId | string) {
    const notification = this.store.notifications.get(notificationId.toString())
    if (notification && notification.userId.toString() === userId.toString()) {
      notification.isRead = true
      notification.status = 'read'
      notification.readAt = new Date()
    }
    return notification
  }

  markAllAsRead(userId: ObjectId | string) {
    const unread = this.store.unreadFor(userId)
    unread.forEach((notification) => this.markAsRead(notification._id, userId))
    return unread.length
  }
}

export class NotificationQueueHarness {
  jobs: Array<{ id: string; payload: Record<string, unknown>; attempts: number; maxRetries: number; status: string; createdAt: Date }> = []
  deadLetters: Array<Record<string, unknown>> = []
  completed: string[] = []

  constructor(private readonly processor: (payload: Record<string, unknown>) => Promise<void>) {}

  add(payload: Record<string, unknown>, options: { maxRetries?: number; createdAt?: Date } = {}) {
    const job = { id: `job-${this.jobs.length + 1}`, payload, attempts: 0, maxRetries: options.maxRetries ?? 3, status: 'queued', createdAt: options.createdAt || new Date() }
    this.jobs.push(job)
    return job
  }

  async processNext() {
    const job = this.jobs.find((item) => item.status === 'queued')
    if (!job) return null
    job.status = 'active'
    while (job.attempts < job.maxRetries) {
      job.attempts += 1
      try {
        await this.processor(job.payload)
        job.status = 'completed'
        this.completed.push(job.id)
        return job
      } catch (error) {
        if (job.attempts >= job.maxRetries) {
          job.status = 'failed'
          this.deadLetters.push({ jobId: job.id, payload: job.payload, error, attempts: job.attempts, timestamp: new Date() })
          return job
        }
      }
    }
    return job
  }

  async processAll() {
    const processed = []
    while (this.jobs.some((job) => job.status === 'queued')) processed.push(await this.processNext())
    return processed
  }

  idle() {
    return this.jobs.every((job) => job.status !== 'queued' && job.status !== 'active')
  }
}

export function dedupeKey(type: NotificationPreferenceType, entityId: string, status?: string) {
  return [type, entityId, status].filter(Boolean).join(':')
}

export function withinWindow(existing: Date | undefined, now: Date, windowMs = 5 * 60 * 1000) {
  return Boolean(existing && now.getTime() - existing.getTime() <= windowMs)
}
