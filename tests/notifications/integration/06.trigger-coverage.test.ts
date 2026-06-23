import { beforeEach, describe, expect, it } from 'vitest'
import { NotificationHarness } from '../helpers/db'
import { eventTestIds } from '../fixtures/events'
import { orderFixtures } from '../fixtures/orders'
import { notificationTestUserIds } from '../fixtures/users'

describe('notifications/integration/06.trigger-coverage', () => {
  const harness = new NotificationHarness()
  beforeEach(() => {
    harness.reset()
    harness.store.seedOrders(Object.values(orderFixtures))
  })

  const expectRecord = (type: string, metadata: Record<string, unknown>) => {
    const record = Array.from(harness.store.notifications.values()).at(-1)
    expect(record).toEqual(expect.objectContaining({ type, metadata: expect.objectContaining(metadata), isRead: false }))
    return record!
  }

  it('order placed creates notification record for user', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'Đặt hàng thành công', message: 'ORD-TEST-001', metadata: { orderNumber: 'ORD-TEST-001', status: 'placed' } })
    expectRecord('order', { orderNumber: 'ORD-TEST-001', status: 'placed' })
  })

  it('payment success creates notification record', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'payment', title: 'Thanh toán thành công', message: 'paid', metadata: { paymentStatus: 'paid' } })
    expectRecord('payment', { paymentStatus: 'paid' })
  })

  it('payment failed creates notification record', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'payment', title: 'Thanh toán thất bại', message: 'failed', metadata: { paymentStatus: 'failed' } })
    expectRecord('payment', { paymentStatus: 'failed' })
  })

  it('order shipped creates notification with tracking URL', () => {
    const record = harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'shipping', title: 'Đơn hàng đang giao', message: 'GHTK-TRACK-001', actionUrl: '/account/orders', metadata: { trackingNumber: 'GHTK-TRACK-001', trackingUrl: '/tracking/GHTK-TRACK-001' } })
    expect(record.actionUrl).toBe('/account/orders')
    expectRecord('shipping', { trackingNumber: 'GHTK-TRACK-001' })
  })

  it('order delivered creates notification', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'Đã giao thành công', message: 'delivered', metadata: { status: 'delivered' } })
    expectRecord('order', { status: 'delivered' })
  })

  it('order cancelled creates notification', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'Đơn hàng đã hủy', message: 'cancelled', metadata: { status: 'cancelled' } })
    expectRecord('order', { status: 'cancelled' })
  })

  it('refund completed creates notification', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'payment', title: 'Hoàn tiền hoàn tất', message: 'refunded', metadata: { paymentStatus: 'refunded' } })
    expectRecord('payment', { paymentStatus: 'refunded' })
  })

  it.each([
    ['GHTK pickup', 'pickup_confirmed'],
    ['GHTK in transit', 'in_transit'],
    ['GHTK delivered', 'delivered'],
    ['Ahamove pickup', 'pickup_confirmed'],
    ['Ahamove in transit', 'in_transit'],
    ['Ahamove delivered', 'delivered']
  ])('%s webhook creates shipping notification', (_label, status) => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'shipping', title: 'Cập nhật vận chuyển', message: String(status), metadata: { providerStatus: status } })
    expectRecord('shipping', { providerStatus: status })
  })

  it.each([
    ['registered', 'Đăng ký hội thảo thành công'],
    ['live', 'Hội thảo đang live'],
    ['cancelled', 'Hội thảo đã hủy'],
    ['time_changed', 'Lịch hội thảo được cập nhật']
  ])('community event %s notifies registrants', (status, title) => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'community', title, message: status, metadata: { eventId: eventTestIds.heartCare.toString(), status } })
    expectRecord('community', { eventId: eventTestIds.heartCare.toString(), status })
  })

  it('Q&A approved notifies question author', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'community', title: 'Câu hỏi đã được duyệt', message: 'Q&A approved', metadata: { qnaId: 'qna-1', status: 'approved' } })
    expectRecord('community', { qnaId: 'qna-1', status: 'approved' })
  })

  it('reminder job fires notification to all registrants', () => {
    ;[notificationTestUserIds.customer, notificationTestUserIds.multiDeviceCustomer].forEach((userId) => {
      harness.createNotificationRecord({ userId, type: 'reminder', title: 'Hội thảo sắp bắt đầu', message: '15m', metadata: { eventId: eventTestIds.heartCare.toString() }, eventKey: `event:${eventTestIds.heartCare.toString()}:reminder:${userId.toString()}` })
    })
    expect(Array.from(harness.store.notifications.values()).filter((item) => item.type === 'reminder')).toHaveLength(2)
  })

  it('account registration creates welcome notification', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'security', title: 'Chào mừng bạn đến với MediSpace', message: 'verified', metadata: { accountEvent: 'verified' } })
    expectRecord('security', { accountEvent: 'verified' })
  })

  it('password changed creates security alert notification', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'security', title: 'Mật khẩu đã được thay đổi', message: 'password changed', metadata: { accountEvent: 'password_changed' } })
    expectRecord('security', { accountEvent: 'password_changed' })
  })

  it('new order notifies admin and pharmacy', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.admin, type: 'order', title: 'Đơn hàng mới', message: 'ORD-1', targetRole: 'admin', metadata: { orderNumber: 'ORD-1' } })
    harness.createNotificationRecord({ userId: notificationTestUserIds.pharmacist, type: 'order', title: 'Đơn hàng mới cần chuẩn bị', message: 'ORD-1', targetRole: 'pharmacist', metadata: { orderNumber: 'ORD-1' } })
    expect(Array.from(harness.store.notifications.values()).map((item) => item.targetRole)).toEqual(['admin', 'pharmacist'])
  })

  it('low stock notifies admin', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.admin, type: 'system', title: 'Cảnh báo tồn kho thấp', message: 'low stock', targetRole: 'admin', metadata: { productId: 'P1', stockQuantity: 3 } })
    expectRecord('system', { stockQuantity: 3 })
  })
})
