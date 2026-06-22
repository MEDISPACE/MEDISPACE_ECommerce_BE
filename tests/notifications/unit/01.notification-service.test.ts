import { describe, it, expect, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'
import { NotificationHarness, NotFoundError, TemplateError } from '../helpers/db'
import { notificationTestUserIds } from '../fixtures/users'

describe('notifications/unit/01.notification-service', () => {
  const harness = new NotificationHarness()

  beforeEach(() => harness.reset())

  it('send() routes to correct channel per notification type', async () => {
    const result = await harness.send({
      userId: notificationTestUserIds.multiDeviceCustomer,
      type: 'order',
      data: { orderNumber: 'ORD-001', total: '250.000đ' },
      channels: ['inApp', 'email', 'push', 'socket']
    })

    expect(result.deliveries.map((item) => item.channel)).toEqual(['inApp', 'email', 'push', 'socket'])
    expect(harness.email.send).toHaveBeenCalledTimes(1)
    expect(harness.push.send).toHaveBeenCalledTimes(3)
    expect(harness.socket.emissions[0]).toMatchObject({ room: `user:${notificationTestUserIds.multiDeviceCustomer.toString()}`, event: 'notification:new' })
  })

  it('send() with user who opted out skips non-critical notifications', async () => {
    const result = await harness.send({
      userId: notificationTestUserIds.optedOutCustomer,
      type: 'promotion',
      data: { campaignName: 'Flash Sale' },
      channels: ['inApp', 'email', 'push', 'sms']
    })

    expect(result.skipped).toBe(true)
    expect(harness.email.send).not.toHaveBeenCalled()
    expect(harness.store.notifications.size).toBe(0)
  })

  it('send() with invalid userId throws NotFoundError', async () => {
    await expect(harness.send({
      userId: new ObjectId('665000000000000000009999'),
      type: 'order',
      data: { orderNumber: 'ORD-404', total: '0đ' }
    })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('send() with missing template throws TemplateError', async () => {
    await expect(harness.send({
      userId: notificationTestUserIds.customer,
      type: 'missing-template',
      data: {}
    })).rejects.toBeInstanceOf(TemplateError)
  })

  it('send() returns correct result shape', async () => {
    const result = await harness.send({
      userId: notificationTestUserIds.customer,
      type: 'order',
      data: { orderNumber: 'ORD-SHAPE', total: '99.000đ' }
    })

    expect(result).toEqual(expect.objectContaining({
      userId: notificationTestUserIds.customer.toString(),
      type: 'order',
      skipped: false,
      notification: expect.objectContaining({ type: 'order', isRead: false }),
      deliveries: expect.any(Array)
    }))
  })

  it('sendBulk() sends to all users in list', async () => {
    const result = await harness.sendBulk([notificationTestUserIds.customer, notificationTestUserIds.admin], {
      type: 'system',
      data: { message: 'Bảo trì hệ thống' },
      channels: ['inApp']
    })

    expect(result.total).toBe(2)
    expect(result.sent).toBe(2)
    expect(harness.store.notifications.size).toBe(2)
  })

  it('sendBulk() with empty list is a no-op', async () => {
    const result = await harness.sendBulk([], { type: 'system', data: { message: 'No-op' } })
    expect(result).toMatchObject({ total: 0, sent: 0, skipped: 0, failed: 0 })
  })

  it('sendBulk() partial failure still sends successful users', async () => {
    const result = await harness.sendBulk([notificationTestUserIds.customer, new ObjectId('665000000000000000009999')], {
      type: 'order',
      data: { orderNumber: 'ORD-BULK', total: '1đ' }
    })

    expect(result.sent).toBe(1)
    expect(result.failed).toBe(1)
    expect(harness.store.notifications.size).toBe(1)
  })

  it('createNotificationRecord() saves to DB correctly', () => {
    const record = harness.createNotificationRecord({
      userId: notificationTestUserIds.customer,
      type: 'shipping',
      title: 'Đơn hàng đang giao',
      message: 'Mã vận đơn GHTK-1',
      metadata: { trackingNumber: 'GHTK-1' },
      eventKey: 'shipping:GHTK-1'
    })

    expect(harness.store.notifications.get(record._id.toString())).toEqual(record)
    expect(record.metadata).toEqual({ trackingNumber: 'GHTK-1' })
  })

  it('markAsRead() updates status correctly', () => {
    const record = harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'T', message: 'M' })
    harness.markAsRead(record._id, notificationTestUserIds.customer)
    expect(harness.store.notifications.get(record._id.toString())).toMatchObject({ isRead: true, status: 'read' })
  })

  it('markAllAsRead() updates all unread for user atomically', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'A', message: 'A' })
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'payment', title: 'B', message: 'B' })
    harness.createNotificationRecord({ userId: notificationTestUserIds.admin, type: 'system', title: 'C', message: 'C' })

    expect(harness.markAllAsRead(notificationTestUserIds.customer)).toBe(2)
    expect(harness.store.unreadFor(notificationTestUserIds.customer)).toHaveLength(0)
    expect(harness.store.unreadFor(notificationTestUserIds.admin)).toHaveLength(1)
  })
})
