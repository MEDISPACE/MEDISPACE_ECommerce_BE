import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import ReturnRequest, {
  ReturnReason,
  ReturnStatus,
  ReturnType,
  RefundMethod,
  ReturnItem,
  BankInfo
} from '~/models/schemas/ReturnRequest.schema'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'
import { RETURN_REQUESTS_MESSAGES, ORDERS_MESSAGES } from '~/constants/message'
import loyaltyService from './loyalty.services'
import notificationService from './notifications.services'
import { getIO } from '~/sockets/chat.socket'

// Return period in days
const RETURN_PERIOD_OTC = 7 // 7 days for OTC products
const RETURN_PERIOD_RX = 3 // 3 days for prescription products (only for defective/wrong items)

// Allowed reasons for prescription products
const ALLOWED_RX_REASONS = [
  ReturnReason.DEFECTIVE,
  ReturnReason.WRONG_ITEM,
  ReturnReason.EXPIRED,
  ReturnReason.DAMAGED_SHIPPING,
  ReturnReason.WRONG_PRESCRIPTION
]

interface CreateReturnRequestPayload {
  orderId: string
  items: {
    productId: string
    quantity: number
    returnReason: ReturnReason
    reasonDetail?: string
  }[]
  reason: ReturnReason
  reasonDetail: string
  evidence: string[]
  type?: ReturnType
  refundMethod?: RefundMethod
  bankInfo?: BankInfo
}

interface GetReturnRequestsParams {
  page?: number
  limit?: number
  status?: ReturnStatus
  userId?: ObjectId
}

interface ReviewReturnRequestPayload {
  status: 'approved' | 'rejected'
  approvedAmount?: number
  reviewNotes?: string
  rejectionReason?: string
}

interface ReceiveReturnItemsPayload {
  trackingNumber?: string
  carrier?: string
  condition: 'good' | 'damaged' | 'opened' | 'unusable'
  conditionNotes?: string
}

interface ProcessRefundPayload {
  refundedAmount: number
  refundTransactionId?: string
  refundNotes?: string
}

class ReturnRequestService {
  private calculateReturnedItemNetAmount(orderItem: any, returnQuantity: number) {
    const quantityRatio = orderItem.quantity > 0 ? returnQuantity / orderItem.quantity : 0
    const grossAmount = Math.floor((orderItem.unitPrice || 0) * returnQuantity)
    const discountAllocation = Math.floor((orderItem.discountAllocation || 0) * quantityRatio)
    const pointsAllocation = Math.floor((orderItem.pointsAllocation || 0) * quantityRatio)
    const netRefundAmount = Math.max(0, grossAmount - discountAllocation - pointsAllocation)

    return {
      grossAmount,
      discountAllocation,
      pointsAllocation,
      netRefundAmount
    }
  }

  private calculateReturnedOrderAmounts(order: any, returnItems: any[]) {
    return returnItems.reduce(
      (totals, returnItem) => {
        const orderItem = (order.items || []).find((item: any) =>
          item.productId.toString() === returnItem.productId.toString() &&
          item.unit === returnItem.unit
        )
        if (!orderItem) return totals

        const amounts = this.calculateReturnedItemNetAmount(orderItem, returnItem.quantity)
        totals.grossAmount += amounts.grossAmount
        totals.discountAllocation += amounts.discountAllocation
        totals.pointsAllocation += amounts.pointsAllocation
        totals.netRefundAmount += amounts.netRefundAmount
        return totals
      },
      { grossAmount: 0, discountAllocation: 0, pointsAllocation: 0, netRefundAmount: 0 }
    )
  }

  private isFullReturn(order: any, returnItems: any[]) {
    const returnedByLine = new Map<string, number>()
    for (const item of returnItems) {
      returnedByLine.set(`${item.productId.toString()}::${item.unit}`, (returnedByLine.get(`${item.productId.toString()}::${item.unit}`) || 0) + item.quantity)
    }

    return (order.items || []).every((item: any) => {
      const key = `${item.productId.toString()}::${item.unit}`
      return (returnedByLine.get(key) || 0) >= item.quantity
    })
  }

  /**
   * Create a new return request
   */
  async createReturnRequest(userId: ObjectId, payload: CreateReturnRequestPayload) {
    const { orderId, items, reason, reasonDetail, evidence, type, refundMethod, bankInfo } = payload

    // DEBUG: Log the incoming data
    console.log('=== DEBUG createReturnRequest ===')
    console.log('orderId:', orderId)
    console.log('userId:', userId, userId.toString())

    // First, check if order exists at all (without userId filter)
    const orderWithoutUserFilter = await databaseService.orders.findOne({
      _id: new ObjectId(orderId)
    })
    console.log(
      'Order without userId filter:',
      orderWithoutUserFilter
        ? {
            _id: orderWithoutUserFilter._id,
            userId: orderWithoutUserFilter.userId,
            orderStatus: orderWithoutUserFilter.orderStatus
          }
        : 'NOT FOUND'
    )

    // Validate order exists and belongs to user
    // Use $or to match userId as both ObjectId and string (for backwards compatibility)
    const order = await databaseService.orders.findOne({
      _id: new ObjectId(orderId),
      $or: [{ userId: userId }, { userId: userId.toString() as unknown as ObjectId }]
    })
    console.log('Order with userId filter:', order ? 'FOUND' : 'NOT FOUND')
    console.log('=================================')

    if (!order) {
      throw new ErrorWithStatus({
        message: ORDERS_MESSAGES.ORDER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    // Check if order is delivered
    if (order.orderStatus !== 'delivered') {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.ORDER_NOT_DELIVERED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // Check if return request already exists for this order
    const existingRequest = await databaseService.returnRequests.findOne({
      orderId: new ObjectId(orderId),
      status: { $nin: [ReturnStatus.CANCELLED, ReturnStatus.REJECTED] }
    })

    if (existingRequest) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_ALREADY_EXISTS,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // Calculate return deadline
    const deliveredAt = order.deliveredAt || order.updatedAt || order.createdAt
    const daysSinceDelivery = Math.floor((Date.now() - new Date(deliveredAt!).getTime()) / (1000 * 60 * 60 * 24))

    // Build return items with validation
    const returnItems: ReturnItem[] = []
    let totalRequestedAmount = 0
    let hasPrescriptionProduct = false

    for (const item of items) {
      // Find the item in the order
      const orderItem = order.items.find((oi) => oi.productId.toString() === item.productId)

      if (!orderItem) {
        throw new ErrorWithStatus({
          message: RETURN_REQUESTS_MESSAGES.PRODUCT_NOT_IN_ORDER,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }

      // Validate quantity
      if (item.quantity > orderItem.quantity) {
        throw new ErrorWithStatus({
          message: RETURN_REQUESTS_MESSAGES.QUANTITY_EXCEEDS_ORDERED,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }

      // Check if prescription product
      const isPrescriptionProduct = orderItem.prescriptionRequired || false

      if (isPrescriptionProduct) {
        hasPrescriptionProduct = true

        // Check return period for Rx products
        if (daysSinceDelivery > RETURN_PERIOD_RX) {
          throw new ErrorWithStatus({
            message: RETURN_REQUESTS_MESSAGES.RETURN_PERIOD_EXPIRED,
            status: HTTP_STATUS.BAD_REQUEST
          })
        }

        // Check if reason is allowed for Rx products
        if (!ALLOWED_RX_REASONS.includes(item.returnReason)) {
          throw new ErrorWithStatus({
            message: RETURN_REQUESTS_MESSAGES.PRESCRIPTION_PRODUCT_NOT_RETURNABLE,
            status: HTTP_STATUS.BAD_REQUEST
          })
        }
      } else {
        // Check return period for OTC products
        if (daysSinceDelivery > RETURN_PERIOD_OTC) {
          throw new ErrorWithStatus({
            message: RETURN_REQUESTS_MESSAGES.RETURN_PERIOD_EXPIRED,
            status: HTTP_STATUS.BAD_REQUEST
          })
        }
      }

      const returnedAmounts = this.calculateReturnedItemNetAmount(orderItem, item.quantity)
      totalRequestedAmount += returnedAmounts.netRefundAmount

      returnItems.push({
        productId: new ObjectId(item.productId),
        productName: orderItem.name,
        productImage: orderItem.image, // Lấy ảnh sản phẩm từ order
        sku: orderItem.sku,
        unit: orderItem.unit,
        quantity: item.quantity,
        unitPrice: orderItem.unitPrice,
        totalPrice: returnedAmounts.grossAmount,
        discountAllocation: returnedAmounts.discountAllocation,
        pointsAllocation: returnedAmounts.pointsAllocation,
        netRefundAmount: returnedAmounts.netRefundAmount,
        isPrescriptionProduct,
        returnReason: item.returnReason,
        reasonDetail: item.reasonDetail
      })
    }

    // Create return request
    const returnRequest = new ReturnRequest({
      _id: new ObjectId(),
      requestNumber: ReturnRequest.generateRequestNumber(),
      orderId: new ObjectId(orderId),
      orderNumber: order.orderNumber,
      userId,
      items: returnItems,
      reason,
      reasonDetail,
      evidence,
      type: type || ReturnType.REFUND,
      refundMethod,
      bankInfo,
      requestedAmount: totalRequestedAmount,
      status: hasPrescriptionProduct ? ReturnStatus.REVIEWING : ReturnStatus.PENDING
    })

    const result = await databaseService.returnRequests.insertOne(returnRequest)

    // Notify all admins about new return request (fire-and-forget)
    let io
    try { io = getIO() } catch { io = undefined }
    Promise.resolve((notificationService as any).notifyNewReturnRequestToAdmin?.(returnRequest.requestNumber, io)).catch(() => {})

    // Notify all pharmacists about new return request (fire-and-forget)
    Promise.resolve((notificationService as any).notifyNewReturnRequestToPharmacists?.(returnRequest.requestNumber, io)).catch(() => {})

    return {
      ...returnRequest,
      _id: result.insertedId
    }
  }

  /**
   * Get return requests with pagination
   */
  async getReturnRequests(params: GetReturnRequestsParams) {
    const { page = 1, limit = 10, status, userId } = params
    const skip = (page - 1) * limit

    const query: any = {}
    if (status) query.status = status
    if (userId) query.userId = userId

    const [requests, total] = await Promise.all([
      databaseService.returnRequests
        .aggregate([
          { $match: query },
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'users',
              localField: 'userId',
              foreignField: '_id',
              as: 'userInfo'
            }
          },
          {
            $addFields: {
              customerName: {
                $concat: [
                  { $ifNull: [{ $arrayElemAt: ['$userInfo.lastName', 0] }, ''] },
                  ' ',
                  { $ifNull: [{ $arrayElemAt: ['$userInfo.firstName', 0] }, ''] }
                ]
              },
              customerEmail: { $arrayElemAt: ['$userInfo.email', 0] },
              customerPhone: { $arrayElemAt: ['$userInfo.phoneNumber', 0] }
            }
          },
          {
            $project: {
              userInfo: 0 // Remove the full userInfo array
            }
          }
        ])
        .toArray(),
      databaseService.returnRequests.countDocuments(query)
    ])

    return {
      requests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }
  }

  /**
   * Get return request by ID
   */
  async getReturnRequestById(requestId: ObjectId, userId?: ObjectId) {
    const query: any = { _id: requestId }
    if (userId) query.userId = userId

    const request = await databaseService.returnRequests.findOne(query)

    if (!request) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    return request
  }

  /**
   * Cancel return request (by customer)
   */
  async cancelReturnRequest(requestId: ObjectId, userId: ObjectId) {
    const request = await this.getReturnRequestById(requestId, userId)

    if (![ReturnStatus.PENDING, ReturnStatus.REVIEWING].includes(request.status as ReturnStatus)) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_CANNOT_BE_CANCELLED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    await databaseService.returnRequests.updateOne(
      { _id: requestId },
      {
        $set: {
          status: ReturnStatus.CANCELLED,
          updatedAt: new Date()
        }
      }
    )

    return { message: RETURN_REQUESTS_MESSAGES.CANCEL_REQUEST_SUCCESS }
  }

  /**
   * Review return request (by pharmacist/admin)
   */
  async reviewReturnRequest(requestId: ObjectId, reviewerId: ObjectId, payload: ReviewReturnRequestPayload) {
    const request = await databaseService.returnRequests.findOne({ _id: requestId })

    if (!request) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    if (![ReturnStatus.PENDING, ReturnStatus.REVIEWING].includes(request.status as ReturnStatus)) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_ALREADY_PROCESSED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const updateData: any = {
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      reviewNotes: payload.reviewNotes,
      updatedAt: new Date()
    }

    if (payload.status === 'approved') {
      updateData.status = ReturnStatus.APPROVED
      updateData.approvedAmount = payload.approvedAmount || request.requestedAmount
      // Set return deadline (7 days from now)
      updateData.returnDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    } else {
      updateData.status = ReturnStatus.REJECTED
      updateData.rejectionReason = payload.rejectionReason
    }

    await databaseService.returnRequests.updateOne({ _id: requestId }, { $set: updateData })

    const updatedRequest = await databaseService.returnRequests.findOne({ _id: requestId })

    // Notify customer about return request status (fire-and-forget)
    if (request.userId) {
      let io
      try { io = getIO() } catch { io = undefined }
      Promise.resolve((notificationService as any).notifyReturnRequestStatus?.(
        request.userId,
        requestId,
        request.requestNumber,
        payload.status,
        io
      )).catch(() => {})
    }

    return updatedRequest
  }

  /**
   * Update shipping info when customer ships return items
   */
  async updateReturnShipping(requestId: ObjectId, userId: ObjectId, trackingNumber: string, carrier?: string) {
    const request = await this.getReturnRequestById(requestId, userId)

    if (request.status !== ReturnStatus.APPROVED) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_ALREADY_PROCESSED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    await databaseService.returnRequests.updateOne(
      { _id: requestId },
      {
        $set: {
          status: ReturnStatus.AWAITING_RETURN,
          returnShippingInfo: {
            trackingNumber,
            carrier,
            shippedAt: new Date()
          },
          updatedAt: new Date()
        }
      }
    )

    return await databaseService.returnRequests.findOne({ _id: requestId })
  }

  /**
   * Receive return items (by pharmacist/admin)
   */
  async receiveReturnItems(requestId: ObjectId, payload: ReceiveReturnItemsPayload) {
    const request = await databaseService.returnRequests.findOne({ _id: requestId })

    if (!request) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    if (![ReturnStatus.APPROVED, ReturnStatus.AWAITING_RETURN].includes(request.status as ReturnStatus)) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_ALREADY_PROCESSED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    await databaseService.returnRequests.updateOne(
      { _id: requestId },
      {
        $set: {
          status: ReturnStatus.RECEIVED,
          'returnShippingInfo.receivedAt': new Date(),
          'returnShippingInfo.condition': payload.condition,
          'returnShippingInfo.conditionNotes': payload.conditionNotes,
          updatedAt: new Date()
        }
      }
    )

    // Restore stock if items are in good condition
    if (payload.condition === 'good') {
      for (const item of request.items) {
        // Find quantityPerUnit from product
        const product = await databaseService.products.findOne({ _id: new ObjectId(item.productId) })
        if (product) {
          const variant = product.priceVariants?.find((v: any) => v.unit === item.unit)
          const quantityPerUnit = variant?.quantityPerUnit || 1
          const stockToRestore = item.quantity * quantityPerUnit

          await databaseService.products.updateOne(
            { _id: new ObjectId(item.productId) },
            { $inc: { stockQuantity: stockToRestore } }
          )
        }
      }
    }

    return await databaseService.returnRequests.findOne({ _id: requestId })
  }

  /**
   * Process refund (by admin)
   */
  async processRefund(requestId: ObjectId, payload: ProcessRefundPayload) {
    const request = await databaseService.returnRequests.findOne({ _id: requestId })

    if (!request) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

        // Loyalty: thu hồi điểm khi hoàn trả
        try {
            const order = await databaseService.orders.findOne({ _id: request.orderId })
            if (order) {
                const returnedAmounts = this.calculateReturnedOrderAmounts(order, request.items)
                const fullReturn = this.isFullReturn(order, request.items)

                await loyaltyService.revokePointsForReturn(
                    request.userId,
                    request.orderId,
                    returnedAmounts.netRefundAmount,
                    order.orderNumber
                )
                if (fullReturn) {
                    await loyaltyService.refundRedeemedPointsForOrder(
                        request.userId,
                        request.orderId,
                        order.orderNumber
                    )
                }
            }
        } catch (err) {
            console.error('Loyalty revoke points error:', err)
        }

    await databaseService.returnRequests.updateOne(
      { _id: requestId },
      {
        $set: {
          status: ReturnStatus.REFUND_PROCESSING,
          refundedAmount: payload.refundedAmount,
          refundTransactionId: payload.refundTransactionId,
          refundNotes: payload.refundNotes,
          refundedAt: new Date(),
          updatedAt: new Date()
        }
      }
    )

    // Update order payment status
    const order = await databaseService.orders.findOne({ _id: request.orderId })
    const fullReturn = order ? this.isFullReturn(order, request.items) : false
    await databaseService.orders.updateOne(
      { _id: request.orderId },
      {
        $set: {
          paymentStatus: fullReturn ? 'refunded' : 'partially_refunded',
          ...(fullReturn ? { orderStatus: 'returned' } : {}),
          updatedAt: new Date()
        }
      }
    )

    if (order) {
      let io
      try { io = getIO() } catch { io = undefined }
      Promise.resolve((notificationService as any).notifyPaymentStatusChange?.(
          request.userId,
          request.orderId,
          order.orderNumber,
          fullReturn ? 'refunded' : 'partially_refunded',
          io
        )).catch(() => {})
    }

    return await databaseService.returnRequests.findOne({ _id: requestId })
  }

  /**
   * Complete return request
   */
  async completeReturnRequest(requestId: ObjectId) {
    const request = await databaseService.returnRequests.findOne({ _id: requestId })

    if (!request) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    if (request.status !== ReturnStatus.REFUND_PROCESSING) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_ALREADY_PROCESSED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    await databaseService.returnRequests.updateOne(
      { _id: requestId },
      {
        $set: {
          status: ReturnStatus.COMPLETED,
          updatedAt: new Date()
        }
      }
    )

    return await databaseService.returnRequests.findOne({ _id: requestId })
  }

  /**
   * Get return request statistics
   */
  async getReturnRequestStats() {
    const [total, pending, reviewing, approved, rejected, received, completed, totalRefunded] = await Promise.all([
      databaseService.returnRequests.countDocuments({}),
      databaseService.returnRequests.countDocuments({ status: ReturnStatus.PENDING }),
      databaseService.returnRequests.countDocuments({ status: ReturnStatus.REVIEWING }),
      databaseService.returnRequests.countDocuments({ status: ReturnStatus.APPROVED }),
      databaseService.returnRequests.countDocuments({ status: ReturnStatus.REJECTED }),
      databaseService.returnRequests.countDocuments({ status: ReturnStatus.RECEIVED }),
      databaseService.returnRequests.countDocuments({ status: ReturnStatus.COMPLETED }),
      databaseService.returnRequests
        .aggregate([
          { $match: { status: ReturnStatus.COMPLETED } },
          { $group: { _id: null, total: { $sum: '$refundedAmount' } } }
        ])
        .toArray()
    ])

    return {
      total,
      pending,
      reviewing,
      approved,
      rejected,
      received,
      completed,
      totalRefunded: totalRefunded[0]?.total || 0
    }
  }
}

const returnRequestService = new ReturnRequestService()
export default returnRequestService
