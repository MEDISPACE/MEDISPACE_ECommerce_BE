import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { api, cleanPrescriptionTestDb, createPrescriptionApp, createPrescriptionTestDb, destroyPrescriptionTestDb, seedPrescriptionTestDb, type PrescriptionTestDb } from '../helpers/db'
import { pharmacistAuth } from '../helpers/auth'
import { prescriptionFixtures, prescriptionIds } from '../fixtures/prescriptions'
import { productIds } from '../fixtures/products'

describe('prescriptions/integration/09.order-linkage', () => {
  let harness: PrescriptionTestDb
  let app: ReturnType<typeof createPrescriptionApp>

  beforeAll(async () => {
    harness = await createPrescriptionTestDb()
    app = createPrescriptionApp(harness)
  })

  beforeEach(async () => seedPrescriptionTestDb(harness, { prescriptions: Object.values(prescriptionFixtures) }))
  afterEach(async () => cleanPrescriptionTestDb(harness))
  afterAll(async () => destroyPrescriptionTestDb(harness))

  const orderPayload = (prescriptionId = prescriptionIds.verified.toString(), overrides = {}) => ({
    prescriptionId,
    items: [{ productId: productIds.amoxicillin500.toString(), quantity: 1, unit: 'hop' }],
    ...overrides
  })

  const guestOrderPayload = (overrides = {}) => ({
    items: [{ productId: productIds.paracetamol650.toString(), quantity: 1, unit: 'hop' }],
    shippingAddress: {
      firstName: 'Guest',
      lastName: 'Buyer',
      phone: '0912345678',
      email: 'guest.order@medispace.test',
      address: '1 Test Street',
      ward: 'Ben Thanh',
      district: '1',
      province: 'TP.HCM'
    },
    deliveryMethod: 'instore',
    paymentMethod: 'cash',
    ...overrides
  })

  it('creates order from a verified prescription', async () => {
    const res = await api(app).post('/pharmacist/orders').set(pharmacistAuth()).send(orderPayload())
    expect(res.status).toBe(201)
    const order = await harness.orders.findOne({ prescriptionId: prescriptionIds.verified })
    expect(order).toMatchObject({ prescriptionId: prescriptionIds.verified })
  })

  it.each([
    ['pending', prescriptionIds.pending],
    ['rejected', prescriptionIds.rejected]
  ])('blocks order creation from %s prescription', async (_status, id) => {
    const res = await api(app).post('/pharmacist/orders').set(pharmacistAuth()).send(orderPayload(id.toString()))
    expect(res.status).toBe(400)
  })

  it('blocks malformed prescriptionId before DB mutation', async () => {
    const res = await api(app).post('/pharmacist/orders').set(pharmacistAuth()).send(orderPayload('not-a-valid-object-id'))
    expect(res.status).toBe(400)
    expect(await harness.orders.countDocuments({})).toBe(0)
  })

  it('allows arbitrary products when creating from a verified prescription', async () => {
    const res = await api(app).post('/pharmacist/orders').set(pharmacistAuth()).send(orderPayload(undefined, { items: [{ productId: productIds.wrongExtra.toString(), quantity: 1 }] }))
    expect(res.status).toBe(201)
    const order = await harness.orders.findOne({ prescriptionId: prescriptionIds.verified })
    expect(order?.items).toEqual(expect.arrayContaining([expect.objectContaining({ productId: productIds.wrongExtra.toString() })]))
  })

  it('blocks quantity exceeding prescribed amount', async () => {
    const res = await api(app).post('/pharmacist/orders').set(pharmacistAuth()).send(orderPayload(undefined, { items: [{ productId: productIds.amoxicillin500.toString(), quantity: 99 }] }))
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/quantity/i)
  })

  it('blocks second order from same prescription for full-fulfillment model', async () => {
    const first = await api(app).post('/pharmacist/orders').set(pharmacistAuth()).send(orderPayload())
    const second = await api(app).post('/pharmacist/orders').set(pharmacistAuth()).send(orderPayload())
    expect(first.status).toBe(201)
    expect(second.status).toBe(409)
  })

  it('two concurrent create-order requests for same prescription produce exactly one order', async () => {
    const [first, second] = await Promise.all([
      api(app).post('/pharmacist/orders').set(pharmacistAuth()).send(orderPayload()),
      api(app).post('/pharmacist/orders').set(pharmacistAuth()).send(orderPayload())
    ])
    expect([first.status, second.status].sort()).toEqual([201, 409])
    expect(await harness.orders.countDocuments({ prescriptionId: prescriptionIds.verified })).toBe(1)
  })

  it('links created order back via prescriptionId for traceability', async () => {
    await api(app).post('/pharmacist/orders').set(pharmacistAuth()).send(orderPayload())
    const order = await harness.orders.findOne({ prescriptionId: prescriptionIds.verified })
    expect(order?.prescriptionId).toEqual(prescriptionIds.verified)
  })

  it('creates an explicit guest customer instead of an orphan userId when no customer is selected', async () => {
    const res = await api(app).post('/pharmacist/orders').set(pharmacistAuth()).send(guestOrderPayload())
    expect(res.status).toBe(201)
    const order = await harness.orders.findOne({ orderNumber: res.body.result.orderNumber })
    const linkedUser = await harness.users.findOne({ _id: order?.userId })
    expect(linkedUser).toEqual(expect.objectContaining({ isGuest: true, guestSource: 'pharmacist_pos' }))
  })

  it('keeps in-store pharmacist orders pending payment and not delivered until reconciliation', async () => {
    const res = await api(app).post('/pharmacist/orders').set(pharmacistAuth()).send(guestOrderPayload())
    expect(res.status).toBe(201)
    const order = await harness.orders.findOne({ orderNumber: res.body.result.orderNumber })
    expect(order).toEqual(expect.objectContaining({ paymentStatus: 'pending', orderStatus: 'confirmed' }))
    expect(order?.paidAt).toBeUndefined()
    expect(order?.deliveredAt).toBeUndefined()
  })
})
