import { beforeEach, describe, expect, it } from 'vitest'
import { NotificationHarness, dedupeKey, withinWindow } from '../helpers/db'
import { notificationTestUserIds } from '../fixtures/users'

describe('notifications/unit/05.deduplication', () => {
  const harness = new NotificationHarness()
  beforeEach(() => harness.reset())

  it('same event fires twice sends once only', () => {
    const first = harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'A', message: 'A', eventKey: 'order:1:placed' })
    const second = harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'A', message: 'A', eventKey: 'order:1:placed' })
    expect(second._id).toEqual(first._id)
    expect(harness.store.notifications.size).toBe(1)
  })

  it('deduplication key generated correctly per event type', () => {
    expect(dedupeKey('payment', 'ORD-1', 'paid')).toBe('payment:ORD-1:paid')
  })

  it('deduplication window respected', () => {
    const existing = new Date('2026-06-22T08:00:00.000Z')
    expect(withinWindow(existing, new Date('2026-06-22T08:04:59.000Z'))).toBe(true)
    expect(withinWindow(existing, new Date('2026-06-22T08:05:01.000Z'))).toBe(false)
  })

  it('different events create both notifications', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'A', message: 'A', eventKey: 'order:1' })
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'B', message: 'B', eventKey: 'order:2' })
    expect(harness.store.notifications.size).toBe(2)
  })

  it('same event for different users creates both notifications', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'A', message: 'A', eventKey: 'order:1' })
    harness.createNotificationRecord({ userId: notificationTestUserIds.multiDeviceCustomer, type: 'order', title: 'A', message: 'A', eventKey: 'order:1' })
    expect(harness.store.notifications.size).toBe(2)
  })

  it('idempotency key stored and checked in DB', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'order', title: 'A', message: 'A', eventKey: 'order:stored' })
    expect(harness.store.idempotency.has(`${notificationTestUserIds.customer.toString()}:order:stored`)).toBe(true)
  })

  it('expired idempotency key allows notification again with new window key', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'reminder', title: 'A', message: 'A', eventKey: 'event:1:reminder:08:00' })
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'reminder', title: 'A', message: 'A', eventKey: 'event:1:reminder:08:10' })
    expect(harness.store.notifications.size).toBe(2)
  })
})
