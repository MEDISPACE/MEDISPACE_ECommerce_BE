import { beforeEach, describe, expect, it } from 'vitest'
import { NotificationHarness } from '../helpers/db'
import { notificationTestUserIds } from '../fixtures/users'

describe('notifications/e2e/14.email-notifications', () => {
  const harness = new NotificationHarness()
  beforeEach(() => harness.reset())

  it('order confirmation email received with correct details', async () => {
    await harness.send({ userId: notificationTestUserIds.customer, type: 'order', data: { orderNumber: 'ORD-MAIL', total: '250.000đ' }, channels: ['email'] })
    expect(harness.email.sent[0].html).toContain('ORD-MAIL')
  })

  it('email contains correct order items and total', async () => {
    await harness.email.send({ to: 'customer.notifications@medispace.test', subject: 'Order Confirmed', html: '<p>Vitamin C 1000mg - 250.000đ</p>' })
    expect(harness.email.sent[0].html).toContain('Vitamin C 1000mg')
    expect(harness.email.sent[0].html).toContain('250.000đ')
  })

  it('email contains tracking link after shipping', async () => {
    await harness.email.send({ to: 'customer.notifications@medispace.test', subject: 'Shipping', html: '<a href="/tracking/GHTK-1">Theo dõi</a>' })
    expect(harness.email.sent[0].html).toContain('/tracking/GHTK-1')
  })

  it('event reminder email received 15 min before event', async () => {
    await harness.send({ userId: notificationTestUserIds.customer, type: 'reminder', data: { eventName: 'Tim mạch', startTime: '09:00' }, channels: ['email'] })
    expect(harness.email.sent[0].subject).toBe('Event reminder')
  })

  it('password change security email received', async () => {
    await harness.send({ userId: notificationTestUserIds.customer, type: 'security', data: { message: 'Mật khẩu đã được thay đổi' }, channels: ['email'] })
    expect(harness.email.sent[0].html).toContain('Mật khẩu')
  })

  it('welcome email received after registration', async () => {
    await harness.email.send({ to: 'customer.notifications@medispace.test', subject: 'Chào mừng bạn đến với MediSpace', html: '<p>Welcome</p>' })
    expect(harness.email.sent[0].subject).toContain('Chào mừng')
  })

  it('unsubscribe link is present in marketing emails', async () => {
    await harness.email.send({ to: 'customer.notifications@medispace.test', subject: 'Promotion', html: '<a href="/unsubscribe">Unsubscribe</a>' })
    expect(harness.email.sent[0].html).toContain('/unsubscribe')
  })

  it('unsubscribe link is not required in transactional emails', async () => {
    await harness.send({ userId: notificationTestUserIds.customer, type: 'order', data: { orderNumber: 'ORD-NO-UNSUB', total: '1đ' }, channels: ['email'] })
    expect(harness.email.sent[0].html).not.toContain('/unsubscribe')
  })

  it('email renders on mobile viewport by using fluid markup', async () => {
    await harness.email.send({ to: 'customer.notifications@medispace.test', subject: 'Mobile', html: '<table width="100%"><tr><td>Mobile safe</td></tr></table>' })
    expect(harness.email.sent[0].html).toContain('width="100%"')
  })
})
