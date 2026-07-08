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
import paymentTransactionService from './paymentTransactions.services'

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
    unit: string
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
  search?: string
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

interface ArrangeReturnShippingPayload {
  carrier?: string
  notes?: string
}

type ReturnTrackingStatus = 'arranged' | 'picked_up' | 'in_transit' | 'delivered_to_store' | 'failed' | 'cancelled'
type OrderReturnStatus =
  | 'requested'
  | 'approved'
  | 'awaiting_return'
  | 'received'
  | 'refund_processing'
  | 'completed'
  | 'rejected'
  | 'cancelled'

interface UpdateMockReturnTrackingPayload {
  status: ReturnTrackingStatus
  message?: string
  location?: string
}

interface ProcessRefundPayload {
  refundedAmount: number
  refundTransactionId?: string
  refundNotes?: string
  processedBy?: ObjectId
}

class ReturnRequestService {
  private readonly activeReturnStatuses = [
    ReturnStatus.PENDING,
    ReturnStatus.REVIEWING,
    ReturnStatus.APPROVED,
    ReturnStatus.AWAITING_RETURN,
    ReturnStatus.RECEIVED,
    ReturnStatus.REFUND_PROCESSING
  ]

  private mapReturnStatusToOrderStatus(status: ReturnStatus | string): OrderReturnStatus {
    const statusMap: Record<string, OrderReturnStatus> = {
      [ReturnStatus.PENDING]: 'requested',
      [ReturnStatus.REVIEWING]: 'requested',
      [ReturnStatus.APPROVED]: 'approved',
      [ReturnStatus.AWAITING_RETURN]: 'awaiting_return',
      [ReturnStatus.RECEIVED]: 'received',
      [ReturnStatus.REFUND_PROCESSING]: 'refund_processing',
      [ReturnStatus.COMPLETED]: 'completed',
      [ReturnStatus.REJECTED]: 'rejected',
      [ReturnStatus.CANCELLED]: 'cancelled'
    }
    return statusMap[status] || 'requested'
  }

  private async updateOrderReturnStatus(orderId: ObjectId | undefined, requestId: ObjectId, status: OrderReturnStatus) {
    if (!orderId) return
    const now = new Date()
    await databaseService.orders.updateOne(
      { _id: orderId },
      {
        $set: {
          returnStatus: status,
          latestReturnRequestId: requestId,
          returnUpdatedAt: now,
          updatedAt: now
        },
        $addToSet: {
          returnRequestIds: requestId
        }
      }
    )
  }

  private async syncOrderReturnStatusAfterTerminalRequest(
    orderId: ObjectId | undefined,
    requestId: ObjectId,
    terminalStatus: OrderReturnStatus
  ) {
    if (!orderId) return

    const activeRequest = await databaseService.returnRequests.findOne({
      orderId,
      _id: { $ne: requestId },
      status: { $in: this.activeReturnStatuses }
    })

    const nextStatus = activeRequest ? this.mapReturnStatusToOrderStatus(activeRequest.status) : terminalStatus
    const latestRequestId = activeRequest?._id || requestId
    await this.updateOrderReturnStatus(orderId, latestRequestId, nextStatus)
  }

  private getDefaultReturnCarrier() {
    return (process.env.RETURN_SHIPPING_PROVIDER || 'mock_carrier').trim() || 'mock_carrier'
  }

  private isMockReturnCarrier(carrier?: string) {
    return (carrier || '').trim().toLowerCase() === 'mock_carrier'
  }

  private generateMockCarrierTrackingCode(requestId: ObjectId) {
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0')
    return `MOCK-RET-${requestId.toHexString().slice(-8).toUpperCase()}-${random}`
  }

  private getMockTrackingUrl(requestId: ObjectId) {
    const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URLS?.split(',')[0]?.trim()
    return clientUrl ? `${clientUrl.replace(/\/$/, '')}/account/returns/${requestId.toString()}` : undefined
  }

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

  /**
   * Create a new return request
   */
  async createReturnRequest(userId: ObjectId, payload: CreateReturnRequestPayload) {
    const { orderId, items, reason, reasonDetail, evidence, type, refundMethod, bankInfo } = payload
    const orderObjectId = new ObjectId(orderId)

    if (type && type !== ReturnType.REFUND) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.TYPE_INVALID,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // Validate order exists and belongs to user
    // Use $or to match userId as both ObjectId and string (for backwards compatibility)
    const order = await databaseService.orders.findOne({
      _id: orderObjectId,
      $or: [{ userId: userId }, { userId: userId.toString() as unknown as ObjectId }]
    })

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

    const previousReturnContext = await this.getPreviousReturnContext(orderObjectId)
    const previouslyReturnedByLine = previousReturnContext.returnedByLine
    const requestedByLine = new Map<string, number>()

    // Calculate return deadline
    const deliveredAt = order.deliveredAt || order.updatedAt || order.createdAt
    const daysSinceDelivery = Math.floor((Date.now() - new Date(deliveredAt!).getTime()) / (1000 * 60 * 60 * 24))

    // Build return items with validation
    const returnItems: ReturnItem[] = []
    let totalRequestedAmount = 0
    let hasPrescriptionProduct = false

    for (const item of items) {
      // Find the item in the order
      const orderItem = order.items.find((oi) => oi.productId.toString() === item.productId && oi.unit === item.unit)

      if (!orderItem) {
        throw new ErrorWithStatus({
          message: RETURN_REQUESTS_MESSAGES.PRODUCT_NOT_IN_ORDER,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }

      // Validate quantity
      const lineKey = this.getReturnLineKey(orderItem.productId, orderItem.unit)
      const quantityAlreadyRequested = previouslyReturnedByLine.get(lineKey) || 0
      const quantityInThisRequest = (requestedByLine.get(lineKey) || 0) + item.quantity
      requestedByLine.set(lineKey, quantityInThisRequest)

      if (quantityAlreadyRequested + quantityInThisRequest > orderItem.quantity) {
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
    const combinedReturnedByLine = new Map(previouslyReturnedByLine)
    for (const returnItem of returnItems) {
      const key = this.getReturnLineKey(returnItem.productId, returnItem.unit)
      combinedReturnedByLine.set(key, (combinedReturnedByLine.get(key) || 0) + returnItem.quantity)
    }

    const isFullOrderReturn = (order.items || []).every((orderItem: any) => {
      const key = this.getReturnLineKey(orderItem.productId, orderItem.unit)
      return (combinedReturnedByLine.get(key) || 0) >= orderItem.quantity
    })

    if (isFullOrderReturn) {
      const remainingPaidAmount = Math.max(0, Number(order.totalAmount || 0) - previousReturnContext.requestedAmount)
      totalRequestedAmount = Math.max(totalRequestedAmount, remainingPaidAmount)
    }

    const returnRequest = new ReturnRequest({
      _id: new ObjectId(),
      requestNumber: ReturnRequest.generateRequestNumber(),
      orderId: orderObjectId,
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
    await this.updateOrderReturnStatus(orderObjectId, result.insertedId, 'requested')

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
    const { page = 1, limit = 10, status, userId, search } = params
    const skip = (page - 1) * limit

    const query: any = {}
    if (status) query.status = status
    if (userId) query.userId = userId
    if (search?.trim()) {
      const searchRegex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      query.$or = [{ requestNumber: searchRegex }, { orderNumber: searchRegex }]
    }

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

    const updatedRequest = await databaseService.returnRequests.findOneAndUpdate(
      { _id: requestId, status: { $in: [ReturnStatus.PENDING, ReturnStatus.REVIEWING] } },
      {
        $set: {
          status: ReturnStatus.CANCELLED,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    )

    if (!updatedRequest) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_ALREADY_PROCESSED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    await this.syncOrderReturnStatusAfterTerminalRequest(request.orderId, requestId, 'cancelled')

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
      const approvedAmount = payload.approvedAmount ?? request.requestedAmount
      if (!Number.isFinite(approvedAmount) || approvedAmount <= 0 || approvedAmount > request.requestedAmount) {
        throw new ErrorWithStatus({
          message: RETURN_REQUESTS_MESSAGES.AMOUNT_INVALID,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
      updateData.status = ReturnStatus.APPROVED
      updateData.approvedAmount = approvedAmount
      // Set return deadline (7 days from now)
      updateData.returnDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    } else {
      if (!payload.rejectionReason?.trim()) {
        throw new ErrorWithStatus({
          message: RETURN_REQUESTS_MESSAGES.REJECTION_REASON_REQUIRED,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
      updateData.status = ReturnStatus.REJECTED
      updateData.rejectionReason = payload.rejectionReason.trim()
    }

    const updatedRequest = await databaseService.returnRequests.findOneAndUpdate(
      { _id: requestId, status: { $in: [ReturnStatus.PENDING, ReturnStatus.REVIEWING] } },
      { $set: updateData },
      { returnDocument: 'after' }
    )

    if (!updatedRequest) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_ALREADY_PROCESSED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (updatedRequest.status === ReturnStatus.REJECTED) {
      await this.syncOrderReturnStatusAfterTerminalRequest(updatedRequest.orderId, requestId, 'rejected')
    } else {
      await this.updateOrderReturnStatus(updatedRequest.orderId, requestId, 'approved')
    }

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
   * Arrange return pickup/shipping (by pharmacist/admin).
   * Tracking number is generated by MEDISPACE, not entered by customer or staff.
   */
  async arrangeReturnShipping(requestId: ObjectId, staffId: ObjectId, payload: ArrangeReturnShippingPayload) {
    const request = await databaseService.returnRequests.findOne({ _id: requestId })

    if ((payload as any).trackingNumber !== undefined) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.TRACKING_NUMBER_NOT_ALLOWED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (!request) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    if (request.status !== ReturnStatus.APPROVED) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_ALREADY_PROCESSED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (this.isReturnDeadlinePassed(request.returnDeadline)) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.RETURN_DEADLINE_PASSED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const trackingNumber = ReturnRequest.generateReturnTrackingNumber()
    const carrier = payload.carrier?.trim() || this.getDefaultReturnCarrier()
    const isMockCarrier = this.isMockReturnCarrier(carrier)
    const now = new Date()

    const updatedRequest = await databaseService.returnRequests.findOneAndUpdate(
      { _id: requestId, status: ReturnStatus.APPROVED },
      {
        $set: {
          status: ReturnStatus.AWAITING_RETURN,
          returnShippingInfo: {
            trackingNumber,
            carrier,
            ...(isMockCarrier
              ? {
                  carrierTrackingCode: this.generateMockCarrierTrackingCode(requestId),
                  trackingUrl: this.getMockTrackingUrl(requestId)
                }
              : {}),
            trackingStatus: 'arranged',
            trackingEvents: [
              {
                status: 'arranged',
                message: 'MEDISPACE đã sắp xếp thu hồi hàng trả',
                occurredAt: now
              }
            ],
            shippedAt: now,
            arrangedAt: now,
            arrangedBy: staffId,
            pickupNotes: payload.notes?.trim()
          },
          updatedAt: now
        }
      },
      { returnDocument: 'after' }
    )

    if (!updatedRequest) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_ALREADY_PROCESSED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    await this.updateOrderReturnStatus(updatedRequest.orderId, requestId, 'awaiting_return')

    return updatedRequest
  }

  async getReturnTracking(requestId: ObjectId, userId?: ObjectId) {
    const request = await this.getReturnRequestById(requestId, userId)
    return {
      requestId: request._id,
      requestNumber: request.requestNumber,
      orderId: request.orderId,
      orderNumber: request.orderNumber,
      status: request.status,
      returnShippingInfo: request.returnShippingInfo || null
    }
  }

  async getReturnRequestFinancials(requestId: ObjectId) {
    const request = await this.getReturnRequestById(requestId)
    const financials = await paymentTransactionService.getTransactionsForReturnRequest(request)
    return {
      request,
      ...financials
    }
  }

  async updateMockReturnTracking(requestId: ObjectId, staffId: ObjectId, payload: UpdateMockReturnTrackingPayload) {
    const request = await databaseService.returnRequests.findOne({ _id: requestId })

    if (!request) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    if (!request.returnShippingInfo?.trackingNumber) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.RETURN_SHIPMENT_NOT_ARRANGED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (!this.isMockReturnCarrier(request.returnShippingInfo.carrier)) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.TRACKING_PROVIDER_NOT_MOCK,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const now = new Date()
    const updatedRequest = await databaseService.returnRequests.findOneAndUpdate(
      { _id: requestId, 'returnShippingInfo.carrier': 'mock_carrier' },
      {
        $set: {
          'returnShippingInfo.trackingStatus': payload.status,
          updatedAt: now
        },
        $push: {
          'returnShippingInfo.trackingEvents': {
            status: payload.status,
            message: payload.message?.trim() || this.getMockTrackingMessage(payload.status),
            location: payload.location?.trim(),
            occurredAt: now,
            updatedBy: staffId
          }
        }
      },
      { returnDocument: 'after' }
    )

    if (!updatedRequest) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_ALREADY_PROCESSED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    return updatedRequest
  }

  private getMockTrackingMessage(status: ReturnTrackingStatus) {
    const messages: Record<ReturnTrackingStatus, string> = {
      arranged: 'MEDISPACE đã sắp xếp thu hồi hàng trả',
      picked_up: 'Đã lấy hàng trả từ khách',
      in_transit: 'Hàng trả đang vận chuyển về MEDISPACE',
      delivered_to_store: 'Hàng trả đã về MEDISPACE',
      failed: 'Thu hồi hàng trả chưa thành công, cần xử lý lại',
      cancelled: 'Đã hủy lịch thu hồi hàng trả'
    }
    return messages[status]
  }

  private getReturnLineKey(productId: ObjectId | string, unit: string) {
    return `${productId.toString()}::${unit}`
  }

  private buildReturnedQuantities(requests: any[]) {
    const returnedByLine = new Map<string, number>()
    for (const request of requests) {
      for (const item of request.items || []) {
        const key = this.getReturnLineKey(item.productId, item.unit)
        returnedByLine.set(key, (returnedByLine.get(key) || 0) + item.quantity)
      }
    }
    return returnedByLine
  }

  private async getPreviousReturnContext(orderId: ObjectId, statuses?: ReturnStatus[]) {
    const requests = await databaseService.returnRequests
      .find({
        orderId,
        status: statuses?.length
          ? { $in: statuses }
          : { $nin: [ReturnStatus.CANCELLED, ReturnStatus.REJECTED] }
      })
      .toArray()

    return {
      requests,
      returnedByLine: this.buildReturnedQuantities(requests),
      requestedAmount: requests.reduce((sum, request) => sum + Number(request.requestedAmount || 0), 0)
    }
  }

  private async getPreviouslyReturnedQuantities(orderId: ObjectId, statuses?: ReturnStatus[]) {
    const context = await this.getPreviousReturnContext(orderId, statuses)
    return context.returnedByLine
  }

  private async isOrderFullyReturned(order: any) {
    const returnedByLine = await this.getPreviouslyReturnedQuantities(order._id, [
      ReturnStatus.REFUND_PROCESSING,
      ReturnStatus.COMPLETED
    ])

    return (order.items || []).every((item: any) => {
      const key = this.getReturnLineKey(item.productId, item.unit)
      return (returnedByLine.get(key) || 0) >= item.quantity
    })
  }

  private isReturnDeadlinePassed(returnDeadline?: Date) {
    return !!returnDeadline && new Date(returnDeadline).getTime() < Date.now()
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

    if (request.status !== ReturnStatus.AWAITING_RETURN) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_ALREADY_PROCESSED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (!request.returnShippingInfo?.trackingNumber) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.RETURN_SHIPMENT_NOT_ARRANGED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const receivedAt = new Date()
    const updatedRequest = await databaseService.returnRequests.findOneAndUpdate(
      { _id: requestId, status: ReturnStatus.AWAITING_RETURN },
      {
        $set: {
          status: ReturnStatus.RECEIVED,
          'returnShippingInfo.receivedAt': receivedAt,
          'returnShippingInfo.trackingStatus': 'delivered_to_store',
          'returnShippingInfo.condition': payload.condition,
          'returnShippingInfo.conditionNotes': payload.conditionNotes,
          updatedAt: receivedAt
        },
        $push: {
          'returnShippingInfo.trackingEvents': {
            status: 'delivered_to_store',
            message: 'MEDISPACE đã nhận hàng trả',
            occurredAt: receivedAt
          }
        }
      },
      { returnDocument: 'after' }
    )

    if (!updatedRequest) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_ALREADY_PROCESSED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    await this.updateOrderReturnStatus(updatedRequest.orderId, requestId, 'received')

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

    return updatedRequest
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

    if (request.status !== ReturnStatus.RECEIVED) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_ALREADY_PROCESSED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const approvedAmount = Number(request.approvedAmount || 0)
    const refundedAmount = Number(payload.refundedAmount)
    if (!Number.isFinite(approvedAmount) || approvedAmount <= 0 || !Number.isFinite(refundedAmount) || refundedAmount <= 0 || refundedAmount > approvedAmount) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.AMOUNT_INVALID,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const order = await databaseService.orders.findOne({ _id: request.orderId })
    if (!order) {
      throw new ErrorWithStatus({
        message: ORDERS_MESSAGES.ORDER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    const existingRefund = await paymentTransactionService.findRefundByReturnRequest(requestId)
    if (existingRefund) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REFUND_ALREADY_PROCESSED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const paymentTransaction = await paymentTransactionService.ensureLegacyPaidTransaction(order)
    if (!paymentTransaction) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.AMOUNT_INVALID,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const refundedBefore = await paymentTransactionService.getSucceededRefundTotal(order._id)
    if (refundedBefore + refundedAmount > Number(paymentTransaction.amount || order.totalAmount || 0)) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.AMOUNT_INVALID,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const claimedRequest = await databaseService.returnRequests.findOneAndUpdate(
      { _id: requestId, status: ReturnStatus.RECEIVED },
      {
        $set: {
          status: ReturnStatus.REFUND_PROCESSING,
          refundedAmount,
          refundTransactionId: payload.refundTransactionId,
          refundNotes: payload.refundNotes,
          refundedAt: new Date(),
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    )

    if (!claimedRequest) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_ALREADY_PROCESSED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const refundTransaction = await paymentTransactionService.createSucceededRefund({
      request,
      order,
      paymentTransaction,
      amount: refundedAmount,
      refundMethod: request.refundMethod || 'original',
      providerTransactionId: payload.refundTransactionId,
      adminNote: payload.refundNotes,
      processedBy: payload.processedBy,
      requestPayload: {
        refundTransactionId: payload.refundTransactionId,
        refundNotes: payload.refundNotes
      }
    })

    await databaseService.returnRequests.updateOne(
      { _id: requestId },
      {
        $set: {
          refundLedgerId: refundTransaction?._id,
          refundTransactionId: payload.refundTransactionId || refundTransaction?._id?.toString(),
          updatedAt: new Date()
        }
      }
    )

        // Loyalty: thu hồi điểm khi hoàn trả
        try {
            if (order) {
                const returnedAmounts = this.calculateReturnedOrderAmounts(order, request.items)
                const fullReturn = await this.isOrderFullyReturned(order)

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

    // Update order payment status
    const fullReturn = order ? await this.isOrderFullyReturned(order) : false
    await databaseService.orders.updateOne(
      { _id: request.orderId },
      {
        $set: {
          paymentStatus: fullReturn ? 'refunded' : 'partially_refunded',
          returnStatus: 'refund_processing',
          latestReturnRequestId: requestId,
          returnUpdatedAt: new Date(),
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

    const updatedRequest = await databaseService.returnRequests.findOneAndUpdate(
      { _id: requestId, status: ReturnStatus.REFUND_PROCESSING },
      {
        $set: {
          status: ReturnStatus.COMPLETED,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    )

    if (!updatedRequest) {
      throw new ErrorWithStatus({
        message: RETURN_REQUESTS_MESSAGES.REQUEST_ALREADY_PROCESSED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    await this.syncOrderReturnStatusAfterTerminalRequest(updatedRequest.orderId, requestId, 'completed')

    return updatedRequest
  }

  /**
   * Get return request statistics
   */
  async getReturnRequestStats() {
    const [
      total,
      pending,
      reviewing,
      approved,
      awaitingReturn,
      rejected,
      received,
      refundProcessing,
      completed,
      totalRefunded
    ] = await Promise.all([
      databaseService.returnRequests.countDocuments({}),
      databaseService.returnRequests.countDocuments({ status: ReturnStatus.PENDING }),
      databaseService.returnRequests.countDocuments({ status: ReturnStatus.REVIEWING }),
      databaseService.returnRequests.countDocuments({ status: ReturnStatus.APPROVED }),
      databaseService.returnRequests.countDocuments({ status: ReturnStatus.AWAITING_RETURN }),
      databaseService.returnRequests.countDocuments({ status: ReturnStatus.REJECTED }),
      databaseService.returnRequests.countDocuments({ status: ReturnStatus.RECEIVED }),
      databaseService.returnRequests.countDocuments({ status: ReturnStatus.REFUND_PROCESSING }),
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
      awaitingReturn,
      rejected,
      received,
      refundProcessing,
      completed,
      totalRefunded: totalRefunded[0]?.total || 0
    }
  }
}

const returnRequestService = new ReturnRequestService()
export default returnRequestService
