import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'
import { PayOSProvider } from '~/services/payment/payos.provider'

const mockCreatePaymentLink = vi.fn()

describe('PayOSProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.API_URL = 'https://api.medispace.test'
    mockCreatePaymentLink.mockImplementation(async (paymentData) => ({
      checkoutUrl: `https://payos.test/checkout/${paymentData.orderCode}`
    }))
  })

  it('uses a fresh orderCode when retrying payment for the same order', async () => {
    const provider = new PayOSProvider()
    ;(provider as any).payOS = { createPaymentLink: mockCreatePaymentLink }
    const order = {
      _id: new ObjectId(),
      orderNumber: 'ORD-RETRY-PAYOS-TEST',
      totalAmount: 100000,
      items: [{ name: 'Sản phẩm test', quantity: 1, unitPrice: 100000 }]
    } as any

    const firstUrl = await provider.createPaymentUrl(order)
    const secondUrl = await provider.createPaymentUrl(order)

    const firstPaymentData = mockCreatePaymentLink.mock.calls[0][0]
    const secondPaymentData = mockCreatePaymentLink.mock.calls[1][0]

    expect(firstPaymentData.orderCode).not.toBe(secondPaymentData.orderCode)
    expect(firstPaymentData.description).toBe(`DH ${order.orderNumber}`.substring(0, 25))
    expect(secondPaymentData.description).toBe(firstPaymentData.description)
    expect(firstUrl).toContain(String(firstPaymentData.orderCode))
    expect(secondUrl).toContain(String(secondPaymentData.orderCode))
  })
})
