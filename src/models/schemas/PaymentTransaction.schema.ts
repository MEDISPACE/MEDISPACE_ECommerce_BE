import { ObjectId } from 'mongodb'

export type PaymentTransactionStatus = 'pending' | 'pending_collection' | 'paid' | 'failed' | 'cancelled' | 'expired'
export type PaymentProviderCode = 'cod' | 'vnpay' | 'payos' | 'bank_transfer' | 'manual'

export interface PaymentTransactionType {
  _id?: ObjectId
  orderId: ObjectId
  orderNumber: string
  userId: ObjectId
  provider: PaymentProviderCode | string
  paymentMethod: string
  amount: number
  currency?: string
  status?: PaymentTransactionStatus
  providerOrderCode?: string | number
  providerTransactionId?: string
  providerResponseCode?: string
  providerMessage?: string
  requestPayload?: Record<string, unknown>
  returnPayload?: Record<string, unknown>
  ipnPayload?: Record<string, unknown>
  paidAt?: Date
  failedAt?: Date
  createdAt?: Date
  updatedAt?: Date
}

export default class PaymentTransaction {
  _id?: ObjectId
  orderId: ObjectId
  orderNumber: string
  userId: ObjectId
  provider: PaymentProviderCode | string
  paymentMethod: string
  amount: number
  currency: string
  status: PaymentTransactionStatus
  providerOrderCode?: string | number
  providerTransactionId?: string
  providerResponseCode?: string
  providerMessage?: string
  requestPayload?: Record<string, unknown>
  returnPayload?: Record<string, unknown>
  ipnPayload?: Record<string, unknown>
  paidAt?: Date
  failedAt?: Date
  createdAt: Date
  updatedAt: Date

  constructor(transaction: PaymentTransactionType) {
    const date = new Date()
    this._id = transaction._id
    this.orderId = transaction.orderId
    this.orderNumber = transaction.orderNumber
    this.userId = transaction.userId
    this.provider = transaction.provider
    this.paymentMethod = transaction.paymentMethod
    this.amount = transaction.amount
    this.currency = transaction.currency || 'VND'
    this.status = transaction.status || 'pending'
    this.providerOrderCode = transaction.providerOrderCode
    this.providerTransactionId = transaction.providerTransactionId
    this.providerResponseCode = transaction.providerResponseCode
    this.providerMessage = transaction.providerMessage
    this.requestPayload = transaction.requestPayload
    this.returnPayload = transaction.returnPayload
    this.ipnPayload = transaction.ipnPayload
    this.paidAt = transaction.paidAt
    this.failedAt = transaction.failedAt
    this.createdAt = transaction.createdAt || date
    this.updatedAt = transaction.updatedAt || date
  }
}
