import express from 'express'
import request from 'supertest'
import { MongoClient, ObjectId, type Collection, type Db } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { vi } from 'vitest'
import { parseTestToken } from './auth'
import { makeCustomer } from '../fixtures/customers'
import { pharmacistFixtures } from '../fixtures/pharmacists'
import { productFixtures } from '../fixtures/products'
import { makePrescription } from '../fixtures/prescriptions'

export interface PrescriptionTestDb {
  mongo: MongoMemoryServer
  client: MongoClient
  db: Db
  users: Collection
  products: Collection
  prescriptions: Collection
  orders: Collection
  notifications: Collection
  auditLogs: Collection
  patientPhiAuditLogs: Collection
}

export async function createPrescriptionTestDb(): Promise<PrescriptionTestDb> {
  const mongo = await MongoMemoryServer.create()
  const client = new MongoClient(mongo.getUri())
  await client.connect()
  const db = client.db('medispace_prescriptions_test')
  const harness = {
    mongo,
    client,
    db,
    users: db.collection('users'),
    products: db.collection('products'),
    prescriptions: db.collection('prescriptions'),
    orders: db.collection('orders'),
    notifications: db.collection('notifications'),
    auditLogs: db.collection('prescription_audit_logs'),
    patientPhiAuditLogs: db.collection('patient_phi_audit_logs')
  }
  await harness.orders.createIndex({ orderNumber: 1 }, { unique: true })
  await harness.orders.createIndex({ prescriptionId: 1 }, { unique: true, partialFilterExpression: { prescriptionId: { $type: 'objectId' } } })
  await harness.prescriptions.createIndex({ status: 1, createdAt: -1 })
  return harness
}

export async function destroyPrescriptionTestDb(harness: PrescriptionTestDb) {
  await harness.client.close()
  await harness.mongo.stop()
}

export async function cleanPrescriptionTestDb(harness: PrescriptionTestDb) {
  await Promise.all([
    harness.users.deleteMany({}),
    harness.products.deleteMany({}),
    harness.prescriptions.deleteMany({}),
    harness.orders.deleteMany({}),
    harness.notifications.deleteMany({}),
    harness.auditLogs.deleteMany({}),
    harness.patientPhiAuditLogs.deleteMany({})
  ])
}

export async function seedPrescriptionTestDb(harness: PrescriptionTestDb, overrides: { prescriptions?: any[]; users?: any[]; products?: any[] } = {}) {
  await cleanPrescriptionTestDb(harness)
  await harness.users.insertMany(overrides.users || [makeCustomer(), ...Object.values(pharmacistFixtures)])
  await harness.products.insertMany(overrides.products || Object.values(productFixtures))
  if (overrides.prescriptions?.length) await harness.prescriptions.insertMany(overrides.prescriptions)
}

export const notificationProvider = {
  notifyPharmacists: vi.fn(),
  notifyCustomer: vi.fn()
}

async function requirePharmacist(req: express.Request, res: express.Response, harness: PrescriptionTestDb) {
  const token = parseTestToken(req.header('Authorization') || undefined)
  if (!token || token.expired) {
    res.status(401).json({ message: 'Unauthorized' })
    return null
  }
  if (token.role !== 1) {
    res.status(403).json({ message: 'Only pharmacists can access this feature' })
    return null
  }
  const user = await harness.users.findOne({ _id: new ObjectId(token.userId) })
  if (!user) {
    res.status(401).json({ message: 'Unauthorized' })
    return null
  }
  return user
}

async function requireLicense(req: express.Request, res: express.Response, harness: PrescriptionTestDb) {
  const user = await requirePharmacist(req, res, harness)
  if (!user) return null
  if (!user.lisenseNumber) {
    res.status(403).json({ message: 'License required' })
    return null
  }
  if (user.isOnline === false) {
    res.status(403).json({ message: 'Pharmacist must be online' })
    return null
  }
  return user
}

async function canAccessPatientPhi(harness: PrescriptionTestDb, pharmacistId: ObjectId, customerId: ObjectId) {
  const [relatedPrescription, createdOrder] = await Promise.all([
    harness.prescriptions.findOne({ customerId, $or: [{ status: 'pending' }, { verifiedBy: pharmacistId }] }),
    harness.orders.findOne({ userId: customerId, createdBy: pharmacistId })
  ])
  return Boolean(relatedPrescription || createdOrder)
}

async function writePatientPhiAudit(harness: PrescriptionTestDb, req: express.Request, pharmacistId: ObjectId, action: string, customerId?: ObjectId, extra: Record<string, unknown> = {}) {
  await harness.patientPhiAuditLogs.insertOne({ pharmacistId, customerId, action, path: req.originalUrl, method: req.method, createdAt: new Date(), ...extra })
}

async function requirePatientPhiAccess(req: express.Request, res: express.Response, harness: PrescriptionTestDb, pharmacistId: ObjectId, customerId: ObjectId) {
  const allowed = await canAccessPatientPhi(harness, pharmacistId, customerId)
  await writePatientPhiAudit(harness, req, pharmacistId, 'patient_phi_access_attempt', customerId, { allowed })
  if (!allowed) {
    res.status(403).json({ message: 'Patient PHI access is not authorized for this pharmacist' })
    return false
  }
  return true
}

export function createPrescriptionApp(harness: PrescriptionTestDb) {
  const app = express()
  app.use(express.json())

  app.get('/pharmacist/patients/search', async (req, res) => {
    const user = await requirePharmacist(req, res, harness)
    if (!user) return
    const query = String(req.query.phone || '').trim()
    const regex = new RegExp(`^${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')
    const users = await harness.users.find({ role: 0, $or: [{ phoneNumber: regex }, { firstName: regex }, { lastName: regex }] }).toArray()
    const scoped = []
    for (const candidate of users) {
      if (await canAccessPatientPhi(harness, user._id, candidate._id)) scoped.push(candidate)
    }
    await writePatientPhiAudit(harness, req, user._id, 'patient_search', undefined, { query, resultCount: scoped.length })
    res.json({ result: scoped })
  })

  app.get('/pharmacist/patients/:customerId/history', async (req, res) => {
    const user = await requirePharmacist(req, res, harness)
    if (!user) return
    if (!ObjectId.isValid(req.params.customerId)) return res.status(404).json({ message: 'Patient not found' })
    const customerId = new ObjectId(req.params.customerId)
    if (!(await requirePatientPhiAccess(req, res, harness, user._id, customerId))) return
    const prescriptions = await harness.prescriptions.find({ customerId }).toArray()
    const orders = await harness.orders.find({ userId: customerId }).toArray()
    await writePatientPhiAudit(harness, req, user._id, 'patient_history_view', customerId)
    res.json({ result: { prescriptions, orders, totalOrders: orders.length } })
  })

  app.get('/prescriptions/pending', async (req, res) => {
    const user = await requirePharmacist(req, res, harness)
    if (!user) return
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const query: Record<string, unknown> = status && status !== 'all' ? { status } : { status: 'pending' }
    const prescriptions = await harness.prescriptions.find(query).sort({ createdAt: -1 }).toArray()
    res.json({ result: { prescriptions, pagination: { page: 1, limit: prescriptions.length, total: prescriptions.length, totalPages: 1 } } })
  })

  app.get('/prescriptions/:id', async (req, res) => {
    const user = await requirePharmacist(req, res, harness)
    if (!user) return
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Prescription not found' })
    const prescription = await harness.prescriptions.findOne({ _id: new ObjectId(req.params.id) })
    if (!prescription) return res.status(404).json({ message: 'Prescription not found' })
    await harness.auditLogs.insertOne({ prescriptionId: prescription._id, pharmacistId: user._id, action: 'view', timestamp: new Date() })
    res.json({ result: prescription })
  })

  app.get('/prescriptions/:id/audit', async (req, res) => {
    const user = await requirePharmacist(req, res, harness)
    if (!user) return
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Prescription not found' })
    const prescriptionId = new ObjectId(req.params.id)
    const entries = await harness.auditLogs.find({ prescriptionId }).sort({ timestamp: 1 }).toArray()
    res.json({ result: entries })
  })

  app.put('/prescriptions/:id/verify', async (req, res) => {
    const user = await requireLicense(req, res, harness)
    if (!user) return
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Prescription not found' })
    const requestedStatus = req.body.status || (req.body.action === 'approve' ? 'verified' : req.body.action === 'reject' ? 'rejected' : undefined)
    if (!['verified', 'rejected'].includes(requestedStatus)) return res.status(400).json({ message: 'Invalid prescription verification status' })
    if (requestedStatus === 'rejected' && !req.body.notes?.trim()) return res.status(400).json({ message: 'Rejection reason is required' })
    if (requestedStatus === 'verified' && req.body.corrections) {
      if (req.body.corrections.patientAge !== undefined) {
        const age = Number(req.body.corrections.patientAge)
        if (!Number.isFinite(age) || age < 0 || age > 150) return res.status(400).json({ message: 'Invalid corrected patient age' })
      }
      if (req.body.corrections.medications !== undefined) {
        if (!Array.isArray(req.body.corrections.medications) || req.body.corrections.medications.length === 0) {
          return res.status(400).json({ message: 'Corrected medications must contain at least one item' })
        }
        if (req.body.corrections.medications.some((medication: any) => !medication.productName?.trim() || Number(medication.quantity) <= 0)) {
          return res.status(400).json({ message: 'Corrected medication is invalid' })
        }
      }
    }
    const prescriptionId = new ObjectId(req.params.id)
    const before = await harness.prescriptions.findOne({ _id: prescriptionId })
    if (!before) return res.status(404).json({ message: 'Prescription not found' })
    const result = await harness.prescriptions.findOneAndUpdate(
      { _id: prescriptionId, status: 'pending' },
      {
        $set: {
          status: requestedStatus,
          verifiedBy: user._id,
          verifiedAt: new Date(),
          updatedAt: new Date(),
          ...(req.body.notes ? { pharmacistNotes: req.body.notes.trim() } : {}),
          ...(requestedStatus === 'verified' && req.body.corrections
            ? {
                ...req.body.corrections,
                ...(req.body.corrections.medications ? { medications: req.body.corrections.medications } : {}),
                correctedBy: user._id,
                correctedAt: new Date()
              }
            : {})
        }
      },
      { returnDocument: 'after' }
    )
    if (!result) return res.status(409).json({ message: before.status === 'expired' ? 'Prescription has expired' : 'Prescription already verified' })
    await harness.auditLogs.insertOne({ prescriptionId, pharmacistId: user._id, action: requestedStatus, timestamp: new Date(), previousStatus: before.status, newStatus: requestedStatus })
    try {
      await notificationProvider.notifyCustomer(result.customerId, prescriptionId, requestedStatus, req.body.notes)
    } catch {}
    res.json({ result })
  })

  app.post('/prescriptions', async (req, res) => {
    const customerId = new ObjectId(req.body.customerId)
    const prescription = makePrescription({ _id: new ObjectId(), customerId, ...req.body, status: 'pending', createdAt: new Date(), updatedAt: new Date() })
    await harness.prescriptions.insertOne(prescription)
    try {
      await notificationProvider.notifyPharmacists(prescription)
    } catch {}
    res.status(201).json({ result: prescription })
  })

  app.post('/pharmacist/orders', async (req, res) => {
    const user = await requireLicense(req, res, harness)
    if (!user) return
    if (req.body.prescriptionId && !ObjectId.isValid(req.body.prescriptionId)) return res.status(400).json({ message: 'Invalid prescription ID' })
    const prescriptionId = req.body.prescriptionId ? new ObjectId(req.body.prescriptionId) : undefined
    const prescription = prescriptionId ? await harness.prescriptions.findOne({ _id: prescriptionId }) : null
    if (prescriptionId && !prescription) return res.status(404).json({ message: 'Prescription not found' })
    if (prescription && prescription.status !== 'verified') return res.status(400).json({ message: 'Only verified prescriptions can be used to create orders' })
    if (prescription?.validUntil && prescription.validUntil < new Date()) return res.status(400).json({ message: 'Prescription has expired' })
    for (const item of req.body.items || []) {
      const med = (prescription?.medications || []).find((m: any) => m.productId?.toString() === item.productId)
      if (med && item.quantity > med.quantity) return res.status(400).json({ message: `Prescription quantity exceeded for ${med.productName}` })
    }
    const existing = prescriptionId ? await harness.orders.findOne({ prescriptionId }) : null
    if (existing) return res.status(409).json({ message: 'An order has already been created for this prescription' })
    const orderId = new ObjectId()
    const orderNumber = `DH${Date.now()}${Math.floor(Math.random() * 100000)}`
    let userId = prescription?.customerId
    if (!userId && req.body.customerId) {
      const customer = await harness.users.findOne({ phoneNumber: req.body.customerId, role: 0 })
      userId = customer?._id
    }
    if (!userId) {
      const shippingAddress = req.body.shippingAddress || {}
      const guest = {
        _id: new ObjectId(),
        email: shippingAddress.email || `guest-${orderNumber.toLowerCase()}@medispace.local`,
        firstName: shippingAddress.firstName || 'Guest',
        lastName: shippingAddress.lastName || 'Customer',
        phoneNumber: shippingAddress.phone || '',
        role: 0,
        status: 1,
        isGuest: true,
        guestSource: 'pharmacist_pos',
        createdAt: new Date(),
        updatedAt: new Date()
      }
      await harness.users.insertOne(guest)
      userId = guest._id
    }
    const isInstore = req.body.deliveryMethod === 'instore'
    const order = { _id: orderId, orderNumber, prescriptionId, createdBy: user._id, items: req.body.items, userId, orderStatus: isInstore ? 'confirmed' : 'pending', paymentStatus: 'pending', createdAt: new Date(), updatedAt: new Date() }
    try {
      await harness.orders.insertOne(order)
    } catch (error: any) {
      if (error.code === 11000) return res.status(409).json({ message: 'An order has already been created for this prescription' })
      throw error
    }
    res.status(201).json({ result: { order, orderId: orderId.toString(), orderNumber: order.orderNumber } })
  })

  return app
}

export function api(app: express.Express) {
  return request(app)
}
