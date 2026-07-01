import { describe, expect, it } from 'vitest'
import { ObjectId } from 'mongodb'
import { buildAnchoredPatientSearchRegex, buildFilterQuery, dateRangeFilter, searchPrescriptions, vietnamDayRange } from '../helpers/domain'
import { makePrescription } from '../fixtures/prescriptions'

describe('Prescription search and filter logic', () => {
  it('buildFilterQuery omits status when status=all', () => {
    expect(buildFilterQuery({ status: 'all' })).not.toHaveProperty('status')
  })

  it('buildFilterQuery filters pending status', () => {
    expect(buildFilterQuery({ status: 'pending' })).toMatchObject({ status: 'pending' })
  })

  it('buildFilterQuery combines status and date range', () => {
    const range = { startDate: new Date('2026-06-29T17:00:00.000Z'), endDate: new Date('2026-06-30T17:00:00.000Z') }
    expect(buildFilterQuery({ status: 'pending', dateRange: range })).toMatchObject({ status: 'pending', createdAt: { $gte: range.startDate, $lt: range.endDate } })
  })

  it('buildFilterQuery combines status and search term', () => {
    const query = buildFilterQuery({ status: 'pending', search: 'Dr. QA' }) as any
    expect(query.status).toBe('pending')
    expect(query.$or).toHaveLength(3)
  })

  it('buildFilterQuery escapes regex metacharacters in prescription search', () => {
    const query = buildFilterQuery({ search: 'RX.*(DROP)' }) as any
    expect(query.$or[0].prescriptionNumber.$regex).toBe(String.raw`RX\.\*\(DROP\)`)
  })

  it('patient PHI search regex is anchored and escaped to reduce enumeration/scan risk', () => {
    expect(buildAnchoredPatientSearchRegex('090.*')).toBe(String.raw`^090\.\*`)
    expect(buildAnchoredPatientSearchRegex(' Nguyen ')).toBe('^Nguyen')
  })

  it('searchPrescriptions matches order code, doctor name, and customerId', () => {
    const customerId = new ObjectId()
    const rows = [makePrescription({ prescriptionNumber: 'RX-CODE-1', doctorName: 'Dr. Smith', customerId }) as any]
    expect(searchPrescriptions(rows, 'RX-CODE')).toHaveLength(1)
    expect(searchPrescriptions(rows, 'smith')).toHaveLength(1)
    expect(searchPrescriptions(rows, customerId.toString())).toHaveLength(1)
  })

  it('searchPrescriptions documents current phone-number limitation', () => {
    const rows = [makePrescription({ prescriptionNumber: 'RX-CODE-1', doctorName: 'Dr. Smith' }) as any]
    expect(searchPrescriptions(rows, '0900000001')).toHaveLength(0)
  })

  it('today boundary uses Vietnam timezone, not UTC midnight', () => {
    const range = vietnamDayRange(new Date('2026-06-30T18:00:00.000Z'))
    expect(range.startDate.toISOString()).toBe('2026-06-30T17:00:00.000Z')
    expect(range.endDate.toISOString()).toBe('2026-07-01T17:00:00.000Z')
  })

  it('today boundary includes Vietnam midnight instant and excludes previous-day last millisecond', () => {
    const range = vietnamDayRange(new Date('2026-07-01T04:00:00.000Z'))
    const midnightVn = new Date('2026-06-30T17:00:00.000Z')
    const previousMillisecond = new Date(midnightVn.getTime() - 1)
    expect(midnightVn >= range.startDate && midnightVn < range.endDate).toBe(true)
    expect(previousMillisecond >= range.startDate && previousMillisecond < range.endDate).toBe(false)
  })

  it('7days and 30days boundaries are measured from Vietnam-day end', () => {
    const now = new Date('2026-06-30T18:00:00.000Z')
    expect(dateRangeFilter('7days', now).startDate.toISOString()).toBe('2026-06-24T17:00:00.000Z')
    expect(dateRangeFilter('30days', now).startDate.toISOString()).toBe('2026-06-01T17:00:00.000Z')
  })
})
