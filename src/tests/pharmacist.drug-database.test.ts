import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { MongoClient, ObjectId } from 'mongodb'

vi.mock('~/services/payment.services', () => ({ default: {} }))
vi.mock('~/services/orders.services', () => ({ default: {} }))
vi.mock('~/services/ghn.services', () => ({ default: {} }))
vi.mock('~/services/prescriptions.services', () => ({ default: { getPrescriptionStats: vi.fn() } }))
vi.mock('~/services/notifications.services', () => ({ default: { notifyLowStock: vi.fn() } }))
vi.mock('~/sockets/chat.socket', () => ({ getIO: vi.fn() }))
vi.mock('~/middlewares/patientPhi.middlewares', () => ({ canAccessPatientPhi: vi.fn() }))
vi.mock('~/services/typesense.services', () => ({
  default: {
    getAvailability: vi.fn(() => false),
    searchProducts: vi.fn()
  }
}))

const { default: pharmacistService } = await import('~/services/pharmacist.services')

describe('pharmacist drug database aggregation', () => {
  let mongoServer: MongoMemoryServer
  let client: MongoClient

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create()
    client = new MongoClient(mongoServer.getUri())
    await client.connect()
  })

  afterAll(async () => {
    await client.close()
    await mongoServer.stop()
  })

  it('does not crash when legacy products have malformed priceVariants', async () => {
    const db = client.db('drug-database-regression')
    const products = db.collection('products')
    const categoryId = new ObjectId()
    const brandId = new ObjectId()

    await db.collection('categories').insertOne({ _id: categoryId, name: 'Thuoc', slug: 'thuoc', path: '/thuoc' })
    await db.collection('brands').insertOne({ _id: brandId, name: 'Legacy Brand', slug: 'legacy-brand' })
    await products.insertMany([
      {
        _id: new ObjectId(),
        name: 'Legacy object price variants',
        slug: 'legacy-object-price-variants',
        sku: 'LEGACY-OBJ',
        categoryId,
        brandId,
        priceVariants: { unit: 'Hop', price: 1000 },
        stockQuantity: 10,
        isActive: true,
        requiresPrescription: false,
        status: 'active'
      },
      {
        _id: new ObjectId(),
        name: 'Legacy string price variants',
        slug: 'legacy-string-price-variants',
        sku: 'LEGACY-STR',
        categoryId,
        brandId,
        priceVariants: 'invalid',
        stockQuantity: 5,
        isActive: true,
        requiresPrescription: false,
        status: 'active'
      }
    ])

    const pipeline = (pharmacistService as any).buildDrugDatabasePipeline({ isActive: true }, undefined, { name: 1 })
    const result = await products.aggregate(pipeline).toArray()

    expect(result).toHaveLength(2)
    expect(result.every((product) => Array.isArray(product.priceVariants))).toBe(true)
    expect(result.every((product) => product.priceVariants.length === 0)).toBe(true)
    expect(result.every((product) => product.calculatedPrice === 0)).toBe(true)
  })
})
