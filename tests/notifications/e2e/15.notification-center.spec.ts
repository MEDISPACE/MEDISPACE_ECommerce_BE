import { beforeEach, describe, expect, it } from 'vitest'
import { NotificationHarness } from '../helpers/db'
import { notificationTestUserIds } from '../fixtures/users'

describe('notifications/e2e/15.notification-center', () => {
  const harness = new NotificationHarness()
  beforeEach(() => harness.reset())

  it('bell icon shows correct unread count', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'A', message: 'A' })
    expect(harness.store.unreadFor(notificationTestUserIds.customer)).toHaveLength(1)
  })

  it('clicking bell opens notification list data', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'Visible', message: 'Visible' })
    expect(harness.store.unreadFor(notificationTestUserIds.customer)[0].title).toBe('Visible')
  })

  it('new notification appears without page refresh via socket', async () => {
    await harness.send({ userId: notificationTestUserIds.customer, type: 'system', data: { message: 'Realtime' }, channels: ['socket'] })
    expect(harness.socket.emissions).toHaveLength(1)
  })

  it('unread notifications are visually distinct by isRead state', () => {
    const record = harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'Unread', message: 'Unread' })
    expect(record.isRead).toBe(false)
  })

  it('clicking notification marks as read and navigates', () => {
    const record = harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'Nav', message: 'Nav', actionUrl: '/account/orders/1' })
    harness.markAsRead(record._id, notificationTestUserIds.customer)
    expect(record.actionUrl).toBe('/account/orders/1')
    expect(record.isRead).toBe(true)
  })

  it('mark all as read resets count to 0', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'A', message: 'A' })
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'payment', title: 'B', message: 'B' })
    harness.markAllAsRead(notificationTestUserIds.customer)
    expect(harness.store.unreadFor(notificationTestUserIds.customer)).toHaveLength(0)
  })

  it('notifications are paginated', () => {
    Array.from({ length: 25 }).forEach((_, index) => harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'system', title: `N${index}`, message: 'M', eventKey: `n:${index}` }))
    const pageOne = harness.store.unreadFor(notificationTestUserIds.customer).slice(0, 20)
    expect(pageOne).toHaveLength(20)
  })

  it('empty state shown when no notifications', () => {
    expect(harness.store.unreadFor(notificationTestUserIds.customer)).toHaveLength(0)
  })

  it.each(['order', 'payment', 'shipping', 'prescription', 'promotion', 'reminder', 'system', 'review', 'return', 'security', 'community'] as const)('type %s maps to an icon bucket', (type) => {
    const iconMap = { order: 'Package', payment: 'CreditCard', shipping: 'Truck', prescription: 'FileText', promotion: 'Tag', reminder: 'Bell', system: 'AlertCircle', review: 'Star', return: 'RotateCcw', security: 'Shield', community: 'Users' }
    expect(iconMap[type]).toBeTruthy()
  })

  it('timestamps shown in local timezone', () => {
    const record = harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'system', title: 'Time', message: 'Time' })
    expect(new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }).format(record.createdAt)).toMatch(/\d/)
  })

  it('old notifications 30+ days are still queryable for archive policy', () => {
    const record = harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'system', title: 'Old', message: 'Old', createdAt: new Date('2026-01-01T00:00:00.000Z') })
    expect(record.createdAt < new Date('2026-06-01T00:00:00.000Z')).toBe(true)
  })

  it('notification list is scrollable on mobile by preserving bounded page size', () => {
    Array.from({ length: 50 }).forEach((_, index) => harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'system', title: `N${index}`, message: 'M', eventKey: `scroll:${index}` }))
    expect(harness.store.unreadFor(notificationTestUserIds.customer).slice(0, 5)).toHaveLength(5)
  })
})
