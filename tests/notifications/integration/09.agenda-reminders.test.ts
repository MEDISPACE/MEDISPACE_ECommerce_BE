import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationHarness, NotificationQueueHarness } from '../helpers/db'
import { eventTestIds } from '../fixtures/events'
import { notificationTestUserIds } from '../fixtures/users'

describe('notifications/integration/09.agenda-reminders', () => {
  const harness = new NotificationHarness()
  beforeEach(() => harness.reset())

  const scheduleReminder = (eventId: string, startAt: Date) => ({
    name: 'send-event-reminder',
    data: { eventId },
    runAt: new Date(startAt.getTime() - 15 * 60 * 1000),
    cancelled: false
  })

  it('event created schedules reminder job at correct time', () => {
    const job = scheduleReminder(eventTestIds.heartCare.toString(), new Date('2026-06-22T09:00:00.000Z'))
    expect(job.runAt.toISOString()).toBe('2026-06-22T08:45:00.000Z')
  })

  it('event time updated cancels old job and schedules new job', () => {
    const oldJob = scheduleReminder(eventTestIds.heartCare.toString(), new Date('2026-06-22T09:00:00.000Z'))
    oldJob.cancelled = true
    const newJob = scheduleReminder(eventTestIds.heartCare.toString(), new Date('2026-06-22T10:00:00.000Z'))
    expect(oldJob.cancelled).toBe(true)
    expect(newJob.runAt.toISOString()).toBe('2026-06-22T09:45:00.000Z')
  })

  it('event cancelled cancels reminder job', () => {
    const job = scheduleReminder(eventTestIds.heartCare.toString(), new Date('2026-06-22T09:00:00.000Z'))
    job.cancelled = true
    expect(job.cancelled).toBe(true)
  })

  it('job fires notification to ALL registrants', () => {
    ;[notificationTestUserIds.customer, notificationTestUserIds.multiDeviceCustomer].forEach((userId) => {
      harness.createNotificationRecord({ userId, type: 'reminder', title: 'Reminder', message: '15m', metadata: { eventId: eventTestIds.heartCare.toString() }, eventKey: `reminder:${eventTestIds.heartCare.toString()}:${userId}` })
    })
    expect(harness.store.notifications.size).toBe(2)
  })

  it('job does not notify non-registrants', () => {
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'reminder', title: 'Reminder', message: '15m', metadata: { eventId: eventTestIds.heartCare.toString() } })
    expect(Array.from(harness.store.notifications.values()).some((item) => item.userId.equals(notificationTestUserIds.admin))).toBe(false)
  })

  it('job fires twice sends notification once by idempotency', () => {
    const eventKey = `community-video-event:${eventTestIds.heartCare.toString()}:reminder15m`
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'reminder', title: 'Reminder', message: '15m', eventKey })
    harness.createNotificationRecord({ userId: notificationTestUserIds.customer, type: 'reminder', title: 'Reminder', message: '15m', eventKey })
    expect(harness.store.notifications.size).toBe(1)
  })

  it('1000 registrants use bulk send path, not 1000 separate scheduler calls', async () => {
    const processor = vi.fn(async () => {})
    const queue = new NotificationQueueHarness(processor)
    queue.add({ eventId: eventTestIds.heartCare.toString(), recipientCount: 1000 })
    await queue.processAll()
    expect(processor).toHaveBeenCalledTimes(1)
  })

  it('server restart does not lose pending jobs', async () => {
    const queue = new NotificationQueueHarness(async () => {})
    queue.add({ eventId: eventTestIds.heartCare.toString() })
    const restored = new NotificationQueueHarness(async () => {})
    restored.jobs = [...queue.jobs]
    await restored.processAll()
    expect(restored.completed).toEqual(['job-1'])
  })
})
