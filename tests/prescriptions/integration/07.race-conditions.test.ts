import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ObjectId } from 'mongodb'
import { api, cleanPrescriptionTestDb, createPrescriptionApp, createPrescriptionTestDb, destroyPrescriptionTestDb, notificationProvider, seedPrescriptionTestDb, type PrescriptionTestDb } from '../helpers/db'
import { pharmacistAuth } from '../helpers/auth'
import { pharmacistIds } from '../fixtures/pharmacists'
import { makePrescription } from '../fixtures/prescriptions'

describe('prescriptions/integration/07.race-conditions', () => {
  let harness: PrescriptionTestDb
  let app: ReturnType<typeof createPrescriptionApp>

  beforeAll(async () => {
    harness = await createPrescriptionTestDb()
    app = createPrescriptionApp(harness)
  })

  beforeEach(async () => {
    notificationProvider.notifyCustomer.mockReset()
    await seedPrescriptionTestDb(harness)
  })

  afterEach(async () => cleanPrescriptionTestDb(harness))
  afterAll(async () => destroyPrescriptionTestDb(harness))

  async function seedPendingPrescription(overrides = {}) {
    const doc = makePrescription({ _id: new ObjectId(), prescriptionNumber: `RX-RACE-${new ObjectId().toString().slice(-6)}`, ...overrides })
    await harness.prescriptions.insertOne(doc)
    return doc._id as ObjectId
  }

  function approveAs(pharmacistId: ObjectId, prescriptionId: ObjectId) {
    return api(app).put(`/prescriptions/${prescriptionId}/verify`).set(pharmacistAuth(pharmacistId)).send({ action: 'approve' })
  }

  function rejectAs(pharmacistId: ObjectId, prescriptionId: ObjectId, notes = 'Dữ liệu đơn thuốc không hợp lệ') {
    return api(app).put(`/prescriptions/${prescriptionId}/verify`).set(pharmacistAuth(pharmacistId)).send({ action: 'reject', notes })
  }

  it('two simultaneous approve requests result in exactly one success and one conflict', async () => {
    const prescriptionId = await seedPendingPrescription()
    const results = await Promise.allSettled([approveAs(pharmacistIds.licensedOnline, prescriptionId), approveAs(pharmacistIds.licensedSecond, prescriptionId)])
    const responses = results.map((result) => (result.status === 'fulfilled' ? result.value : undefined)).filter(Boolean)
    expect(responses.filter((res) => res!.status === 200)).toHaveLength(1)
    expect(responses.filter((res) => res!.status === 409)).toHaveLength(1)
    const final = await harness.prescriptions.findOne({ _id: prescriptionId })
    expect(final).toEqual(expect.objectContaining({ status: 'verified' }))
    expect(final?.verifiedBy).toBeDefined()
  })

  it('simultaneous approve and reject never corrupt final state', async () => {
    const prescriptionId = await seedPendingPrescription()
    const results = await Promise.allSettled([approveAs(pharmacistIds.licensedOnline, prescriptionId), rejectAs(pharmacistIds.licensedSecond, prescriptionId, 'Ảnh đơn thuốc bị mờ')])
    const responses = results.map((result) => (result.status === 'fulfilled' ? result.value : undefined)).filter(Boolean)
    expect(responses.filter((res) => res!.status === 200)).toHaveLength(1)
    expect(responses.filter((res) => res!.status === 409)).toHaveLength(1)
    const final = await harness.prescriptions.findOne({ _id: prescriptionId })
    expect(['verified', 'rejected']).toContain(final?.status)
    if (final?.status === 'verified') expect(final.pharmacistNotes).toBeUndefined()
    if (final?.status === 'rejected') expect(final.pharmacistNotes).toBe('Ảnh đơn thuốc bị mờ')
  })

  it('ten concurrent verify requests produce exactly one success, nine conflicts, and one audit decision', async () => {
    const prescriptionId = await seedPendingPrescription()
    const requests = Array.from({ length: 10 }, (_, index) =>
      index % 2 === 0 ? approveAs(pharmacistIds.licensedOnline, prescriptionId) : rejectAs(pharmacistIds.licensedSecond, prescriptionId, `Reject reason ${index}`)
    )
    const responses = (await Promise.allSettled(requests)).map((result) => (result.status === 'fulfilled' ? result.value : undefined)).filter(Boolean)
    expect(responses.filter((res) => res!.status === 200)).toHaveLength(1)
    expect(responses.filter((res) => res!.status === 409)).toHaveLength(9)
    const final = await harness.prescriptions.findOne({ _id: prescriptionId })
    expect(['verified', 'rejected']).toContain(final?.status)
    expect(final?.verifiedBy).toBeDefined()
    const audits = await harness.auditLogs.find({ prescriptionId, action: { $in: ['verified', 'rejected'] } }).toArray()
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ previousStatus: 'pending', newStatus: final?.status })
  })

  it('uses atomic pending-status update semantics that would fail under read-then-write races', async () => {
    const prescriptionId = await seedPendingPrescription()
    const requests = Array.from({ length: 25 }, (_, index) => approveAs(index % 2 === 0 ? pharmacistIds.licensedOnline : pharmacistIds.licensedSecond, prescriptionId))
    const responses = await Promise.all(requests)
    expect(responses.filter((res) => res.status === 200)).toHaveLength(1)
    expect(responses.filter((res) => res.status === 409)).toHaveLength(24)
    const [final, auditCount, notifyCalls] = await Promise.all([
      harness.prescriptions.findOne({ _id: prescriptionId }),
      harness.auditLogs.countDocuments({ prescriptionId, action: 'verified' }),
      Promise.resolve(notificationProvider.notifyCustomer.mock.calls.length)
    ])
    expect(final?.status).toBe('verified')
    expect(auditCount).toBe(1)
    expect(notifyCalls).toBe(1)
  })
})
