import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

const mockOrdersFindOne = vi.fn()
const mockOrdersUpdateOne = vi.fn()
const mockOrdersFindOneAndUpdate = vi.fn()
const mockProductsFindOne = vi.fn()
const mockProductsUpdateOne = vi.fn()
const mockPrescriptionsFindOne = vi.fn()
const mockReleaseCouponRedemptionsForOrder = vi.fn()
const mockRefundRedeemedPointsForOrder = vi.fn()
const mockEarnPointsFromOrder = vi.fn()

vi.mock('~/services/database.services', () => ({
  default: {
    orders: {
      findOne: mockOrdersFindOne,
      findOneAndUpdate: mockOrdersFindOneAndUpdate,
      updateOne: mockOrdersUpdateOne
    },
    products: {
      findOne: mockProductsFindOne,
      updateOne: mockProductsUpdateOne
    },
    prescriptions: {
      findOne: mockPrescriptionsFindOne
    }
  }
}))

vi.mock('~/services/coupons.services', () => ({
  default: {
    releaseCouponRedemptionsForOrder: mockReleaseCouponRedemptionsForOrder,
    validateCoupon: vi.fn(),
    recordCouponRedemption: vi.fn()
  }
}))

vi.mock('~/services/loyalty.services', () => ({
  default: {
    refundRedeemedPointsForOrder: mockRefundRedeemedPointsForOrder,
    earnPointsFromOrder: mockEarnPointsFromOrder,
    redeemPoints: vi.fn()
  }
}))

vi.mock('~/services/carts.services', () => ({ default: {} }))
vi.mock('~/services/email.services', () => ({ default: {} }))
vi.mock('~/services/payment.services', () => ({ default: {} }))
vi.mock('~/services/products.services', () => ({ default: {} }))
vi.mock('~/services/campaigns.services', () => ({ default: {} }))
vi.mock('~/services/notifications.services', () => ({ default: {} }))
vi.mock('~/services/ghn.services', () => ({ ghnService: {} }))
vi.mock('~/sockets/chat.socket', () => ({ getIO: vi.fn(() => ({})) }))

const { default: orderService } = await import('~/services/orders.services')

const makeOrder = (overrides = {}) => {
  const productId = new ObjectId()
  return {
    _id: new ObjectId(),
    userId: new ObjectId(),
    orderNumber: 'ORD-123',
    paymentMethod: 'vnpay',
    paymentStatus: 'pending',
    orderStatus: 'pending',
    items: [
      {
        productId,
        unit: 'Hộp',
        quantity: 2
      }
    ],
    ...overrides
  }
}

describe('OrderService benefit settlement', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockOrdersFindOneAndUpdate.mockImplementation(async () => ({}))
  })

  it('payment failed: hủy order, restore stock, release coupon usage và hoàn điểm', async () => {
    const order = makeOrder()
    mockOrdersFindOne
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce({ ...order, paymentStatus: 'failed', orderStatus: 'cancelled' })
    mockProductsFindOne.mockResolvedValueOnce({
      _id: order.items[0].productId,
      priceVariants: [{ unit: 'Hộp', quantityPerUnit: 10 }]
    })

    await orderService.updatePaymentStatus(order._id, 'failed')

    expect(mockProductsUpdateOne).toHaveBeenCalledWith(
      { _id: order.items[0].productId },
      { $inc: { stockQuantity: 20 } }
    )
    expect(mockReleaseCouponRedemptionsForOrder).toHaveBeenCalledWith(order._id)
    expect(mockRefundRedeemedPointsForOrder).toHaveBeenCalledWith(order.userId, order._id, order.orderNumber)
    expect(mockOrdersUpdateOne).toHaveBeenCalledWith(
      { _id: order._id },
      {
        $set: expect.objectContaining({
          paymentStatus: 'failed',
          orderStatus: 'cancelled',
          cancelReason: 'Thanh toán không thành công'
        })
      }
    )
  })

  it('cancel order: restore stock và release benefits qua cùng OrderService', async () => {
    const order = makeOrder({ paymentMethod: 'cod' })
    mockOrdersFindOne
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce({ ...order, orderStatus: 'cancelled' })
    mockProductsFindOne.mockResolvedValueOnce({
      _id: order.items[0].productId,
      priceVariants: [{ unit: 'Hộp', quantityPerUnit: 10 }]
    })

    await orderService.updateOrderStatus(order._id, 'cancelled', undefined, 'Khách hủy')

    expect(mockProductsUpdateOne).toHaveBeenCalledWith(
      { _id: order.items[0].productId },
      { $inc: { stockQuantity: 20 } }
    )
    expect(mockReleaseCouponRedemptionsForOrder).toHaveBeenCalledWith(order._id)
    expect(mockRefundRedeemedPointsForOrder).toHaveBeenCalledWith(order.userId, order._id, order.orderNumber)
    expect(mockOrdersUpdateOne).toHaveBeenCalledWith(
      { _id: order._id },
      {
        $set: expect.objectContaining({
          orderStatus: 'cancelled',
          notes: 'Khách hủy'
        })
      }
    )
  })

  it('delivered COD: mark paid và tích điểm một lần qua loyalty service', async () => {
    const order = makeOrder({ paymentMethod: 'cod', totalAmount: 250000 })
    mockOrdersFindOne
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce({ ...order, orderStatus: 'delivered', paymentStatus: 'paid' })

    await orderService.updateOrderStatus(order._id, 'delivered')

    expect(mockEarnPointsFromOrder).toHaveBeenCalledWith(order.userId, order._id, 250000, order.orderNumber)
    expect(mockOrdersUpdateOne).toHaveBeenCalledWith(
      { _id: order._id },
      {
        $set: expect.objectContaining({
          orderStatus: 'delivered',
          paymentStatus: 'paid',
          paidAt: expect.any(Date),
          deliveredAt: expect.any(Date)
        })
      }
    )
  })

  it('không cho hủy đơn đã delivered để tránh hoàn stock/coupon/point sai', async () => {
    const order = makeOrder({ orderStatus: 'delivered', paymentStatus: 'paid' })
    mockOrdersFindOne.mockResolvedValueOnce(order)

    await expect(orderService.updateOrderStatus(order._id, 'cancelled')).rejects.toThrow('Đơn hàng đã giao')

    expect(mockProductsUpdateOne).not.toHaveBeenCalled()
    expect(mockReleaseCouponRedemptionsForOrder).not.toHaveBeenCalled()
    expect(mockRefundRedeemedPointsForOrder).not.toHaveBeenCalled()
  })

  it('không cho payment failed sau khi đơn đã paid', async () => {
    const order = makeOrder({ paymentStatus: 'paid', orderStatus: 'confirmed' })
    mockOrdersFindOne.mockResolvedValueOnce(order)

    await expect(orderService.updatePaymentStatus(order._id, 'failed')).rejects.toThrow('Không thể đánh dấu thất bại')

    expect(mockProductsUpdateOne).not.toHaveBeenCalled()
    expect(mockReleaseCouponRedemptionsForOrder).not.toHaveBeenCalled()
    expect(mockRefundRedeemedPointsForOrder).not.toHaveBeenCalled()
  })

  it('không cho chuyển trạng thái đơn đã returned', async () => {
    const order = makeOrder({ orderStatus: 'returned', paymentStatus: 'refunded' })
    mockOrdersFindOne.mockResolvedValueOnce(order)

    await expect(orderService.updateOrderStatus(order._id, 'processing')).rejects.toThrow('Đơn hàng đã hoàn trả')

    expect(mockOrdersUpdateOne).not.toHaveBeenCalled()
    expect(mockProductsUpdateOne).not.toHaveBeenCalled()
    expect(mockReleaseCouponRedemptionsForOrder).not.toHaveBeenCalled()
    expect(mockRefundRedeemedPointsForOrder).not.toHaveBeenCalled()
  })

  it('không restore stock lần nữa khi order đã được claim trước đó', async () => {
    const order = makeOrder()
    mockOrdersFindOne
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce({ ...order, paymentStatus: 'failed', orderStatus: 'cancelled', stockRestored: true })
    mockOrdersFindOneAndUpdate.mockResolvedValueOnce(null)

    await orderService.updatePaymentStatus(order._id, 'failed')

    expect(mockProductsFindOne).not.toHaveBeenCalled()
    expect(mockProductsUpdateOne).not.toHaveBeenCalled()
  })

  it.each([
    ['cancelled', 'processing'],
    ['returned', 'processing'],
    ['delivered', 'cancelled']
  ])('rejects terminal order transition %s → %s', (currentStatus, nextStatus) => {
    expect(() => (orderService as any).assertOrderStatusTransition(
      makeOrder({ orderStatus: currentStatus }),
      nextStatus
    )).toThrow()
  })

  it('rejects a prescription-required order when no prescription is selected', async () => {
    await expect((orderService as any).validatePrescriptionForOrder(
      new ObjectId(),
      [{ productId: new ObjectId(), name: 'Thuốc A', quantity: 1, prescriptionRequired: true }]
    )).rejects.toThrow('Vui lòng chọn đơn thuốc')
  })

  it('rejects an expired, unverified, or foreign prescription', async () => {
    mockPrescriptionsFindOne.mockResolvedValueOnce(null)

    await expect((orderService as any).validatePrescriptionForOrder(
      new ObjectId(),
      [{ productId: new ObjectId(), name: 'Thuốc A', quantity: 1, prescriptionRequired: true }],
      new ObjectId().toString()
    )).rejects.toThrow('không hợp lệ')
  })

  it('rejects medication or quantity not covered by the prescription', async () => {
    const productId = new ObjectId()
    mockPrescriptionsFindOne.mockResolvedValueOnce({
      _id: new ObjectId(),
      medications: [{ productId, productName: 'Thuốc A', quantity: 1 }]
    })

    await expect((orderService as any).validatePrescriptionForOrder(
      new ObjectId(),
      [{ productId, name: 'Thuốc A', quantity: 2, prescriptionRequired: true }],
      new ObjectId().toString()
    )).rejects.toThrow('không cho phép mua')
  })

  it('accepts a verified prescription matching product and quantity', async () => {
    const productId = new ObjectId()
    const prescriptionId = new ObjectId()
    mockPrescriptionsFindOne.mockResolvedValueOnce({
      _id: prescriptionId,
      medications: [{ productId, productName: 'Thuốc A', quantity: 2 }]
    })

    await expect((orderService as any).validatePrescriptionForOrder(
      new ObjectId(),
      [{ productId, name: 'Thuốc A', quantity: 2, prescriptionRequired: true }],
      prescriptionId.toString()
    )).resolves.toEqual(prescriptionId)
  })

  it('allocates a targeted coupon only across eligible category items', () => {
    const eligibleCategory = new ObjectId()
    const items = [
      { productId: new ObjectId(), categoryId: eligibleCategory, unit: 'Hộp', totalPrice: 100_000 },
      { productId: new ObjectId(), categoryId: new ObjectId(), unit: 'Hộp', totalPrice: 200_000 }
    ]

    const allocated = (orderService as any).attachBenefitAllocations(items, [{
      code: 'CATEGORY10',
      type: 'fixed_amount',
      discountAmount: 10_000,
      applicableCategoryIds: [eligibleCategory]
    }], 0)

    expect(allocated[0].discountAllocation).toBe(10_000)
    expect(allocated[1].discountAllocation).toBe(0)
  })
})
