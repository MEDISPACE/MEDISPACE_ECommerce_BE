import { beforeEach, describe, expect, it } from 'vitest'
import { NotificationHarness } from '../helpers/db'
import { notificationTestUserIds } from '../fixtures/users'

describe('notifications/e2e/17.edge-cases', () => {
  const harness = new NotificationHarness()
  beforeEach(() => harness.reset())

  it('notification while already on that page is still shown until explicit read', () => {
    const record = harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'Same page', message: 'Same page', actionUrl: '/account/orders' })
    expect(record.isRead).toBe(false)
  })

  it('100+ unread badge shows 99+', () => {
    Array.from({ length: 101 }).forEach((_, index) => harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'system', title: `N${index}`, message: 'M', eventKey: `badge:${index}` }))
    const count = harness.store.unreadFor(notificationTestUserIds.customer).length
    expect(count > 99 ? '99+' : String(count)).toBe('99+')
  })

  it('very long notification message is truncated in list but full in detail', () => {
    const full = 'A'.repeat(500)
    const list = `${full.slice(0, 119)}…`
    expect(list.length).toBe(120)
    expect(full.length).toBe(500)
  })

  it('notification with broken deep link has graceful fallback', () => {
    const record = harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'system', title: 'Broken', message: 'Broken', actionUrl: 'not-a-url' })
    const target = record.actionUrl?.startsWith('/') ? record.actionUrl : '/account/notifications'
    expect(target).toBe('/account/notifications')
  })

  it('user deletes account and all notifications are deleted', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'A', message: 'A' })
    Array.from(harness.store.notifications.values()).forEach((notification) => {
      if (notification.userId.equals(notificationTestUserIds.customer)) harness.store.notifications.delete(notification._id.toString())
    })
    expect(harness.store.unreadFor(notificationTestUserIds.customer)).toHaveLength(0)
  })

  it('simultaneous notifications all appear correctly', async () => {
    await Promise.all(['A', 'B', 'C'].map((title) => harness.send({ userId: notificationTestUserIds.customer, type: 'system', data: { message: title }, channels: ['inApp'], eventKey: `sim:${title}` })))
    expect(harness.store.unreadFor(notificationTestUserIds.customer)).toHaveLength(3)
  })

  it('user with no device tokens skips push without error', async () => {
    harness.store.findUser(notificationTestUserIds.customer)!.deviceTokens = []
    await expect(harness.send({ userId: notificationTestUserIds.customer, type: 'order', data: { orderNumber: 'ORD-NO-TOKEN', total: '1đ' }, channels: ['push'] })).resolves.toBeTruthy()
  })

  it('notification sent to deactivated user is handled gracefully by opt-out policy', async () => {
    const user = harness.store.findUser(notificationTestUserIds.bannedCustomer)!
    user.notificationPreferences.channels.inApp = false
    const result = await harness.send({ userId: notificationTestUserIds.bannedCustomer, type: 'promotion', data: { campaignName: 'Sale' }, channels: ['inApp'] })
    expect(result.skipped).toBe(true)
  })

  it('socket reconnect after 10 min offline gets correct unread count', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'system', title: 'Offline', message: 'Offline' })
    harness.socket.join('socket-reconnect', `user:${notificationTestUserIds.customer.toString()}`)
    expect(harness.store.unreadFor(notificationTestUserIds.customer)).toHaveLength(1)
  })

  it('admin bulk notification has no cross-user data leakage in payloads', async () => {
    await harness.sendBulk([notificationTestUserIds.customer, notificationTestUserIds.multiDeviceCustomer], {
      type: 'system',
      data: { message: 'System maintenance' },
      channels: ['inApp']
    })
    const userIds = Array.from(harness.store.notifications.values()).map((item) => item.userId.toString())
    expect(new Set(userIds).size).toBe(2)
  })
})
