import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ObjectId } from 'mongodb'
import { api, cleanPrescriptionTestDb, createPrescriptionApp, createPrescriptionTestDb, destroyPrescriptionTestDb, notificationProvider, seedPrescriptionTestDb, type PrescriptionTestDb } from '../helpers/db'
import { pharmacistAuth } from '../helpers/auth'
import { customerIds } from '../fixtures/customers'
import { prescriptionFixtures, prescriptionIds } from '../fixtures/prescriptions'

describe('prescriptions/integration/10.notification-delivery', () => {
  let harness: PrescriptionTestDb
  let app: ReturnType<typeof createPrescriptionApp>

  beforeAll(async () => {
    harness = await createPrescriptionTestDb()
    app = createPrescriptionApp(harness)
  })

  beforeEach(async () => {
    notificationProvider.notifyPharmacists.mockReset()
    notificationProvider.notifyCustomer.mockReset()
    await seedPrescriptionTestDb(harness, { prescriptions: Object.values(prescriptionFixtures) })
  })

  afterEach(async () => cleanPrescriptionTestDb(harness))
  afterAll(async () => destroyPrescriptionTestDb(harness))

  it('new prescription upload triggers pharmacist notification job', async () => {
    const res = await api(app).post('/prescriptions').send({ customerId: customerIds.primary.toString(), prescriptionNumber: 'RX-NOTIFY-UPLOAD', doctorName: 'Dr. Notify', images: ['mock://image.png'], medications: [] })
    expect(res.status).toBe(201)
    expect(notificationProvider.notifyPharmacists).toHaveBeenCalledTimes(1)
  })

  it('notification failure does not roll back prescription creation', async () => {
    notificationProvider.notifyPharmacists.mockRejectedValueOnce(new Error('provider down'))
    const res = await api(app).post('/prescriptions').send({ customerId: customerIds.primary.toString(), prescriptionNumber: 'RX-NOTIFY-FAIL', doctorName: 'Dr. Notify', images: ['mock://image.png'], medications: [] })
    expect(res.status).toBe(201)
    await expect(harness.prescriptions.findOne({ prescriptionNumber: 'RX-NOTIFY-FAIL' })).resolves.toBeTruthy()
  })

  it('approve action triggers customer notification', async () => {
    const res = await api(app).put(`/prescriptions/${prescriptionIds.pending}/verify`).set(pharmacistAuth()).send({ action: 'approve' })
    expect(res.status).toBe(200)
    expect(notificationProvider.notifyCustomer).toHaveBeenCalledWith(customerIds.primary, prescriptionIds.pending, 'verified', undefined)
  })

  it('reject action triggers customer notification with reason', async () => {
    const res = await api(app).put(`/prescriptions/${prescriptionIds.pending}/verify`).set(pharmacistAuth()).send({ action: 'reject', notes: 'Không đọc được tên thuốc' })
    expect(res.status).toBe(200)
    expect(notificationProvider.notifyCustomer).toHaveBeenCalledWith(customerIds.primary, prescriptionIds.pending, 'rejected', 'Không đọc được tên thuốc')
  })

  it.each(['approve', 'reject'] as const)('notification failure on %s does not block committed status change', async (action) => {
    const id = new ObjectId()
    await harness.prescriptions.insertOne({ ...prescriptionFixtures.pending, _id: id, prescriptionNumber: `RX-NOTIFY-${action}` })
    notificationProvider.notifyCustomer.mockRejectedValueOnce(new Error('provider down'))
    const res = await api(app).put(`/prescriptions/${id}/verify`).set(pharmacistAuth()).send(action === 'approve' ? { action } : { action, notes: 'Lý do từ chối hợp lệ' })
    expect(res.status).toBe(200)
    const final = await harness.prescriptions.findOne({ _id: id })
    expect(final?.status).toBe(action === 'approve' ? 'verified' : 'rejected')
  })

  it('does not notify customer when verification request fails validation', async () => {
    const res = await api(app).put(`/prescriptions/${prescriptionIds.pending}/verify`).set(pharmacistAuth()).send({ action: 'reject', notes: '   ' })
    expect(res.status).toBe(400)
    expect(notificationProvider.notifyCustomer).not.toHaveBeenCalled()
  })
})
