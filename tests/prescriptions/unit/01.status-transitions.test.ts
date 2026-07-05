import { describe, expect, it } from 'vitest'
import { canTransition, formatStatus, getUrgencyLevel, isExpired } from '../helpers/domain'

describe('Prescription status transitions', () => {
  it('allows pending -> verified', () => expect(canTransition('pending', 'verified')).toBe(true))
  it('allows pending -> rejected', () => expect(canTransition('pending', 'rejected')).toBe(true))
  it('blocks verified -> verified', () => expect(canTransition('verified', 'verified')).toBe(false))
  it('blocks verified -> rejected', () => expect(canTransition('verified', 'rejected')).toBe(false))
  it('blocks rejected -> verified', () => expect(canTransition('rejected', 'verified')).toBe(false))
  it('blocks expired -> verified', () => expect(canTransition('expired', 'verified')).toBe(false))

  it('isExpired true only when validUntil < now and status is pending', () => {
    const now = new Date('2026-06-30T00:00:00.000Z')
    expect(isExpired({ status: 'pending', validUntil: new Date('2026-06-29T23:59:59.999Z') }, now)).toBe(true)
    expect(isExpired({ status: 'verified', validUntil: new Date('2026-06-01T00:00:00.000Z') }, now)).toBe(false)
    expect(isExpired({ status: 'rejected', validUntil: new Date('2026-06-01T00:00:00.000Z') }, now)).toBe(false)
  })

  it('formatStatus returns Vietnamese labels', () => {
    expect(formatStatus('pending')).toBe('Chờ xử lý')
    expect(formatStatus('verified')).toBe('Đã duyệt')
    expect(formatStatus('rejected')).toBe('Từ chối')
    expect(formatStatus('expired')).toBe('Hết hạn')
  })

  it('getUrgencyLevel uses pending-duration thresholds', () => {
    const now = new Date('2026-06-30T12:00:00.000Z')
    expect(getUrgencyLevel(new Date('2026-06-30T11:00:00.000Z'), now)).toBe('low')
    expect(getUrgencyLevel(new Date('2026-06-30T06:59:00.000Z'), now)).toBe('medium')
    expect(getUrgencyLevel(new Date('2026-06-29T11:59:00.000Z'), now)).toBe('high')
  })
})
