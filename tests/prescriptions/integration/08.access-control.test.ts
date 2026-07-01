import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { api, cleanPrescriptionTestDb, createPrescriptionApp, createPrescriptionTestDb, destroyPrescriptionTestDb, seedPrescriptionTestDb, type PrescriptionTestDb } from '../helpers/db'
import { customerAuth, expiredAuth, pharmacistAuth } from '../helpers/auth'
import { pharmacistIds } from '../fixtures/pharmacists'
import { prescriptionFixtures, prescriptionIds } from '../fixtures/prescriptions'
import { customerIds, makeCustomer } from '../fixtures/customers'

describe('prescriptions/integration/08.access-control', () => {
  let harness: PrescriptionTestDb
  let app: ReturnType<typeof createPrescriptionApp>

  beforeAll(async () => {
    harness = await createPrescriptionTestDb()
    app = createPrescriptionApp(harness)
  })

  beforeEach(async () => seedPrescriptionTestDb(harness, { prescriptions: Object.values(prescriptionFixtures) }))
  afterEach(async () => cleanPrescriptionTestDb(harness))
  afterAll(async () => destroyPrescriptionTestDb(harness))

  it('GET /prescriptions/pending without auth returns 401', async () => {
    const res = await api(app).get('/prescriptions/pending')
    expect(res.status).toBe(401)
  })

  it('GET /prescriptions/pending with non-pharmacist role returns 403', async () => {
    const res = await api(app).get('/prescriptions/pending').set(customerAuth())
    expect(res.status).toBe(403)
  })

  it('verify without license returns 403', async () => {
    const res = await api(app).put(`/prescriptions/${prescriptionIds.pending}/verify`).set(pharmacistAuth(pharmacistIds.unlicensed)).send({ action: 'approve' })
    expect(res.status).toBe(403)
  })

  it('verify with license but isOnline=false returns 403', async () => {
    const res = await api(app).put(`/prescriptions/${prescriptionIds.pending}/verify`).set(pharmacistAuth(pharmacistIds.offline)).send({ action: 'approve' })
    expect(res.status).toBe(403)
  })

  it('any licensed pharmacist can access any prescription detail', async () => {
    const res = await api(app).get(`/prescriptions/${prescriptionIds.pending}`).set(pharmacistAuth(pharmacistIds.licensedSecond))
    expect(res.status).toBe(200)
    expect(res.body.result._id).toBe(prescriptionIds.pending.toString())
  })

  it.each([
    ['read pending list', () => api(app).get('/prescriptions/pending').set(customerAuth())],
    ['read detail', () => api(app).get(`/prescriptions/${prescriptionIds.pending}`).set(customerAuth())],
    ['verify', () => api(app).put(`/prescriptions/${prescriptionIds.pending}/verify`).set(customerAuth()).send({ action: 'approve' })],
    ['create order', () => api(app).post('/pharmacist/orders').set(customerAuth()).send({ prescriptionId: prescriptionIds.verified.toString(), items: [] })]
  ])('customer role cannot %s', async (_label, requestFactory) => {
    const res = await requestFactory()
    expect(res.status).toBe(403)
  })

  it.each([
    ['pending list', () => api(app).get('/prescriptions/pending').set(expiredAuth())],
    ['detail', () => api(app).get(`/prescriptions/${prescriptionIds.pending}`).set(expiredAuth())],
    ['verify', () => api(app).put(`/prescriptions/${prescriptionIds.pending}/verify`).set(expiredAuth()).send({ action: 'approve' })]
  ])('expired session receives 401 on %s', async (_label, requestFactory) => {
    const res = await requestFactory()
    expect(res.status).toBe(401)
  })

  it('prescriptionId enumeration with wrong role returns 403, not 404', async () => {
    const res = await api(app).get(`/prescriptions/${prescriptionIds.pending}`).set(customerAuth())
    expect(res.status).toBe(403)
  })

  it('malformed prescriptionId returns 404 for authorized pharmacist without crashing', async () => {
    const res = await api(app).get('/prescriptions/not-a-valid-object-id').set(pharmacistAuth())
    expect(res.status).toBe(404)
  })

  it('patient search only returns PHI-scoped customers for the pharmacist', async () => {
    await harness.users.insertOne(makeCustomer({ _id: customerIds.secondary, email: 'outside-scope@medispace.test', phoneNumber: '0900000002' }))
    const res = await api(app).get('/pharmacist/patients/search?phone=090000000').set(pharmacistAuth())
    expect(res.status).toBe(200)
    expect(res.body.result.map((user: any) => user._id)).toEqual([customerIds.primary.toString()])

    const audit = await harness.patientPhiAuditLogs.findOne({ action: 'patient_search' })
    expect(audit).toEqual(expect.objectContaining({ pharmacistId: pharmacistIds.licensedOnline, resultCount: 1 }))
  })

  it('blocks patient history when pharmacist has no PHI relationship and audits the denied attempt', async () => {
    await harness.users.insertOne(makeCustomer({ _id: customerIds.secondary, email: 'outside-history@medispace.test', phoneNumber: '0900000003' }))
    const res = await api(app).get(`/pharmacist/patients/${customerIds.secondary}/history`).set(pharmacistAuth())
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/PHI access is not authorized/i)

    const audit = await harness.patientPhiAuditLogs.findOne({ action: 'patient_phi_access_attempt', customerId: customerIds.secondary })
    expect(audit).toEqual(expect.objectContaining({ pharmacistId: pharmacistIds.licensedOnline, allowed: false }))
  })

  it('allows patient history when pharmacist has scoped PHI relationship and audits both attempt and view', async () => {
    const res = await api(app).get(`/pharmacist/patients/${customerIds.primary}/history`).set(pharmacistAuth())
    expect(res.status).toBe(200)
    expect(res.body.result.prescriptions.length).toBeGreaterThan(0)

    const entries = await harness.patientPhiAuditLogs.find({ customerId: customerIds.primary }).sort({ createdAt: 1 }).toArray()
    expect(entries.map((entry) => entry.action)).toEqual(['patient_phi_access_attempt', 'patient_history_view'])
    expect(entries[0]).toEqual(expect.objectContaining({ allowed: true, pharmacistId: pharmacistIds.licensedOnline }))
  })

  it('malformed patientId returns 404 before PHI lookup', async () => {
    const res = await api(app).get('/pharmacist/patients/not-an-id/history').set(pharmacistAuth())
    expect(res.status).toBe(404)
  })
})
