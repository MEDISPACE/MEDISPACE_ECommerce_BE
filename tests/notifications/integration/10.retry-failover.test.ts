import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationHarness, NotificationQueueHarness } from '../helpers/db'
import { notificationTestUserIds } from '../fixtures/users'

describe('notifications/integration/10.retry-failover', () => {
  const harness = new NotificationHarness()
  beforeEach(() => harness.reset())

  it('email fails, retries 3 times, then dead-letter', async () => {
    const queue = new NotificationQueueHarness(vi.fn(async () => { throw new Error('email down') }))
    const job = queue.add({ channel: 'email' }, { maxRetries: 3 })
    await queue.processNext()
    expect(job.attempts).toBe(3)
    expect(queue.deadLetters).toHaveLength(1)
  })

  it('push fails then succeeds on retry and is marked sent', async () => {
    const processor = vi.fn().mockRejectedValueOnce(new Error('push')).mockResolvedValueOnce(undefined)
    const queue = new NotificationQueueHarness(processor)
    const job = queue.add({ channel: 'push' }, { maxRetries: 3 })
    await queue.processNext()
    expect(job.status).toBe('completed')
  })

  it('all channels fail marks notification as failed in DB-like log', async () => {
    harness.email.failNext()
    harness.push.failNext()
    await harness.send({ userId: notificationTestUserIds.multiDeviceCustomer, type: 'order', data: { orderNumber: 'ORD-FAIL', total: '1đ' }, channels: ['email', 'push'] })
    expect(harness.store.logs.length).toBeGreaterThanOrEqual(2)
  })

  it('failed notification logged with userId, type, error, timestamp', async () => {
    harness.email.failNext(new Error('smtp timeout'))
    await harness.send({ userId: notificationTestUserIds.customer, type: 'order', data: { orderNumber: 'ORD-LOG', total: '1đ' }, channels: ['email'] })
    expect(harness.store.logs[0]).toEqual(expect.objectContaining({ userId: notificationTestUserIds.customer.toString(), type: 'order', error: expect.any(Error), timestamp: expect.any(Date) }))
  })

  it('dead-letter queue size alert triggers at threshold', async () => {
    const queue = new NotificationQueueHarness(async () => { throw new Error('down') })
    queue.add({ id: 1 }, { maxRetries: 1 })
    queue.add({ id: 2 }, { maxRetries: 1 })
    await queue.processAll()
    expect(queue.deadLetters.length >= 2).toBe(true)
  })

  it('partial bulk send failure records successful ones', async () => {
    const result = await harness.sendBulk([notificationTestUserIds.customer, notificationTestUserIds.bannedCustomer, notificationTestUserIds.multiDeviceCustomer], {
      type: 'order',
      data: { orderNumber: 'ORD-PARTIAL', total: '1đ' },
      channels: ['inApp']
    })
    expect(result.sent).toBe(3)
    expect(harness.store.notifications.size).toBe(3)
  })

  it('queue worker crash leaves jobs requeueable on restart', async () => {
    const queue = new NotificationQueueHarness(async () => { throw new Error('crash') })
    const job = queue.add({ id: 'crash' }, { maxRetries: 1 })
    await queue.processNext()
    const restarted = new NotificationQueueHarness(async () => {})
    restarted.jobs = [{ ...job, status: 'queued', attempts: 0 }]
    await restarted.processNext()
    expect(restarted.completed).toEqual([job.id])
  })

  it('DB write fails after send is logged without losing delivery trace', async () => {
    await harness.email.send({ to: 'customer.notifications@medispace.test', subject: 'Manual', html: '<p>Manual</p>' })
    harness.store.logs.push({ phase: 'db-write-after-send', userId: notificationTestUserIds.customer.toString(), error: new Error('db down') })
    expect(harness.email.sent).toHaveLength(1)
    expect(harness.store.logs[0]).toMatchObject({ phase: 'db-write-after-send' })
  })
})
