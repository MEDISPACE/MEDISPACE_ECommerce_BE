import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ObjectId } from 'mongodb'
import { api, cleanPrescriptionTestDb, createPrescriptionApp, createPrescriptionTestDb, destroyPrescriptionTestDb, seedPrescriptionTestDb, type PrescriptionTestDb } from '../helpers/db'
import { pharmacistAuth } from '../helpers/auth'
import { pharmacistIds } from '../fixtures/pharmacists'
import { makePrescription, prescriptionFixtures, prescriptionIds } from '../fixtures/prescriptions'

describe('prescriptions/integration/11.audit-trail', () => {
  let harness: PrescriptionTestDb
  let app: ReturnType<typeof createPrescriptionApp>

  beforeAll(async () => {
    harness = await createPrescriptionTestDb()
    app = createPrescriptionApp(harness)
  })

  beforeEach(async () => seedPrescriptionTestDb(harness, { prescriptions: Object.values(prescriptionFixtures) }))
  afterEach(async () => cleanPrescriptionTestDb(harness))
  afterAll(async () => destroyPrescriptionTestDb(harness))

  it.each([
    ['approve', 'verified', {}],
    ['reject', 'rejected', { notes: 'Sai thông tin bệnh nhân' }]
  ])('creates immutable audit entry for %s decision', async (action, newStatus, extra) => {
    const id = new ObjectId()
    await harness.prescriptions.insertOne(makePrescription({ _id: id, prescriptionNumber: `RX-AUDIT-${action}` }))
    const res = await api(app).put(`/prescriptions/${id}/verify`).set(pharmacistAuth()).send({ action, ...extra })
    expect(res.status).toBe(200)
    const entry = await harness.auditLogs.findOne({ prescriptionId: id, action: newStatus })
    expect(entry).toEqual(expect.objectContaining({ prescriptionId: id, pharmacistId: pharmacistIds.licensedOnline, previousStatus: 'pending', newStatus, timestamp: expect.any(Date) }))
  })

  it('logs prescription detail view separately from decisions when PHI is accessed', async () => {
    const res = await api(app).get(`/prescriptions/${prescriptionIds.pending}`).set(pharmacistAuth())
    expect(res.status).toBe(200)
    const entry = await harness.auditLogs.findOne({ prescriptionId: prescriptionIds.pending, action: 'view' })
    expect(entry).toEqual(expect.objectContaining({ pharmacistId: pharmacistIds.licensedOnline }))
  })

  it('does not expose API endpoints that delete or mutate audit entries', async () => {
    await api(app).put(`/prescriptions/${prescriptionIds.pending}/verify`).set(pharmacistAuth()).send({ action: 'approve' })
    const entry = await harness.auditLogs.findOne({ prescriptionId: prescriptionIds.pending, action: 'verified' })
    const patch = await api(app).patch(`/prescriptions/${prescriptionIds.pending}/audit/${entry?._id}`).set(pharmacistAuth()).send({ action: 'tampered' })
    const del = await api(app).delete(`/prescriptions/${prescriptionIds.pending}/audit/${entry?._id}`).set(pharmacistAuth())
    expect([404, 405]).toContain(patch.status)
    expect([404, 405]).toContain(del.status)
    const unchanged = await harness.auditLogs.findOne({ _id: entry?._id })
    expect(unchanged?.action).toBe('verified')
  })

  it('returns complete chronological audit history for a single prescriptionId', async () => {
    await api(app).get(`/prescriptions/${prescriptionIds.pending}`).set(pharmacistAuth())
    await api(app).put(`/prescriptions/${prescriptionIds.pending}/verify`).set(pharmacistAuth()).send({ action: 'approve' })
    const res = await api(app).get(`/prescriptions/${prescriptionIds.pending}/audit`).set(pharmacistAuth())
    expect(res.status).toBe(200)
    expect(res.body.result.map((entry: any) => entry.action)).toEqual(['view', 'verified'])
    expect(new Date(res.body.result[0].timestamp).getTime()).toBeLessThanOrEqual(new Date(res.body.result[1].timestamp).getTime())
  })
})
