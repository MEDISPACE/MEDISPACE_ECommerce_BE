import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import { PaymentTransactionStatus } from '~/models/schemas/PaymentTransaction.schema'
import RefundTransaction, {
  RefundMethodCode,
  RefundTransactionStatus
} from '~/models/schemas/RefundTransaction.schema'

interface EnsurePaymentTransactionPayload {
  order: any
  status?: PaymentTransactionStatus
  requestPayload?: Record<string, unknown>
  providerOrderCode?: string | number
}

interface MarkPaymentPaidPayload {
  order: any
  providerTransactionId?: string
  providerOrderCode?: string | number
  providerResponseCode?: string
  providerMessage?: string
  returnPayload?: Record<string, unknown>
  ipnPayload?: Record<string, unknown>
}

interface CreateRefundPayload {
  request: any
  order: any
  paymentTransaction?: any
  amount: number
  refundMethod: RefundMethodCode | string
  providerTransactionId?: string
  adminNote?: string
  processedBy?: ObjectId
  requestPayload?: Record<string, unknown>
}

class PaymentTransactionService {
  private get paymentTransactions() {
    return databaseService.paymentTransactions
  }

  private get refundTransactions() {
    return databaseService.refundTransactions
  }

  private getProvider(paymentMethod?: string) {
    return paymentMethod || 'manual'
  }

  async ensurePaymentTransaction(payload: EnsurePaymentTransactionPayload) {
    const { order } = payload
    if (!order?._id) return null
    if (!this.paymentTransactions) return null

    const now = new Date()
    const status = payload.status || (order.paymentMethod === 'cod' ? 'pending_collection' : 'pending')
    const update: any = {
      $setOnInsert: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        currency: 'VND',
        status,
        createdAt: now
      },
      $set: {
        updatedAt: now,
        amount: order.totalAmount,
        provider: this.getProvider(order.paymentMethod),
        paymentMethod: order.paymentMethod,
        ...(payload.providerOrderCode !== undefined ? { providerOrderCode: payload.providerOrderCode } : {}),
        ...(payload.requestPayload ? { requestPayload: payload.requestPayload } : {})
      }
    }

    const existing = await this.paymentTransactions.findOneAndUpdate(
      { orderId: order._id, provider: this.getProvider(order.paymentMethod) },
      update,
      { upsert: true, returnDocument: 'after' }
    )

    return existing || this.paymentTransactions.findOne({ orderId: order._id, provider: this.getProvider(order.paymentMethod) })
  }

  async attachPaymentRequest(order: any, payload: { providerOrderCode?: string | number; requestPayload?: Record<string, unknown> }) {
    return this.ensurePaymentTransaction({
      order,
      status: order.paymentMethod === 'cod' ? 'pending_collection' : 'pending',
      providerOrderCode: payload.providerOrderCode,
      requestPayload: payload.requestPayload
    })
  }

  async markPaymentPaid(payload: MarkPaymentPaidPayload) {
    const { order } = payload
    if (!order?._id) return null
    if (!this.paymentTransactions) return null

    await this.ensurePaymentTransaction({ order })
    const now = new Date()
    return this.paymentTransactions.findOneAndUpdate(
      { orderId: order._id, provider: this.getProvider(order.paymentMethod) },
      {
        $set: {
          status: 'paid',
          paidAt: now,
          updatedAt: now,
          amount: order.totalAmount,
          provider: this.getProvider(order.paymentMethod),
          paymentMethod: order.paymentMethod,
          ...(payload.providerTransactionId ? { providerTransactionId: payload.providerTransactionId } : {}),
          ...(payload.providerOrderCode !== undefined ? { providerOrderCode: payload.providerOrderCode } : {}),
          ...(payload.providerResponseCode ? { providerResponseCode: payload.providerResponseCode } : {}),
          ...(payload.providerMessage ? { providerMessage: payload.providerMessage } : {}),
          ...(payload.returnPayload ? { returnPayload: payload.returnPayload } : {}),
          ...(payload.ipnPayload ? { ipnPayload: payload.ipnPayload } : {})
        }
      },
      { returnDocument: 'after' }
    )
  }

  async markPaymentFailed(order: any, payload?: { providerResponseCode?: string; providerMessage?: string; rawPayload?: Record<string, unknown> }) {
    if (!order?._id) return null
    if (!this.paymentTransactions) return null
    await this.ensurePaymentTransaction({ order })
    const now = new Date()
    return this.paymentTransactions.findOneAndUpdate(
      { orderId: order._id, provider: this.getProvider(order.paymentMethod) },
      {
        $set: {
          status: 'failed',
          failedAt: now,
          updatedAt: now,
          ...(payload?.providerResponseCode ? { providerResponseCode: payload.providerResponseCode } : {}),
          ...(payload?.providerMessage ? { providerMessage: payload.providerMessage } : {}),
          ...(payload?.rawPayload ? { returnPayload: payload.rawPayload } : {})
        }
      },
      { returnDocument: 'after' }
    )
  }

  async getPrimaryPaidTransaction(orderId: ObjectId) {
    if (!this.paymentTransactions) return null
    return this.paymentTransactions.findOne({ orderId, status: 'paid' }, { sort: { paidAt: -1, createdAt: -1 } })
  }

  async ensureLegacyPaidTransaction(order: any) {
    const existing = await this.getPrimaryPaidTransaction(order._id)
    if (existing) return existing
    if (order.paymentStatus !== 'paid' && order.paymentStatus !== 'partially_refunded' && order.paymentStatus !== 'refunded') {
      return null
    }
    if (!this.paymentTransactions) {
      return {
        _id: new ObjectId(),
        orderId: order._id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        provider: this.getProvider(order.paymentMethod),
        paymentMethod: order.paymentMethod,
        amount: order.totalAmount,
        status: 'paid'
      }
    }
    return this.markPaymentPaid({
      order,
      providerMessage: 'Legacy transaction generated from paid order status'
    })
  }

  async getSucceededRefundTotal(orderId: ObjectId) {
    if (!this.refundTransactions) return 0
    const result = await this.refundTransactions
      .aggregate([
        { $match: { orderId, status: 'succeeded' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
      .toArray()
    return Number(result[0]?.total || 0)
  }

  async findRefundByReturnRequest(returnRequestId: ObjectId) {
    if (!this.refundTransactions) return null
    return this.refundTransactions.findOne({
      returnRequestId,
      status: { $in: ['pending', 'processing', 'succeeded'] }
    })
  }

  async createSucceededRefund(payload: CreateRefundPayload) {
    const now = new Date()
    if (!this.refundTransactions) {
      return {
        _id: new ObjectId(),
        orderId: payload.order._id,
        orderNumber: payload.order.orderNumber,
        returnRequestId: payload.request._id,
        returnRequestNumber: payload.request.requestNumber,
        paymentTransactionId: payload.paymentTransaction?._id,
        userId: payload.request.userId,
        provider: payload.refundMethod === 'bank_transfer' ? 'bank_transfer' : payload.order.paymentMethod || 'manual',
        refundMethod: payload.refundMethod,
        amount: payload.amount,
        currency: 'VND',
        status: 'succeeded',
        providerTransactionId: payload.providerTransactionId,
        adminNote: payload.adminNote,
        processedBy: payload.processedBy,
        processedAt: now,
        createdAt: now,
        updatedAt: now
      }
    }
    const provider = payload.refundMethod === 'bank_transfer'
      ? 'bank_transfer'
      : payload.refundMethod === 'wallet'
        ? 'wallet'
        : payload.order.paymentMethod || 'manual'

    const refund = new RefundTransaction({
      orderId: payload.order._id,
      orderNumber: payload.order.orderNumber,
      returnRequestId: payload.request._id,
      returnRequestNumber: payload.request.requestNumber,
      paymentTransactionId: payload.paymentTransaction?._id,
      userId: payload.request.userId,
      provider,
      refundMethod: payload.refundMethod,
      amount: payload.amount,
      status: 'succeeded',
      providerTransactionId: payload.providerTransactionId,
      adminNote: payload.adminNote,
      requestPayload: payload.requestPayload,
      processedBy: payload.processedBy,
      processedAt: now,
      createdAt: now,
      updatedAt: now
    })

    try {
      const result = await this.refundTransactions.insertOne(refund)
      return { ...refund, _id: result.insertedId }
    } catch (error: any) {
      if (error?.code === 11000) {
        return this.findRefundByReturnRequest(payload.request._id)
      }
      throw error
    }
  }

  async getTransactionsForReturnRequest(request: any) {
    let paymentTransaction = request?.orderId ? await this.getPrimaryPaidTransaction(request.orderId) : null

    if (!paymentTransaction && request?.orderId) {
      const order = await databaseService.orders.findOne({ _id: request.orderId })
      paymentTransaction = order ? await this.ensureLegacyPaidTransaction(order) : null
    }

    const refundTransactions = request?._id && this.refundTransactions
      ? await this.refundTransactions.find({ returnRequestId: request._id }).sort({ createdAt: -1 }).toArray()
      : []

    return { paymentTransaction, refundTransactions }
  }
}

const paymentTransactionService = new PaymentTransactionService()
export default paymentTransactionService
