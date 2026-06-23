import { ObjectId } from 'mongodb'
import { FIXED_NOW, notificationTestUserIds, type NotificationPreferenceType } from './users'

export type TestNotificationStatus = 'queued' | 'sent' | 'skipped' | 'failed' | 'read' | 'unread'
export type TestNotificationChannel = 'inApp' | 'email' | 'push' | 'sms' | 'socket'

export interface NotificationFixture {
  _id: ObjectId
  userId: ObjectId
  type: NotificationPreferenceType
  title: string
  message: string
  isRead: boolean
  readAt?: Date
  actionUrl?: string
  metadata: Record<string, unknown>
  targetRole: 'customer' | 'admin' | 'pharmacist'
  eventKey: string
  status: TestNotificationStatus
  channels: TestNotificationChannel[]
  createdAt: Date
}

export const notificationTestIds = {
  orderPlaced: new ObjectId('666000000000000000000001'),
  paymentFailed: new ObjectId('666000000000000000000002'),
  eventReminder: new ObjectId('666000000000000000000003'),
  adminLowStock: new ObjectId('666000000000000000000004'),
  pharmacistReturn: new ObjectId('666000000000000000000005')
} as const

export function makeNotificationFixture(overrides: Partial<NotificationFixture> = {}): NotificationFixture {
  const id = overrides._id || notificationTestIds.orderPlaced
  const type = overrides.type || 'order'
  return {
    _id: id,
    userId: notificationTestUserIds.customer,
    type,
    title: 'Đặt hàng thành công',
    message: 'Đơn hàng ORD-TEST-001 đã được tiếp nhận.',
    isRead: false,
    actionUrl: '/account/orders',
    metadata: { orderNumber: 'ORD-TEST-001' },
    targetRole: 'customer',
    eventKey: `${type}:${id.toString()}:default`,
    status: 'unread',
    channels: ['inApp', 'socket'],
    createdAt: FIXED_NOW,
    ...overrides
  }
}

export const notificationFixtures = {
  orderPlaced: makeNotificationFixture(),
  paymentFailed: makeNotificationFixture({
    _id: notificationTestIds.paymentFailed,
    type: 'payment',
    title: 'Thanh toán thất bại',
    message: 'Thanh toán cho đơn hàng ORD-TEST-001 không thành công.',
    metadata: { orderNumber: 'ORD-TEST-001', paymentStatus: 'failed' },
    eventKey: 'order:ORD-TEST-001:payment:failed'
  }),
  eventReminder: makeNotificationFixture({
    _id: notificationTestIds.eventReminder,
    type: 'reminder',
    title: 'Hội thảo sắp bắt đầu',
    message: '"Chăm sóc sức khỏe tim mạch" sẽ bắt đầu trong 15 phút.',
    actionUrl: '/community/video-events/667000000000000000000001',
    metadata: { eventId: '667000000000000000000001' },
    eventKey: 'community-video-event:667000000000000000000001:reminder15m'
  }),
  adminLowStock: makeNotificationFixture({
    _id: notificationTestIds.adminLowStock,
    userId: notificationTestUserIds.admin,
    type: 'system',
    title: 'Cảnh báo tồn kho thấp',
    message: 'Sản phẩm "Vitamin C 1000mg" chỉ còn 3 đơn vị trong kho.',
    actionUrl: '/admin/inventory',
    metadata: { productId: '668000000000000000000001', stockQuantity: 3 },
    targetRole: 'admin',
    eventKey: 'product:668000000000000000000001:low-stock:3'
  }),
  pharmacistReturn: makeNotificationFixture({
    _id: notificationTestIds.pharmacistReturn,
    userId: notificationTestUserIds.pharmacist,
    type: 'return',
    title: 'Yêu cầu hoàn hàng mới',
    message: 'Yêu cầu hoàn hàng RET-TEST-001 vừa được tạo và cần xem xét.',
    actionUrl: '/pharmacist/returns',
    metadata: { requestNumber: 'RET-TEST-001' },
    targetRole: 'pharmacist',
    eventKey: 'return:RET-TEST-001:pharmacist:new'
  })
} as const

export function makeNotificationSeed(overrides: Partial<NotificationFixture>[] = []): NotificationFixture[] {
  if (overrides.length === 0) return Object.values(notificationFixtures).map((item) => makeNotificationFixture(item))
  return overrides.map((override) => makeNotificationFixture(override))
}
