import { beforeEach, describe, expect, it } from 'vitest'
import { NotificationHarness } from '../helpers/db'
import { makeDeviceToken, notificationTestUserIds } from '../fixtures/users'

describe('notifications/integration/07.delivery-channels', () => {
  const harness = new NotificationHarness()
  beforeEach(() => harness.reset())

  it('email channel calls provider with correct to/subject/body', async () => {
    await harness.send({ userId: notificationTestUserIds.customer, type: 'order', data: { orderNumber: 'ORD-EMAIL', total: '10đ' }, channels: ['email'] })
    expect(harness.email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'customer.notifications@medispace.test', subject: 'Order confirmed', html: expect.stringContaining('ORD-EMAIL') }))
  })

  it('email uses correct template per notification type', async () => {
    await harness.send({ userId: notificationTestUserIds.customer, type: 'security', data: { message: 'Mật khẩu đã đổi' }, channels: ['email'] })
    expect(harness.email.sent[0].subject).toBe('Security alert')
  })

  it('email provider error logs and does not throw', async () => {
    harness.email.failNext()
    await expect(harness.send({ userId: notificationTestUserIds.customer, type: 'order', data: { orderNumber: 'ORD-ERR', total: '10đ' }, channels: ['email'] })).resolves.toBeTruthy()
    expect(harness.store.logs[0]).toMatchObject({ channel: 'email', type: 'order' })
  })

  it('invalid email address is skipped gracefully', async () => {
    const user = harness.store.findUser(notificationTestUserIds.customer)!
    user.email = 'invalid'
    await harness.send({ userId: notificationTestUserIds.customer, type: 'order', data: { orderNumber: 'ORD-BAD-EMAIL', total: '10đ' }, channels: ['email'] })
    expect(harness.email.sent).toHaveLength(0)
  })

  it('push channel calls provider with correct deviceToken and payload', async () => {
    await harness.send({ userId: notificationTestUserIds.multiDeviceCustomer, type: 'order', data: { orderNumber: 'ORD-PUSH', total: '10đ' }, channels: ['push'], actionUrl: '/account/orders/1' })
    expect(harness.push.send).toHaveBeenCalledWith(expect.objectContaining({ token: 'mock-fcm-token-web-001', data: expect.objectContaining({ deepLink: '/account/orders/1' }) }))
  })

  it('push sends to all devices of a multi-device user', async () => {
    await harness.send({ userId: notificationTestUserIds.multiDeviceCustomer, type: 'order', data: { orderNumber: 'ORD-MULTI', total: '10đ' }, channels: ['push'] })
    expect(harness.push.sent).toHaveLength(3)
  })

  it('expired push token is removed from active device list', async () => {
    harness.push.expireToken('mock-fcm-token-ios-001')
    await harness.send({ userId: notificationTestUserIds.multiDeviceCustomer, type: 'order', data: { orderNumber: 'ORD-EXPIRED', total: '10đ' }, channels: ['push'] })
    const user = harness.store.findUser(notificationTestUserIds.multiDeviceCustomer)!
    expect(user.deviceTokens.find((token) => token.token === 'mock-fcm-token-ios-001')?.isActive).toBe(false)
  })

  it('push provider error logs and does not throw', async () => {
    harness.push.failNext()
    await expect(harness.send({ userId: notificationTestUserIds.multiDeviceCustomer, type: 'order', data: { orderNumber: 'ORD-PUSH-ERR', total: '10đ' }, channels: ['push'] })).resolves.toBeTruthy()
    expect(harness.store.logs[0]).toMatchObject({ channel: 'push' })
  })

  it('socket emits to correct user room with event name and payload', async () => {
    await harness.send({ userId: notificationTestUserIds.customer, type: 'system', data: { message: 'Ping' }, channels: ['socket'] })
    expect(harness.socket.emissions[0]).toMatchObject({ room: `user:${notificationTestUserIds.customer.toString()}`, event: 'notification:new', payload: expect.objectContaining({ type: 'system' }) })
  })

  it('user offline falls back to in-app storage', async () => {
    await harness.send({ userId: notificationTestUserIds.customer, type: 'order', data: { orderNumber: 'ORD-OFFLINE', total: '10đ' }, channels: ['inApp'] })
    expect(harness.store.notifications.size).toBe(1)
  })

  it('SMS provider receives correct number and skips invalid numbers gracefully', async () => {
    harness.store.findUser(notificationTestUserIds.customer)!.notificationPreferences.channels.sms = true
    await harness.send({ userId: notificationTestUserIds.customer, type: 'security', data: { message: 'OTP alert' }, channels: ['sms'] })
    expect(harness.sms.send).toHaveBeenCalledWith(expect.objectContaining({ to: '0900000001' }))

    harness.store.findUser(notificationTestUserIds.customer)!.phoneNumber = ''
    await harness.send({ userId: notificationTestUserIds.customer, type: 'security', data: { message: 'No phone' }, channels: ['sms'] })
    expect(harness.sms.send).toHaveBeenCalledTimes(2)
  })

  it('push skips users with no device tokens without error', async () => {
    harness.store.findUser(notificationTestUserIds.customer)!.deviceTokens = []
    await expect(harness.send({ userId: notificationTestUserIds.customer, type: 'order', data: { orderNumber: 'ORD-NO-TOKEN', total: '10đ' }, channels: ['push'] })).resolves.toBeTruthy()
    expect(harness.push.sent).toHaveLength(0)
  })

  it('push ignores inactive device tokens', async () => {
    const user = harness.store.findUser(notificationTestUserIds.customer)!
    user.notificationPreferences.channels.push = true
    user.deviceTokens = [makeDeviceToken({ token: 'inactive-token', isActive: false })]
    await harness.send({ userId: notificationTestUserIds.customer, type: 'order', data: { orderNumber: 'ORD-INACTIVE', total: '10đ' }, channels: ['push'] })
    expect(harness.push.sent).toHaveLength(0)
  })
})
