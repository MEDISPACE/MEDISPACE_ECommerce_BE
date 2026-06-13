import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'

const mockVerifyReturn = vi.fn()
const mockVerifyIpn = vi.fn()
const mockUpdatePaymentStatus = vi.fn()
const mockGetOrderByOrderNumber = vi.fn()
const mockOrdersFindOne = vi.fn()
const mockOrdersUpdateOne = vi.fn()
const mockRemoveItemFromCart = vi.fn()
const mockSendOrderConfirmationEmail = vi.fn()

vi.mock('~/services/payment.services', () => ({
  default: {
    verifyReturn: mockVerifyReturn,
    verifyIpn: mockVerifyIpn
  }
}))

vi.mock('~/services/orders.services', () => ({
  default: {
    updatePaymentStatus: mockUpdatePaymentStatus,
    getOrderByOrderNumber: mockGetOrderByOrderNumber
  }
}))

vi.mock('~/services/database.services', () => ({
  default: {
    orders: {
      findOne: mockOrdersFindOne,
      updateOne: mockOrdersUpdateOne
    }
  }
}))

vi.mock('~/services/carts.services', () => ({
  default: { removeItemFromCart: mockRemoveItemFromCart }
}))

vi.mock('~/services/email.services', () => ({
  default: { sendOrderConfirmationEmail: mockSendOrderConfirmationEmail }
}))

const {
  vnpayReturnController,
  vnpayIpnController,
  payOSIpnController,
  payOSReturnController
} = await import('~/controllers/payment.controllers')

function response() {
  const res: any = {}
  res.status = vi.fn(() => res)
  res.json = vi.fn((body) => body)
  res.redirect = vi.fn((url) => url)
  return res
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    _id: new ObjectId(),
    userId: new ObjectId(),
    orderNumber: 'ORD-PAYMENT-TEST',
    paymentMethod: 'vnpay',
    paymentStatus: 'pending',
    totalAmount: 250_000,
    items: [],
    ...overrides
  }
}

describe('payment controllers', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.CLIENT_URL = 'http://client.test'
  })

  it('rejects a signed VNPay return whose amount differs from the order total', async () => {
    const existing = order()
    mockVerifyReturn.mockResolvedValue({
      isSuccess: true,
      orderId: existing._id.toString(),
      amount: 1,
      message: 'Success'
    })
    mockOrdersFindOne.mockResolvedValue(existing)
    const res = response()

    await vnpayReturnController({ query: {} } as any, res)

    expect(mockUpdatePaymentStatus).not.toHaveBeenCalled()
    expect(res.redirect).toHaveBeenCalledWith(
      `http://client.test/order/success?orderId=${existing._id.toString()}&paymentStatus=failed`
    )
  })

  it('confirms VNPay IPN only when method and amount match, then clears the cart', async () => {
    const existing = order({
      items: [{ productId: new ObjectId(), unit: 'Viên' }]
    })
    mockVerifyIpn.mockResolvedValue({
      isSuccess: true,
      orderId: existing._id.toString(),
      amount: existing.totalAmount,
      message: 'Success'
    })
    mockOrdersFindOne.mockResolvedValue(existing)
    mockRemoveItemFromCart.mockResolvedValue(undefined)
    const res = response()

    await vnpayIpnController({ query: {} } as any, res)

    expect(mockUpdatePaymentStatus).toHaveBeenCalledWith(existing._id, 'paid')
    expect(mockRemoveItemFromCart).toHaveBeenCalledOnce()
    expect(res.json).toHaveBeenCalledWith({ RspCode: '00', Message: 'Confirm Success' })
  })

  it('does not trust an unauthenticated PayOS return URL to mark an order paid', async () => {
    const existing = order({ paymentMethod: 'payos' })
    mockOrdersFindOne.mockResolvedValue(existing)
    const res = response()

    await payOSReturnController(
      { query: { orderId: existing._id.toString(), status: 'PAID', code: '00' } } as any,
      res
    )

    expect(mockUpdatePaymentStatus).not.toHaveBeenCalled()
    expect(res.redirect).toHaveBeenCalledWith(
      `http://client.test/order/success?orderId=${existing._id.toString()}&paymentStatus=pending`
    )
  })

  it('rejects a validly signed PayOS webhook when its amount differs from the order total', async () => {
    const existing = order({ paymentMethod: 'payos' })
    mockVerifyIpn.mockResolvedValue({
      isSuccess: true,
      transactionId: existing.orderNumber,
      amount: existing.totalAmount - 1
    })
    mockGetOrderByOrderNumber.mockResolvedValue(existing)
    const res = response()

    await payOSIpnController({ body: {} } as any, res)

    expect(mockUpdatePaymentStatus).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({ success: false })
  })
})
