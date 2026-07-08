import { ObjectId } from 'mongodb'

export type RefundTransactionStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled'
export type RefundProviderCode = 'cod' | 'vnpay' | 'payos' | 'bank_transfer' | 'wallet' | 'manual'
export type RefundMethodCode = 'original' | 'bank_transfer' | 'wallet' | 'manual'

export interface RefundTransactionType {
  _id?: ObjectId
  orderId: ObjectId
  orderNumber: string
  returnRequestId: ObjectId
  returnRequestNumber: string
  paymentTransactionId?: ObjectId
  userId: ObjectId
  provider: RefundProviderCode | string
  refundMethod: RefundMethodCode | string
  amount: number
  currency?: string
  status?: RefundTransactionStatus
  providerRefundId?: string
  providerTransactionId?: string
  adminNote?: string
  failureReason?: string
  requestPayload?: Record<string, unknown>
  responsePayload?: Record<string, unknown>
  processedBy?: ObjectId
  processedAt?: Date
  createdAt?: Date
  updatedAt?: Date
}

export default class RefundTransaction {
  _id?: ObjectId
  orderId: ObjectId
  orderNumber: string
  returnRequestId: ObjectId
  returnRequestNumber: string
  paymentTransactionId?: ObjectId
  userId: ObjectId
  provider: RefundProviderCode | string
  refundMethod: RefundMethodCode | string
  amount: number
  currency: string
  status: RefundTransactionStatus
  providerRefundId?: string
  providerTransactionId?: string
  adminNote?: string
  failureReason?: string
  requestPayload?: Record<string, unknown>
  responsePayload?: Record<string, unknown>
  processedBy?: ObjectId
  processedAt?: Date
  createdAt: Date
  updatedAt: Date

  constructor(transaction: RefundTransactionType) {
    const date = new Date()
    this._id = transaction._id
    this.orderId = transaction.orderId
    this.orderNumber = transaction.orderNumber
    this.returnRequestId = transaction.returnRequestId
    this.returnRequestNumber = transaction.returnRequestNumber
    this.paymentTransactionId = transaction.paymentTransactionId
    this.userId = transaction.userId
    this.provider = transaction.provider
    this.refundMethod = transaction.refundMethod
    this.amount = transaction.amount
    this.currency = transaction.currency || 'VND'
    this.status = transaction.status || 'pending'
    this.providerRefundId = transaction.providerRefundId
    this.providerTransactionId = transaction.providerTransactionId
    this.adminNote = transaction.adminNote
    this.failureReason = transaction.failureReason
    this.requestPayload = transaction.requestPayload
    this.responsePayload = transaction.responsePayload
    this.processedBy = transaction.processedBy
    this.processedAt = transaction.processedAt
    this.createdAt = transaction.createdAt || date
    this.updatedAt = transaction.updatedAt || date
  }
}
