import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'
import { ReturnReason, ReturnStatus, ReturnType } from '~/models/schemas/ReturnRequest.schema'

const mockOrdersFindOne = vi.fn()
const mockOrdersUpdateOne = vi.fn()
const mockReturnFindOne = vi.fn()
const mockReturnFindOneAndUpdate = vi.fn()
const mockReturnInsertOne = vi.fn()
const mockReturnUpdateOne = vi.fn()
const mockReturnFind = vi.fn()
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
      find: mockReturnFind,
      findOneAndUpdate: mockReturnFindOneAndUpdate,
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
    mockReturnFind.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) })
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
          unit: order.items[0].unit,
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

  it('createReturnRequest full return tính requestedAmount theo tổng thanh toán còn lại', async () => {
    const order = makeOrder()
    order.totalAmount = 185000
    mockOrdersFindOne.mockResolvedValueOnce(order)
    mockReturnFind.mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([]) })
    mockReturnInsertOne.mockResolvedValueOnce({ insertedId: new ObjectId() })

    await returnRequestService.createReturnRequest(order.userId, {
      orderId: order._id.toString(),
      items: [
        {
          productId: order.items[0].productId.toString(),
          unit: order.items[0].unit,
          quantity: 2,
          returnReason: ReturnReason.DEFECTIVE
        }
      ],
      reason: ReturnReason.DEFECTIVE,
      reasonDetail: 'Trả toàn bộ đơn hàng',
      evidence: [],
      type: ReturnType.REFUND
    })

    const inserted = mockReturnInsertOne.mock.calls[0][0]
    expect(inserted.requestedAmount).toBe(185000)
    expect(inserted.items[0].netRefundAmount).toBe(170000)
  })

  it('processRefund partial return chỉ revoke điểm theo net returned amount và không set order returned', async () => {
    const order = makeOrder()
    const request = {
      _id: new ObjectId(),
      orderId: order._id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      status: ReturnStatus.RECEIVED,
      approvedAmount: 85000,
      items: [
        {
          productId: order.items[0].productId,
          unit: order.items[0].unit,
          quantity: 1
        }
      ]
    }
    mockReturnFindOne.mockResolvedValueOnce(request)
    mockReturnFindOneAndUpdate.mockResolvedValueOnce({ ...request, status: ReturnStatus.REFUND_PROCESSING, refundedAmount: 85000 })
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

  it('createReturnRequest chặn trả vượt số lượng còn lại theo productId + unit', async () => {
    const order = makeOrder()
    mockOrdersFindOne.mockResolvedValueOnce(order)
    mockReturnFind.mockReturnValueOnce({
      toArray: vi.fn().mockResolvedValue([
        {
          status: ReturnStatus.APPROVED,
          items: [
            {
              productId: order.items[0].productId,
              unit: order.items[0].unit,
              quantity: 1
            }
          ]
        }
      ])
    })

    await expect(
      returnRequestService.createReturnRequest(order.userId, {
        orderId: order._id.toString(),
        items: [
          {
            productId: order.items[0].productId.toString(),
            unit: order.items[0].unit,
            quantity: 2,
            returnReason: ReturnReason.DEFECTIVE
          }
        ],
        reason: ReturnReason.DEFECTIVE,
        reasonDetail: 'Sản phẩm lỗi',
        evidence: [],
        type: ReturnType.REFUND
      })
    ).rejects.toMatchObject({ status: 400 })

    expect(mockReturnInsertOne).not.toHaveBeenCalled()
  })

  it('cancelReturnRequest cho phép khách hủy yêu cầu pending/reviewing', async () => {
    const userId = new ObjectId()
    const request = {
      _id: new ObjectId(),
      userId,
      status: ReturnStatus.PENDING
    }
    mockReturnFindOne.mockResolvedValueOnce(request)
    mockReturnFindOneAndUpdate.mockResolvedValueOnce({ ...request, status: ReturnStatus.CANCELLED })

    await expect(returnRequestService.cancelReturnRequest(request._id, userId)).resolves.toMatchObject({
      message: expect.any(String)
    })

    expect(mockReturnFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: request._id, status: { $in: [ReturnStatus.PENDING, ReturnStatus.REVIEWING] } },
      expect.any(Object),
      { returnDocument: 'after' }
    )
  })

  it('processRefund nhan dien full return theo tong cac yeu cau tra tung phan', async () => {
    const order = makeOrder()
    const request = {
      _id: new ObjectId(),
      orderId: order._id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      status: ReturnStatus.RECEIVED,
      approvedAmount: 85000,
      items: [
        {
          productId: order.items[0].productId,
          unit: order.items[0].unit,
          quantity: 1
        }
      ]
    }
    mockReturnFindOne.mockResolvedValueOnce(request)
    mockReturnFindOneAndUpdate.mockResolvedValueOnce({ ...request, status: ReturnStatus.REFUND_PROCESSING, refundedAmount: 85000 })
    mockOrdersFindOne.mockResolvedValue(order)
    mockReturnFind.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          status: ReturnStatus.COMPLETED,
          items: [
            {
              productId: order.items[0].productId,
              unit: order.items[0].unit,
              quantity: 1
            }
          ]
        },
        { ...request, status: ReturnStatus.REFUND_PROCESSING }
      ])
    })
    mockReturnFindOne.mockResolvedValueOnce({ ...request, status: ReturnStatus.REFUND_PROCESSING, refundedAmount: 85000 })

    await returnRequestService.processRefund(request._id, {
      refundedAmount: 85000,
      refundTransactionId: 'RF-2'
    })

    expect(mockRefundRedeemedPointsForOrder).toHaveBeenCalledWith(order.userId, order._id, order.orderNumber)
    expect(mockOrdersUpdateOne).toHaveBeenCalledWith(
      { _id: order._id },
      {
        $set: expect.objectContaining({
          paymentStatus: 'refunded',
          orderStatus: 'returned'
        })
      }
    )
  })

  it('createReturnRequest tu choi loai exchange khi backend chua co workflow doi hang', async () => {
    const order = makeOrder()

    await expect(
      returnRequestService.createReturnRequest(order.userId, {
        orderId: order._id.toString(),
        items: [
          {
            productId: order.items[0].productId.toString(),
            unit: order.items[0].unit,
            quantity: 1,
            returnReason: ReturnReason.DEFECTIVE
          }
        ],
        reason: ReturnReason.DEFECTIVE,
        reasonDetail: 'San pham loi',
        evidence: [],
        type: ReturnType.EXCHANGE
      })
    ).rejects.toMatchObject({ status: 400 })

    expect(mockOrdersFindOne).not.toHaveBeenCalled()
  })

  it('arrangeReturnShipping tu sinh ma van don thu hoi va chuyen sang awaiting_return', async () => {
    const staffId = new ObjectId()
    const request = {
      _id: new ObjectId(),
      status: ReturnStatus.APPROVED,
      returnDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
    mockReturnFindOne.mockResolvedValueOnce(request)
    mockReturnFindOneAndUpdate.mockResolvedValueOnce({
      ...request,
      status: ReturnStatus.AWAITING_RETURN,
      returnShippingInfo: {
        trackingNumber: 'RSH-1',
        carrier: 'MEDISPACE_RETURN',
        arrangedBy: staffId
      }
    })

    await expect(returnRequestService.arrangeReturnShipping(request._id, staffId, {})).resolves.toMatchObject({
      status: ReturnStatus.AWAITING_RETURN
    })

    const updatePayload = mockReturnFindOneAndUpdate.mock.calls[0][1]
    expect(mockReturnFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: request._id, status: ReturnStatus.APPROVED },
      expect.any(Object),
      { returnDocument: 'after' }
    )
    expect(updatePayload.$set.returnShippingInfo.trackingNumber).toMatch(/^RSH-\d+-\d{3}$/)
    expect(updatePayload.$set.returnShippingInfo.carrier).toBe('mock_carrier')
    expect(updatePayload.$set.returnShippingInfo.carrierTrackingCode).toMatch(/^MOCK-RET-/)
    expect(updatePayload.$set.returnShippingInfo.trackingStatus).toBe('arranged')
    expect(updatePayload.$set.returnShippingInfo.trackingEvents[0].status).toBe('arranged')
    expect(updatePayload.$set.returnShippingInfo.arrangedBy).toBe(staffId)
  })

  it('updateMockReturnTracking cap nhat timeline cho mock_carrier', async () => {
    const staffId = new ObjectId()
    const request = {
      _id: new ObjectId(),
      status: ReturnStatus.AWAITING_RETURN,
      returnShippingInfo: {
        trackingNumber: 'RSH-1',
        carrier: 'mock_carrier',
        carrierTrackingCode: 'MOCK-RET-1'
      }
    }
    mockReturnFindOne.mockResolvedValueOnce(request)
    mockReturnFindOneAndUpdate.mockResolvedValueOnce({
      ...request,
      returnShippingInfo: {
        ...request.returnShippingInfo,
        trackingStatus: 'picked_up'
      }
    })

    await expect(
      returnRequestService.updateMockReturnTracking(request._id, staffId, {
        status: 'picked_up',
        message: 'Da lay hang tu khach',
        location: 'TP. Ho Chi Minh'
      })
    ).resolves.toMatchObject({ returnShippingInfo: { trackingStatus: 'picked_up' } })

    const updatePayload = mockReturnFindOneAndUpdate.mock.calls[0][1]
    expect(mockReturnFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: request._id, 'returnShippingInfo.carrier': 'mock_carrier' },
      expect.any(Object),
      { returnDocument: 'after' }
    )
    expect(updatePayload.$set['returnShippingInfo.trackingStatus']).toBe('picked_up')
    expect(updatePayload.$push['returnShippingInfo.trackingEvents']).toMatchObject({
      status: 'picked_up',
      message: 'Da lay hang tu khach',
      location: 'TP. Ho Chi Minh',
      updatedBy: staffId
    })
  })

  it('updateMockReturnTracking tu choi carrier that', async () => {
    const staffId = new ObjectId()
    const request = {
      _id: new ObjectId(),
      status: ReturnStatus.AWAITING_RETURN,
      returnShippingInfo: {
        trackingNumber: 'RSH-1',
        carrier: 'ghn',
        carrierTrackingCode: 'GHN-1'
      }
    }
    mockReturnFindOne.mockResolvedValueOnce(request)

    await expect(
      returnRequestService.updateMockReturnTracking(request._id, staffId, { status: 'picked_up' })
    ).rejects.toMatchObject({ status: 400 })

    expect(mockReturnFindOneAndUpdate).not.toHaveBeenCalled()
  })

  it('arrangeReturnShipping chan sap xep thu hoi sau han tra hang', async () => {
    const staffId = new ObjectId()
    const request = {
      _id: new ObjectId(),
      status: ReturnStatus.APPROVED,
      returnDeadline: new Date(Date.now() - 24 * 60 * 60 * 1000)
    }
    mockReturnFindOne.mockResolvedValueOnce(request)

    await expect(returnRequestService.arrangeReturnShipping(request._id, staffId, {})).rejects.toMatchObject({
      status: 400
    })

    expect(mockReturnFindOneAndUpdate).not.toHaveBeenCalled()
  })

  it('arrangeReturnShipping tu choi trackingNumber nhap tay', async () => {
    const staffId = new ObjectId()
    const request = {
      _id: new ObjectId(),
      status: ReturnStatus.APPROVED,
      returnDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
    mockReturnFindOne.mockResolvedValueOnce(request)

    await expect(
      returnRequestService.arrangeReturnShipping(request._id, staffId, { trackingNumber: 'MANUAL-1' } as any)
    ).rejects.toMatchObject({ status: 400 })

    expect(mockReturnFindOneAndUpdate).not.toHaveBeenCalled()
  })

  it('receiveReturnItems chan nhan hang neu chua co ma van don thu hoi tu dong', async () => {
    const request = {
      _id: new ObjectId(),
      status: ReturnStatus.AWAITING_RETURN,
      returnShippingInfo: {},
      items: []
    }
    mockReturnFindOne.mockResolvedValueOnce(request)

    await expect(
      returnRequestService.receiveReturnItems(request._id, {
        condition: 'damaged',
        conditionNotes: 'Thieu ma thu hoi'
      })
    ).rejects.toMatchObject({ status: 400 })

    expect(mockReturnFindOneAndUpdate).not.toHaveBeenCalled()
  })
})
