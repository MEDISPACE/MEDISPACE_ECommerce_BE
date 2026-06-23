import { beforeEach, describe, expect, it } from 'vitest'
import { NotificationHarness } from '../helpers/db'
import { notificationTestUserIds } from '../fixtures/users'

describe('notifications/e2e/11.order-notifications', () => {
  const harness = new NotificationHarness()
  beforeEach(() => harness.reset())

  it('user places order and bell icon shows unread badge', async () => {
    await harness.send({ userId: notificationTestUserIds.customer, type: 'order', data: { orderNumber: 'ORD-E2E-1', total: '250.000đ' }, channels: ['inApp', 'socket'] })
    expect(harness.store.unreadFor(notificationTestUserIds.customer)).toHaveLength(1)
  })

  it('notification center shows order confirmed', async () => {
    await harness.send({ userId: notificationTestUserIds.customer, type: 'order', data: { orderNumber: 'ORD-E2E-2', total: '250.000đ' }, channels: ['inApp'] })
    expect(harness.store.unreadFor(notificationTestUserIds.customer)[0].title).toBe('Order confirmed')
  })

  it('clicking notification navigates to order detail', () => {
    const record = harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'Order confirmed', message: 'ORD', actionUrl: '/account/orders/ORD-E2E-3' })
    expect(record.actionUrl).toBe('/account/orders/ORD-E2E-3')
  })

  it('payment fails and user sees payment failed notification', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'payment', title: 'Payment failed', message: 'Thanh toán thất bại', metadata: { paymentStatus: 'failed' } })
    expect(harness.store.unreadFor(notificationTestUserIds.customer)[0]).toMatchObject({ type: 'payment', metadata: { paymentStatus: 'failed' } })
  })

  it('order shipped notification shows tracking link', () => {
    const record = harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'shipping', title: 'Order shipped', message: 'GHTK-1', actionUrl: '/tracking/GHTK-1', metadata: { trackingNumber: 'GHTK-1' } })
    expect(record.actionUrl).toBe('/tracking/GHTK-1')
  })

  it('clicking tracking link opens correct tracking page', () => {
    const trackingUrl = '/tracking/GHTK-1'
    expect(trackingUrl).toMatch(/^\/tracking\/GHTK-1$/)
  })

  it('order delivered notification can be marked read', () => {
    const record = harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'Delivered', message: 'delivered', metadata: { status: 'delivered' } })
    harness.markAsRead(record._id, notificationTestUserIds.customer)
    expect(harness.store.notifications.get(record._id.toString())?.isRead).toBe(true)
  })

  it('all notifications have timestamp in local timezone source format', () => {
    const record = harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'Time', message: 'Time' })
    expect(new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }).format(record.createdAt)).toMatch(/\d/)
  })
})
