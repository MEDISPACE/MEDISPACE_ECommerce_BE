import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationQueueHarness } from '../helpers/db'

describe('notifications/unit/04.queue-worker', () => {
  let processor = vi.fn(async () => {})
  let queue: NotificationQueueHarness

  beforeEach(() => {
    processor = vi.fn(async () => {})
    queue = new NotificationQueueHarness(processor)
  })

  it('job added to queue is processed', async () => {
    const job = queue.add({ type: 'order' })
    await queue.processNext()
    expect(job.status).toBe('completed')
  })

  it('failed job is retried up to maxRetries', async () => {
    processor.mockRejectedValueOnce(new Error('first')).mockResolvedValueOnce(undefined)
    const job = queue.add({ type: 'email' }, { maxRetries: 3 })
    await queue.processNext()
    expect(job.attempts).toBe(2)
    expect(job.status).toBe('completed')
  })

  it('failed job after maxRetries moves to dead-letter', async () => {
    processor.mockRejectedValue(new Error('always'))
    const job = queue.add({ type: 'push' }, { maxRetries: 2 })
    await queue.processNext()
    expect(job.status).toBe('failed')
    expect(queue.deadLetters).toHaveLength(1)
  })

  it('job processor handles email failure gracefully', async () => {
    processor.mockRejectedValueOnce(new Error('email failed')).mockResolvedValueOnce(undefined)
    const job = queue.add({ channel: 'email' }, { maxRetries: 2 })
    await queue.processNext()
    expect(job.status).toBe('completed')
  })

  it('job processor handles push failure gracefully', async () => {
    processor.mockRejectedValueOnce(new Error('push failed')).mockResolvedValueOnce(undefined)
    const job = queue.add({ channel: 'push' }, { maxRetries: 2 })
    await queue.processNext()
    expect(job.status).toBe('completed')
  })

  it('job completion marked correctly in DB-like state', async () => {
    const job = queue.add({ id: 'n1' })
    await queue.processNext()
    expect(queue.completed).toContain(job.id)
  })

  it('job failure logged with full error context', async () => {
    processor.mockRejectedValue(new Error('boom'))
    await queue.processNext()
    expect(queue.deadLetters).toHaveLength(0)
    queue.add({ userId: 'u1', type: 'order' }, { maxRetries: 1 })
    await queue.processNext()
    expect(queue.deadLetters[0]).toEqual(expect.objectContaining({ jobId: 'job-1', payload: { userId: 'u1', type: 'order' }, attempts: 1 }))
  })

  it('concurrent jobs processed without interference', async () => {
    queue.add({ id: 1 })
    queue.add({ id: 2 })
    queue.add({ id: 3 })
    await queue.processAll()
    expect(queue.completed).toEqual(['job-1', 'job-2', 'job-3'])
  })

  it('queue empty idles correctly', () => {
    expect(queue.idle()).toBe(true)
  })

  it('stale job added days ago is still processed explicitly', async () => {
    const job = queue.add({ type: 'reminder' }, { createdAt: new Date('2026-06-01T00:00:00.000Z') })
    await queue.processNext()
    expect(job.status).toBe('completed')
  })
})
