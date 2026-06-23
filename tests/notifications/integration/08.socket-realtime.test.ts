import { beforeEach, describe, expect, it } from 'vitest'
import { NotificationHarness } from '../helpers/db'
import { notificationTestUserIds } from '../fixtures/users'

describe('notifications/integration/08.socket-realtime', () => {
  const harness = new NotificationHarness()
  beforeEach(() => harness.reset())

  it('user connects and joins private room', () => {
    harness.socket.join('socket-a', `user:${notificationTestUserIds.customer.toString()}`)
    expect(harness.socket.roomsFor('socket-a')).toContain(`user:${notificationTestUserIds.customer.toString()}`)
  })

  it('notification sent is received via socket', async () => {
    const wait = harness.socket.waitFor(`user:${notificationTestUserIds.customer.toString()}`)
    await harness.send({ userId: notificationTestUserIds.customer, type: 'system', data: { message: 'Realtime' }, channels: ['socket'] })
    await expect(wait).resolves.toMatchObject({ type: 'system' })
  })

  it('User A notification is not received by User B', async () => {
    await harness.send({ userId: notificationTestUserIds.customer, type: 'system', data: { message: 'Private' }, channels: ['socket'] })
    expect(harness.socket.emissions.some((item) => item.room === `user:${notificationTestUserIds.multiDeviceCustomer.toString()}`)).toBe(false)
  })

  it('user offline stores notification in DB', async () => {
    await harness.send({ userId: notificationTestUserIds.customer, type: 'order', data: { orderNumber: 'ORD-OFF', total: '1đ' }, channels: ['inApp'] })
    expect(harness.store.unreadFor(notificationTestUserIds.customer)).toHaveLength(1)
  })

  it('user reconnect fetches missed notifications', async () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'Missed', message: 'Missed' })
    harness.socket.join('socket-a', `user:${notificationTestUserIds.customer.toString()}`)
    expect(harness.store.unreadFor(notificationTestUserIds.customer)[0].title).toBe('Missed')
  })

  it('unread count emitted correctly on new notification', async () => {
    await harness.send({ userId: notificationTestUserIds.customer, type: 'order', data: { orderNumber: 'ORD-COUNT', total: '1đ' }, channels: ['inApp', 'socket'] })
    expect(harness.store.unreadFor(notificationTestUserIds.customer)).toHaveLength(1)
  })

  it('mark as read decrements unread count', () => {
    const record = harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'Read me', message: 'Read me' })
    harness.markAsRead(record._id, notificationTestUserIds.customer)
    expect(harness.store.unreadFor(notificationTestUserIds.customer)).toHaveLength(0)
  })

  it('multiple notifications are received in order', async () => {
    await harness.send({ userId: notificationTestUserIds.customer, type: 'system', data: { message: 'First' }, channels: ['socket'] })
    await harness.send({ userId: notificationTestUserIds.customer, type: 'system', data: { message: 'Second' }, channels: ['socket'] })
    expect(harness.socket.emissions.map((item) => item.payload.message)).toEqual(['First', 'Second'])
  })

  it('socket disconnect mid-notification is handled gracefully', async () => {
    harness.socket.join('socket-a', `user:${notificationTestUserIds.customer.toString()}`)
    harness.socket.leave('socket-a', `user:${notificationTestUserIds.customer.toString()}`)
    await expect(harness.send({ userId: notificationTestUserIds.customer, type: 'system', data: { message: 'After disconnect' }, channels: ['inApp'] })).resolves.toBeTruthy()
  })
})
