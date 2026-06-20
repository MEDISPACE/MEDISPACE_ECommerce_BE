import { afterEach, describe, expect, it } from 'vitest'
import { ObjectId } from 'mongodb'
import { VNPayProvider } from '~/services/payment/vnpay.provider'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('VNPayProvider configuration', () => {
  it('uses API_URL and the registered return route when VNP_RETURN_URL is absent', async () => {
    process.env.API_URL = 'https://api.medispace.test/'
    delete process.env.VNP_RETURN_URL
    process.env.VNP_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'
    process.env.VNP_HASH_SECRET = 'test-secret'
    process.env.VNP_TMN_CODE = 'TEST'
    const provider = new VNPayProvider()

    const paymentUrl = await provider.createPaymentUrl({
      _id: new ObjectId(),
      orderNumber: 'ORD-TEST',
      totalAmount: 100_000
    } as any, { ip: '203.0.113.1' })

    expect(paymentUrl).toContain(
      encodeURIComponent('https://api.medispace.test/payment/vnpay-return')
    )
  })

  it('rejects a return payload with an invalid signature', async () => {
    process.env.VNP_HASH_SECRET = 'test-secret'
    const provider = new VNPayProvider()

    const result = await provider.verifyReturn({
      vnp_TxnRef: new ObjectId().toString(),
      vnp_Amount: '10000000',
      vnp_ResponseCode: '00',
      vnp_SecureHash: 'forged-signature'
    })

    expect(result.isSuccess).toBe(false)
    expect(result.message).toBe('Invalid Signature')
  })
})
