import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'
import { ReturnReason, ReturnStatus, ReturnType } from '~/models/schemas/ReturnRequest.schema'

const mockOrdersFindOne = vi.fn()
const mockOrdersUpdateOne = vi.fn()
const mockReturnFindOne = vi.fn()
const mockReturnInsertOne = vi.fn()
const mockReturnUpdateOne = vi.fn()
const mockRevokePointsForReturn = vi.fn()
const mockRefundRedeemedPointsForOrder = vi.fn()

vi.mock('~/services/database.services', () => ({
  default: {
    orders: {
      findOne: mockOrdersFindOne,
      updateOne: mockOrdersUpdateOne
    },
    returnRequests: {
      findOne: mockReturnFindOne,
      insertOne: mockReturnInsertOne,
      updateOne: mockReturnUpdateOne,
      aggregate: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      countDocuments: vi.fn()
    }
  }
}))

vi.mock('~/services/loyalty.services', () => ({
  default: {
    revokePointsForReturn: mockRevokePointsForReturn,
    refundRedeemedPointsForOrder: mockRefundRedeemedPointsForOrder
  }
}))

vi.mock('~/services/notifications.services', () => ({
  default: {
    notifyNewReturnRequestToAdmin: vi.fn().mockResolvedValue(undefined),
    broadcastToRole: vi.fn().mockResolvedValue(undefined)
  }
}))

vi.mock('~/sockets/chat.socket', () => ({ getIO: vi.fn(() => ({})) }))

const { default: returnRequestService } = await import('~/services/returnRequests.services')

const makeOrder = () => {
  const userId = new ObjectId()
  const productId = new ObjectId()
  return {
    _id: new ObjectId(),
    userId,
    orderNumber: 'ORD-RETURN-1',
    orderStatus: 'delivered',
    paymentStatus: 'paid',
    deliveredAt: new Date(),
    totalAmount: 170000,
    items: [
      {
        productId,
        name: 'Vitamin C',
        image: 'image.jpg',
        sku: 'VC-001',
        unit: 'Hộp',
        quantity: 2,
        unitPrice: 100000,
        totalPrice: 200000,
        discountAllocation: 20000,
        pointsAllocation: 10000,
        prescriptionRequired: false
      }
    ]
  }
}

describe('ReturnRequest allocation handling', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('createReturnRequest tính requestedAmount theo net amount sau coupon/point allocation', async () => {
    const order = makeOrder()
    mockOrdersFindOne
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce(order)
    mockReturnFindOne.mockResolvedValueOnce(null)
    mockReturnInsertOne.mockResolvedValueOnce({ insertedId: new ObjectId() })

    await returnRequestService.createReturnRequest(order.userId, {
      orderId: order._id.toString(),
      items: [
        {
          productId: order.items[0].productId.toString(),
          quantity: 1,
          returnReason: ReturnReason.DEFECTIVE
        }
      ],
      reason: ReturnReason.DEFECTIVE,
      reasonDetail: 'Sản phẩm lỗi',
      evidence: [],
      type: ReturnType.REFUND
    })

    const inserted = mockReturnInsertOne.mock.calls[0][0]
    expect(inserted.requestedAmount).toBe(85000)
    expect(inserted.items[0]).toMatchObject({
      totalPrice: 100000,
      discountAllocation: 10000,
      pointsAllocation: 5000,
      netRefundAmount: 85000
    })
  })

  it('processRefund partial return chỉ revoke điểm theo net returned amount và không set order returned', async () => {
    const order = makeOrder()
    const request = {
      _id: new ObjectId(),
      orderId: order._id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      status: ReturnStatus.RECEIVED,
      items: [
        {
          productId: order.items[0].productId,
          unit: order.items[0].unit,
          quantity: 1
        }
      ]
    }
    mockReturnFindOne.mockResolvedValueOnce(request)
    mockOrdersFindOne
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce(order)

    await returnRequestService.processRefund(request._id, {
      refundedAmount: 85000,
      refundTransactionId: 'RF-1'
    })

    expect(mockRevokePointsForReturn).toHaveBeenCalledWith(
      order.userId,
      order._id,
      85000,
      order.orderNumber
    )
    expect(mockRefundRedeemedPointsForOrder).not.toHaveBeenCalled()
    expect(mockOrdersUpdateOne).toHaveBeenCalledWith(
      { _id: order._id },
      {
        $set: expect.objectContaining({
          paymentStatus: 'partially_refunded'
        })
      }
    )
    expect(mockOrdersUpdateOne.mock.calls[0][1].$set.orderStatus).toBeUndefined()
  })
})
