import { ObjectId } from 'mongodb'
import { customerIds } from './customers'
import { productIds } from './products'

export const prescriptionIds = {
  pending: new ObjectId('650000000000000000000401'),
  verified: new ObjectId('650000000000000000000402'),
  rejected: new ObjectId('650000000000000000000403'),
  expired: new ObjectId('650000000000000000000404'),
  unmapped: new ObjectId('650000000000000000000405')
}

export function makePrescription(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date('2026-06-30T04:40:00.000Z')
  return {
    _id: prescriptionIds.pending,
    prescriptionNumber: 'RX-PENDING-001',
    customerId: customerIds.primary,
    patientName: 'Nguyen Van A',
    patientAge: '32',
    patientGender: 'male',
    diagnosis: 'Viem hong cap',
    doctorName: 'Dr. QA',
    hospitalName: 'MediSpace Clinic',
    prescriptionDate: now,
    images: ['mock-prescription-image://rx-001.png'],
    medications: [
      { productName: 'Amoxicillin 500mg', dosage: '500mg', quantity: 1, unit: 'hop', instructions: 'Uong sau an', productId: productIds.amoxicillin500 }
    ],
    status: 'pending',
    validUntil: new Date('2026-07-30T04:40:00.000Z'),
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

export const prescriptionFixtures = {
  pending: makePrescription(),
  verified: makePrescription({ _id: prescriptionIds.verified, prescriptionNumber: 'RX-VERIFIED-001', status: 'verified', verifiedAt: new Date('2026-06-30T05:00:00.000Z') }),
  rejected: makePrescription({ _id: prescriptionIds.rejected, prescriptionNumber: 'RX-REJECTED-001', status: 'rejected', pharmacistNotes: 'Image is unreadable', verifiedAt: new Date('2026-06-30T05:00:00.000Z') }),
  expired: makePrescription({ _id: prescriptionIds.expired, prescriptionNumber: 'RX-EXPIRED-001', status: 'expired', validUntil: new Date('2026-06-01T00:00:00.000Z') }),
  unmapped: makePrescription({ _id: prescriptionIds.unmapped, prescriptionNumber: 'RX-UNMAPPED-001', medications: [{ productName: 'Unmapped Drug 10mg', dosage: '10mg', quantity: 1, instructions: 'Uong sau an' }] })
}
