import { ObjectId } from 'mongodb'

export const customerIds = {
  primary: new ObjectId('650000000000000000000101'),
  secondary: new ObjectId('650000000000000000000102'),
  deleted: new ObjectId('650000000000000000000199')
}

export function makeCustomer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: customerIds.primary,
    email: 'customer.prescription@medispace.test',
    firstName: 'Nguyen',
    lastName: 'Van A',
    phoneNumber: '0900000001',
    role: 0,
    status: 1,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides
  }
}

export const duplicatePhoneCustomers = [
  makeCustomer({ _id: customerIds.primary, email: 'family-a@medispace.test', phoneNumber: '0999999999' }),
  makeCustomer({ _id: customerIds.secondary, email: 'family-b@medispace.test', phoneNumber: '0999999999' })
]
