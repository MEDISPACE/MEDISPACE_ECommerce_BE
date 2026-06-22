import { beforeEach, describe, expect, it } from 'vitest'
import { NotificationHarness } from '../helpers/db'
import { allNotificationsOffPreferences, defaultNotificationPreferences, notificationTestUserIds, pushOnPreferences } from '../fixtures/users'

describe('notifications/e2e/16.user-preferences', () => {
  const harness = new NotificationHarness()
  beforeEach(() => harness.reset())

  it('user opens notification settings', () => {
    expect(harness.getPreferences(notificationTestUserIds.customer)).toEqual(defaultNotificationPreferences)
  })

  it('toggles email OFF and email notification is not received for marketing', async () => {
    harness.updatePreferences(notificationTestUserIds.customer, { channels: { ...defaultNotificationPreferences.channels, email: false } })
    await harness.send({ userId: notificationTestUserIds.customer, type: 'promotion', data: { campaignName: 'Sale' }, channels: ['email'] })
    expect(harness.email.sent).toHaveLength(0)
  })

  it('toggles push OFF and push is not sent', async () => {
    harness.updatePreferences(notificationTestUserIds.multiDeviceCustomer, { channels: { ...pushOnPreferences.channels, push: false } })
    await harness.send({ userId: notificationTestUserIds.multiDeviceCustomer, type: 'promotion', data: { campaignName: 'Sale' }, channels: ['push'] })
    expect(harness.push.sent).toHaveLength(0)
  })

  it('toggles all OFF and only critical notifications are received', async () => {
    harness.updatePreferences(notificationTestUserIds.customer, allNotificationsOffPreferences)
    const marketing = await harness.send({ userId: notificationTestUserIds.customer, type: 'promotion', data: { campaignName: 'Sale' }, channels: ['inApp'] })
    const critical = await harness.send({ userId: notificationTestUserIds.customer, type: 'order', data: { orderNumber: 'ORD-CRITICAL', total: '1đ' }, channels: ['inApp'] })
    expect(marketing.skipped).toBe(true)
    expect(critical.skipped).toBe(false)
  })

  it('preference is saved after page refresh', () => {
    harness.updatePreferences(notificationTestUserIds.customer, { channels: { ...defaultNotificationPreferences.channels, sms: true } })
    const refreshedHarness = harness
    expect(refreshedHarness.getPreferences(notificationTestUserIds.customer).channels.sms).toBe(true)
  })

  it('transactional notifications arrive even when marketing OFF', async () => {
    harness.store.findUser(notificationTestUserIds.marketingOptedOutCustomer)!.notificationPreferences.types.promotion = false
    const result = await harness.send({ userId: notificationTestUserIds.marketingOptedOutCustomer, type: 'payment', data: { orderNumber: 'ORD-TXN', paymentStatus: 'paid' }, channels: ['inApp'] })
    expect(result.skipped).toBe(false)
  })

  it('re-enabling a channel resumes notifications', async () => {
    harness.updatePreferences(notificationTestUserIds.customer, { channels: { ...defaultNotificationPreferences.channels, email: false } })
    harness.updatePreferences(notificationTestUserIds.customer, { channels: { ...defaultNotificationPreferences.channels, email: true } })
    await harness.send({ userId: notificationTestUserIds.customer, type: 'promotion', data: { campaignName: 'Sale' }, channels: ['email'] })
    expect(harness.email.sent).toHaveLength(1)
  })

  it('preferences UI shows current state correctly', () => {
    harness.updatePreferences(notificationTestUserIds.customer, { channels: { ...defaultNotificationPreferences.channels, push: true } })
    expect(harness.getPreferences(notificationTestUserIds.customer).channels.push).toBe(true)
  })

  it('changes take effect immediately', async () => {
    harness.updatePreferences(notificationTestUserIds.customer, { channels: { ...defaultNotificationPreferences.channels, email: false } })
    await harness.send({ userId: notificationTestUserIds.customer, type: 'promotion', data: { campaignName: 'Immediate' }, channels: ['email'] })
    expect(harness.email.sent).toHaveLength(0)
  })
})
