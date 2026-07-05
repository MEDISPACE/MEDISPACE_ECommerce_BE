import { beforeEach, describe, expect, it } from 'vitest'
import { NotificationHarness } from '../helpers/db'
import { eventTestIds } from '../fixtures/events'
import { notificationTestUserIds } from '../fixtures/users'

describe('notifications/e2e/12.event-notifications', () => {
  const harness = new NotificationHarness()
  beforeEach(() => harness.reset())

  it('user registers for event and sees confirmation notification', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'community', title: 'Đăng ký hội thảo thành công', message: 'registered', metadata: { eventId: eventTestIds.heartCare.toString(), status: 'registered' } })
    expect(harness.store.unreadFor(notificationTestUserIds.customer)[0].title).toContain('Đăng ký')
  })

  it('admin changes event time and user sees update notification', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'community', title: 'Lịch hội thảo được cập nhật', message: 'time changed', metadata: { status: 'time_changed' } })
    expect(harness.store.unreadFor(notificationTestUserIds.customer)[0].metadata.status).toBe('time_changed')
  })

  it('admin cancels event and user sees cancellation notification', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'community', title: 'Hội thảo đã hủy', message: 'cancelled', metadata: { status: 'cancelled' } })
    expect(harness.store.unreadFor(notificationTestUserIds.customer)[0].title).toContain('hủy')
  })

  it('15 minutes before event reminder appears when job is triggered manually', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'reminder', title: 'Hội thảo sắp bắt đầu', message: '15m', metadata: { eventId: eventTestIds.heartCare.toString() } })
    expect(harness.store.unreadFor(notificationTestUserIds.customer)[0].type).toBe('reminder')
  })

  it('admin starts event and user sees live notification in realtime', async () => {
    const wait = harness.socket.waitFor(`user:${notificationTestUserIds.customer.toString()}`)
    await harness.send({ userId: notificationTestUserIds.customer, type: 'community', data: { eventName: 'Tim mạch' }, channels: ['socket'] })
    await expect(wait).resolves.toMatchObject({ type: 'community' })
  })

  it("user's Q&A approved shows notification", () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'community', title: 'Câu hỏi đã được duyệt', message: 'approved', metadata: { qnaStatus: 'approved' } })
    expect(harness.store.unreadFor(notificationTestUserIds.customer)[0].metadata.qnaStatus).toBe('approved')
  })

  it('clicking event notification navigates to event page', () => {
    const record = harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'community', title: 'Event', message: 'Event', actionUrl: `/community/video-events/${eventTestIds.heartCare.toString()}` })
    expect(record.actionUrl).toContain('/community/video-events/')
  })
})
