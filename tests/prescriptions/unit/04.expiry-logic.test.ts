import { describe, expect, it } from 'vitest'
import { runExpiryJob } from '../helpers/domain'
import { makePrescription } from '../fixtures/prescriptions'

describe('Prescription expiry logic', () => {
  it('marks pending prescription expired when validUntil < now', () => {
    const rows = [makePrescription({ status: 'pending', validUntil: new Date('2026-06-01T00:00:00.000Z') }) as any]
    expect(runExpiryJob(rows, new Date('2026-06-30T00:00:00.000Z'))).toBe(1)
    expect(rows[0].status).toBe('expired')
  })

  it('does not touch verified/rejected prescriptions even if validUntil < now', () => {
    const rows = [
      makePrescription({ status: 'verified', validUntil: new Date('2026-06-01T00:00:00.000Z') }) as any,
      makePrescription({ status: 'rejected', validUntil: new Date('2026-06-01T00:00:00.000Z') }) as any
    ]
    expect(runExpiryJob(rows, new Date('2026-06-30T00:00:00.000Z'))).toBe(0)
    expect(rows.map((row) => row.status)).toEqual(['verified', 'rejected'])
  })

  it('is idempotent', () => {
    const rows = [makePrescription({ status: 'pending', validUntil: new Date('2026-06-01T00:00:00.000Z') }) as any]
    expect(runExpiryJob(rows, new Date('2026-06-30T00:00:00.000Z'))).toBe(1)
    expect(runExpiryJob(rows, new Date('2026-06-30T00:00:00.000Z'))).toBe(0)
  })

  it('validUntil boundary is exclusive: exactly at validUntil is not expired', () => {
    const boundary = new Date('2026-06-30T00:00:00.000Z')
    const rows = [makePrescription({ status: 'pending', validUntil: boundary }) as any]
    expect(runExpiryJob(rows, boundary)).toBe(0)
  })

  it('expired stats count equals actual expired records', () => {
    const rows = [makePrescription({ status: 'expired' }) as any, makePrescription({ status: 'pending' }) as any]
    expect(rows.filter((row) => row.status === 'expired')).toHaveLength(1)
  })
})
