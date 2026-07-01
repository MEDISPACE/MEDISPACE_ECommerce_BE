import { ObjectId } from 'mongodb'

export const pharmacistIds = {
  licensedOnline: new ObjectId('650000000000000000000201'),
  licensedSecond: new ObjectId('650000000000000000000202'),
  unlicensed: new ObjectId('650000000000000000000203'),
  offline: new ObjectId('650000000000000000000204'),
  customerRole: new ObjectId('650000000000000000000205')
}

export function makePharmacist(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: pharmacistIds.licensedOnline,
    email: 'pharmacist.prescriptions@medispace.test',
    firstName: 'QA',
    lastName: 'Pharmacist',
    role: 1,
    status: 1,
    lisenseNumber: 'LIC-12345',
    isOnline: true,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides
  }
}

export const pharmacistFixtures = {
  licensedOnline: makePharmacist(),
  licensedSecond: makePharmacist({ _id: pharmacistIds.licensedSecond, email: 'second.pharmacist@medispace.test' }),
  unlicensed: makePharmacist({ _id: pharmacistIds.unlicensed, email: 'no-license@medispace.test', lisenseNumber: '' }),
  offline: makePharmacist({ _id: pharmacistIds.offline, email: 'offline@medispace.test', isOnline: false }),
  customerRole: makePharmacist({ _id: pharmacistIds.customerRole, email: 'not-pharmacist@medispace.test', role: 0 })
}
