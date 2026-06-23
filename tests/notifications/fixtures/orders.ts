import { ObjectId } from 'mongodb'
import { FIXED_NOW, notificationTestUserIds } from './users'

export interface OrderFixture {
  _id: ObjectId
  userId: ObjectId
  orderNumber: string
  orderStatus: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'returned'
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded'
  totalAmount: number
  trackingNumber?: string
  shippingAddress: { email: string; phone: string; address: string }
  items: Array<{ productId: ObjectId; name: string; quantity: number; unitPrice: number }>
  createdAt: Date
  updatedAt: Date
}

export const orderTestIds = {
  defaultOrder: new ObjectId('669000000000000000000001'),
  failedPaymentOrder: new ObjectId('669000000000000000000002'),
  shippedOrder: new ObjectId('669000000000000000000003'),
  productVitaminC: new ObjectId('668000000000000000000001')
} as const

export function makeOrderFixture(overrides: Partial<OrderFixture> = {}): OrderFixture {
  return {
    _id: orderTestIds.defaultOrder,
    userId: notificationTestUserIds.customer,
    orderNumber: 'ORD-TEST-001',
    orderStatus: 'pending',
    paymentStatus: 'pending',
    totalAmount: 250000,
    shippingAddress: {
      email: 'customer.notifications@medispace.test',
      phone: '0900000001',
      address: '01 Vo Van Ngan, Thu Duc, Ho Chi Minh'
    },
    items: [
      {
        productId: orderTestIds.productVitaminC,
        name: 'Vitamin C 1000mg',
        quantity: 2,
        unitPrice: 125000
      }
    ],
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides
  }
}

export const orderFixtures = {
  placed: makeOrderFixture(),
  paymentFailed: makeOrderFixture({
    _id: orderTestIds.failedPaymentOrder,
    orderNumber: 'ORD-TEST-FAILED',
    paymentStatus: 'failed',
    orderStatus: 'cancelled'
  }),
  shipped: makeOrderFixture({
    _id: orderTestIds.shippedOrder,
    orderNumber: 'ORD-TEST-SHIPPED',
    orderStatus: 'shipped',
    paymentStatus: 'paid',
    trackingNumber: 'GHTK-TRACK-001'
  })
} as const

export function makeOrderSeed(overrides: Partial<OrderFixture>[] = []): OrderFixture[] {
  if (overrides.length === 0) return Object.values(orderFixtures).map((order) => makeOrderFixture(order))
  return overrides.map((override) => makeOrderFixture(override))
}
