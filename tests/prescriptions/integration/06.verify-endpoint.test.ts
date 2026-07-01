import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ObjectId } from 'mongodb'
import { api, cleanPrescriptionTestDb, createPrescriptionApp, createPrescriptionTestDb, destroyPrescriptionTestDb, notificationProvider, seedPrescriptionTestDb, type PrescriptionTestDb } from '../helpers/db'
import { pharmacistAuth } from '../helpers/auth'
import { pharmacistIds } from '../fixtures/pharmacists'
import { prescriptionFixtures, prescriptionIds } from '../fixtures/prescriptions'
import { makePrescription } from '../fixtures/prescriptions'

describe('prescriptions/integration/06.verify-endpoint', () => {
  let harness: PrescriptionTestDb
  let app: ReturnType<typeof createPrescriptionApp>

  beforeAll(async () => {
    harness = await createPrescriptionTestDb()
    app = createPrescriptionApp(harness)
  })

  beforeEach(async () => {
    notificationProvider.notifyCustomer.mockReset()
    await seedPrescriptionTestDb(harness, { prescriptions: Object.values(prescriptionFixtures) })
  })

  afterEach(async () => cleanPrescriptionTestDb(harness))
  afterAll(async () => destroyPrescriptionTestDb(harness))

  it('approves a pending prescription and sets verification fields', async () => {
    const res = await api(app).put(`/prescriptions/${prescriptionIds.pending}/verify`).set(pharmacistAuth()).send({ action: 'approve' })
    expect(res.status).toBe(200)
    expect(res.body.result).toMatchObject({ status: 'verified', verifiedBy: pharmacistIds.licensedOnline.toString() })
    expect(res.body.result.verifiedAt).toBeTruthy()
    const final = await harness.prescriptions.findOne({ _id: prescriptionIds.pending })
    expect(final).toMatchObject({ status: 'verified', verifiedBy: pharmacistIds.licensedOnline })
  })

  it('rejects a pending prescription and saves notes', async () => {
    const res = await api(app).put(`/prescriptions/${prescriptionIds.pending}/verify`).set(pharmacistAuth()).send({ action: 'reject', notes: 'Thiếu chữ ký bác sĩ' })
    expect(res.status).toBe(200)
    expect(res.body.result).toMatchObject({ status: 'rejected', pharmacistNotes: 'Thiếu chữ ký bác sĩ' })
  })

  it('reject with empty reason returns 400', async () => {
    const res = await api(app).put(`/prescriptions/${prescriptionIds.pending}/verify`).set(pharmacistAuth()).send({ action: 'reject', notes: '   ' })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/reason/i)
  })

  it.each([
    ['already-verified', prescriptionIds.verified, 'verified'],
    ['already-rejected', prescriptionIds.rejected, 'rejected']
  ])('blocks %s prescription with 409 and no state change', async (_label, id, status) => {
    const before = await harness.prescriptions.findOne({ _id: id })
    const res = await api(app).put(`/prescriptions/${id}/verify`).set(pharmacistAuth()).send({ action: 'approve' })
    expect(res.status).toBe(409)
    const after = await harness.prescriptions.findOne({ _id: id })
    expect(after?.status).toBe(status)
    expect(after?.verifiedAt).toEqual(before?.verifiedAt)
  })

  it('blocks expired prescriptions with clear error', async () => {
    const res = await api(app).put(`/prescriptions/${prescriptionIds.expired}/verify`).set(pharmacistAuth()).send({ action: 'approve' })
    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/expired/i)
  })

  it('blocks verification without license', async () => {
    const res = await api(app).put(`/prescriptions/${prescriptionIds.pending}/verify`).set(pharmacistAuth(pharmacistIds.unlicensed)).send({ action: 'approve' })
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/license/i)
  })

  it('blocks verification while pharmacist is offline', async () => {
    const res = await api(app).put(`/prescriptions/${prescriptionIds.pending}/verify`).set(pharmacistAuth(pharmacistIds.offline)).send({ action: 'approve' })
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/online/i)
  })

  it('returns 404 for non-existent prescriptionId', async () => {
    const res = await api(app).put(`/prescriptions/${new ObjectId()}/verify`).set(pharmacistAuth()).send({ action: 'approve' })
    expect(res.status).toBe(404)
  })

  it('response includes updated prescription fields', async () => {
    const prescription = makePrescription({ _id: new ObjectId(), prescriptionNumber: 'RX-VERIFY-FIELDS' })
    await harness.prescriptions.insertOne(prescription)
    const res = await api(app).put(`/prescriptions/${prescription._id}/verify`).set(pharmacistAuth()).send({ status: 'verified' })
    expect(res.status).toBe(200)
    expect(res.body.result).toEqual(expect.objectContaining({ _id: prescription._id.toString(), prescriptionNumber: 'RX-VERIFY-FIELDS', status: 'verified', verifiedAt: expect.any(String), updatedAt: expect.any(String) }))
  })

  it('applies pharmacist OCR corrections atomically when approving', async () => {
    const prescription = makePrescription({ _id: new ObjectId(), prescriptionNumber: 'RX-CORRECT-ON-APPROVE' })
    await harness.prescriptions.insertOne(prescription)

    const corrections = {
      patientName: 'Nguyen Van Corrected',
      patientAge: '33',
      diagnosis: 'Chan doan da hieu chinh',
      doctorName: 'Dr. Corrected',
      medications: [
        {
          productId: prescription.medications[0].productId.toString(),
          productName: 'Amoxicillin 500mg corrected',
          dosage: '500mg',
          quantity: 1,
          instructions: 'Uong sau an sang toi'
        }
      ]
    }

    const res = await api(app).put(`/prescriptions/${prescription._id}/verify`).set(pharmacistAuth()).send({ status: 'verified', corrections })
    expect(res.status).toBe(200)
    const final = await harness.prescriptions.findOne({ _id: prescription._id })
    expect(final).toEqual(expect.objectContaining({ status: 'verified', patientName: 'Nguyen Van Corrected', correctedBy: pharmacistIds.licensedOnline, correctedAt: expect.any(Date) }))
    expect(final?.medications[0]).toEqual(expect.objectContaining({ productName: 'Amoxicillin 500mg corrected', instructions: 'Uong sau an sang toi' }))
  })

  it.each([
    ['unrealistic age', { patientAge: '151' }, /age/i],
    ['empty medication list', { medications: [] }, /medications/i],
    ['blank medication name', { medications: [{ productName: ' ', quantity: 1 }] }, /medication/i],
    ['zero medication quantity', { medications: [{ productName: 'Amoxicillin 500mg', quantity: 0 }] }, /medication/i]
  ])('rejects invalid correction payload: %s', async (_label, corrections, message) => {
    const prescription = makePrescription({ _id: new ObjectId(), prescriptionNumber: `RX-BAD-CORRECTION-${_label}` })
    await harness.prescriptions.insertOne(prescription)
    const res = await api(app).put(`/prescriptions/${prescription._id}/verify`).set(pharmacistAuth()).send({ status: 'verified', corrections })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(message)
    const final = await harness.prescriptions.findOne({ _id: prescription._id })
    expect(final?.status).toBe('pending')
    expect(final?.verifiedAt).toBeFalsy()
  })
})
