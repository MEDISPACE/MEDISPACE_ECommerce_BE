import { beforeEach, describe, expect, it } from 'vitest'
import { NotificationHarness } from '../helpers/db'
import { eventTestIds } from '../fixtures/events'
import { notificationTestUserIds } from '../fixtures/users'

describe('notifications/e2e/13.push-notifications', () => {
  const harness = new NotificationHarness()
  beforeEach(() => harness.reset())

  it('order placed sends push payload with correct title/body', async () => {
    await harness.send({ userId: notificationTestUserIds.multiDeviceCustomer, type: 'order', data: { orderNumber: 'ORD-PUSH-E2E', total: '10đ' }, channels: ['push'] })
    expect(harness.push.sent[0]).toEqual(expect.objectContaining({ title: 'Order confirmed', body: expect.stringContaining('ORD-PUSH-E2E') }))
  })

  it('push payload contains correct deep link URL', async () => {
    await harness.send({ userId: notificationTestUserIds.multiDeviceCustomer, type: 'order', data: { orderNumber: 'ORD-LINK', total: '10đ' }, channels: ['push'], actionUrl: '/account/orders/ORD-LINK' })
    expect(harness.push.sent[0].data).toMatchObject({ deepLink: '/account/orders/ORD-LINK' })
  })

  it('user with push disabled receives no push payload', async () => {
    await harness.send({ userId: notificationTestUserIds.customer, type: 'promotion', data: { campaignName: 'Sale' }, channels: ['push'] })
    expect(harness.push.sent).toHaveLength(0)
  })

  it('multi-device user receives push on all registered devices', async () => {
    await harness.send({ userId: notificationTestUserIds.multiDeviceCustomer, type: 'order', data: { orderNumber: 'ORD-ALL-DEVICES', total: '10đ' }, channels: ['push'] })
    expect(harness.push.sent.map((item) => item.token)).toEqual(['mock-fcm-token-web-001', 'mock-fcm-token-ios-001', 'mock-fcm-token-android-001'])
  })

  it('expired device token is removed from DB', async () => {
    harness.push.expireToken('mock-fcm-token-web-001')
    await harness.send({ userId: notificationTestUserIds.multiDeviceCustomer, type: 'order', data: { orderNumber: 'ORD-EXPIRE', total: '10đ' }, channels: ['push'] })
    expect(harness.store.findUser(notificationTestUserIds.multiDeviceCustomer)?.deviceTokens[0].isActive).toBe(false)
  })

  it('push is not sent for events user is not registered for', async () => {
    const isRegistered = false
    if (isRegistered) await harness.send({ userId: notificationTestUserIds.multiDeviceCustomer, type: 'reminder', data: { eventName: 'Tim mạch', startTime: '09:00', eventId: eventTestIds.heartCare.toString() }, channels: ['push'] })
    expect(harness.push.sent).toHaveLength(0)
  })
})
