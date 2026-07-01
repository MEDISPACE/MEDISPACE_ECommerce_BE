import { ObjectId } from 'mongodb'

export const productIds = {
  amoxicillin500: new ObjectId('650000000000000000000301'),
  paracetamol650: new ObjectId('650000000000000000000302'),
  wrongExtra: new ObjectId('650000000000000000000303')
}

export function makeProduct(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: productIds.amoxicillin500,
    name: 'Amoxicillin 500mg',
    sku: 'AMOX-500',
    dosage: '500mg',
    stockQuantity: 50,
    requiresPrescription: true,
    featuredImage: '/mock/amoxicillin.png',
    priceVariants: [{ unit: 'hop', price: 50000, quantityPerUnit: 1, isDefault: true }],
    isActive: true,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides
  }
}

export const productFixtures = {
  amoxicillin500: makeProduct(),
  paracetamol650: makeProduct({ _id: productIds.paracetamol650, name: 'Paracetamol 650mg', sku: 'PARA-650', dosage: '650mg', requiresPrescription: false }),
  wrongExtra: makeProduct({ _id: productIds.wrongExtra, name: 'Tampered Extra Product 10mg', sku: 'TAMPER-10', dosage: '10mg', requiresPrescription: true })
}
