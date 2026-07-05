import { beforeEach, describe, expect, it } from 'vitest'
import { NotificationHarness, ValidationError, getChannelsFor } from '../helpers/db'
import { allNotificationsOffPreferences, defaultNotificationPreferences, emailOffPreferences, makeNotificationUser, notificationTestUserIds, pushOnPreferences } from '../fixtures/users'

describe('notifications/unit/03.user-preferences', () => {
  const harness = new NotificationHarness()
  beforeEach(() => harness.reset())

  it('user with all notifications ON uses all enabled channels', () => {
    const user = makeNotificationUser({ notificationPreferences: { ...defaultNotificationPreferences, channels: { inApp: true, email: true, push: true, sms: true } } })
    expect(getChannelsFor(user, 'promotion', ['inApp', 'email', 'push', 'sms'])).toEqual(['inApp', 'email', 'push', 'sms'])
  })

  it('user with email OFF skips email, others sent', () => {
    const user = makeNotificationUser({ notificationPreferences: emailOffPreferences })
    expect(getChannelsFor(user, 'promotion', ['inApp', 'email', 'socket'])).toEqual(['inApp', 'socket'])
  })

  it('user with push OFF skips push, others sent', () => {
    const user = makeNotificationUser()
    expect(getChannelsFor(user, 'promotion', ['inApp', 'email', 'push'])).toEqual(['inApp', 'email'])
  })

  it('user with all OFF receives nothing except critical', () => {
    const user = makeNotificationUser({ notificationPreferences: allNotificationsOffPreferences })
    expect(getChannelsFor(user, 'promotion', ['inApp', 'email', 'push', 'sms'])).toEqual([])
    expect(getChannelsFor(user, 'order', ['inApp', 'email', 'push', 'sms'])).toEqual(['inApp', 'email'])
  })

  it('critical/transactional notifications ignore opt-out', async () => {
    const result = await harness.send({ userId: notificationTestUserIds.optedOutCustomer, type: 'security', data: { message: 'Đổi mật khẩu' }, channels: ['inApp', 'email'] })
    expect(result.skipped).toBe(false)
    expect(harness.email.send).toHaveBeenCalledTimes(1)
  })

  it('marketing notifications respect opt-out', async () => {
    const result = await harness.send({ userId: notificationTestUserIds.marketingOptedOutCustomer, type: 'promotion', data: { campaignName: 'Sale' }, channels: ['inApp', 'email'] })
    expect(result.skipped).toBe(true)
  })

  it('preference not set defaults to ON', () => {
    const user = makeNotificationUser({ notificationPreferences: undefined as never })
    expect(getChannelsFor(user, 'promotion', ['inApp', 'email'])).toEqual(['inApp', 'email'])
  })

  it('getPreferences() returns correct shape', () => {
    expect(harness.getPreferences(notificationTestUserIds.customer)).toEqual(defaultNotificationPreferences)
  })

  it('updatePreferences() persists correctly', () => {
    const updated = harness.updatePreferences(notificationTestUserIds.customer, pushOnPreferences)
    expect(updated.channels.push).toBe(true)
    expect(harness.getPreferences(notificationTestUserIds.customer).channels.push).toBe(true)
  })

  it('updatePreferences() with invalid channel throws validation error', () => {
    expect(() => harness.updatePreferences(notificationTestUserIds.customer, { channels: { fax: true } as never })).toThrow(ValidationError)
  })
})
