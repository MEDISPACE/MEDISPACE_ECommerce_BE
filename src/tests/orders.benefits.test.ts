import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

const mockOrdersFindOne = vi.fn()
const mockOrdersUpdateOne = vi.fn()
const mockProductsFindOne = vi.fn()
const mockProductsUpdateOne = vi.fn()
const mockReleaseCouponRedemptionsForOrder = vi.fn()
const mockRefundRedeemedPointsForOrder = vi.fn()
const mockEarnPointsFromOrder = vi.fn()

vi.mock('~/services/database.services', () => ({
  default: {
    orders: {
      findOne: mockOrdersFindOne,
      updateOne: mockOrdersUpdateOne
    },
    products: {
      findOne: mockProductsFindOne,
      updateOne: mockProductsUpdateOne
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
})
