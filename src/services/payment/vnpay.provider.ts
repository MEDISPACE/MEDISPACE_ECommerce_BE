import crypto from 'crypto'
import qs from 'qs'
import { config } from 'dotenv'
import Order from '~/models/schemas/Order.schema'
import { PaymentProvider, PaymentRequestResult, PaymentResult } from './payment.interface'

config()

export class VNPayProvider implements PaymentProvider {
  private tmnCode = process.env.VNP_TMN_CODE
  private hashSecret = process.env.VNP_HASH_SECRET
  private vnpUrl = process.env.VNP_URL
  private returnUrl = process.env.VNP_RETURN_URL

  private getReturnUrl() {
    const apiUrl = (process.env.API_URL || 'http://localhost:8000').replace(/\/$/, '')

    if (process.env.NODE_ENV === 'production' && this.returnUrl?.includes('ngrok')) {
      console.warn('[VNPay] Ignoring ngrok VNP_RETURN_URL in production. Falling back to API_URL/payment/vnpay-return.')
      return `${apiUrl}/payment/vnpay-return`
    }

    return this.returnUrl || `${apiUrl}/payment/vnpay-return`
  }

  private assertConfigured() {
    const missing = [
      ['VNP_TMN_CODE', this.tmnCode],
      ['VNP_HASH_SECRET', this.hashSecret],
      ['VNP_URL', this.vnpUrl]
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name)

    if (missing.length > 0) {
      throw new Error(`VNPay is not configured. Missing: ${missing.join(', ')}`)
    }
  }

  async createPaymentUrl(order: Order, req?: any): Promise<string> {
    this.assertConfigured()

    const date = new Date()
    const createDate = this.formatDate(date)
    const ipAddr = this.getIpAddress(req)

    const amount = order.totalAmount
    const bankCode = '' // Optional
    const orderInfo = `Thanh toan don hang ${order.orderNumber}`
    const orderType = 'billpayment'
    const locale = 'vn'
    const currCode = 'VND'

    const vnp_ReturnUrl = this.getReturnUrl()

    let vnp_Params: any = {}
    vnp_Params['vnp_Version'] = '2.1.0'
    vnp_Params['vnp_Command'] = 'pay'
    vnp_Params['vnp_TmnCode'] = this.tmnCode
    vnp_Params['vnp_Locale'] = locale
    vnp_Params['vnp_CurrCode'] = currCode
    vnp_Params['vnp_TxnRef'] = (order._id as any).toString()
    vnp_Params['vnp_OrderInfo'] = orderInfo
    vnp_Params['vnp_OrderType'] = orderType
    vnp_Params['vnp_Amount'] = amount * 100
    vnp_Params['vnp_ReturnUrl'] = vnp_ReturnUrl
    vnp_Params['vnp_IpAddr'] = ipAddr
    vnp_Params['vnp_CreateDate'] = createDate
    if (bankCode) {
      vnp_Params['vnp_BankCode'] = bankCode
    }

    vnp_Params = this.sortObject(vnp_Params)

    const signData = qs.stringify(vnp_Params, { encode: false })
    const hmac = crypto.createHmac('sha512', this.hashSecret as string)
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex')
    vnp_Params['vnp_SecureHash'] = signed

    let vnpUrl = this.vnpUrl as string
    vnpUrl += '?' + qs.stringify(vnp_Params, { encode: false })

    return vnpUrl
  }

  async createPaymentRequest(order: Order, req?: any): Promise<PaymentRequestResult> {
    const paymentUrl = await this.createPaymentUrl(order, req)
    return {
      paymentUrl,
      providerOrderCode: (order._id as any).toString(),
      requestPayload: {
        vnp_TxnRef: (order._id as any).toString(),
        orderNumber: order.orderNumber,
        amount: order.totalAmount,
        provider: 'vnpay'
      }
    }
  }

  async verifyReturn(params: any): Promise<PaymentResult> {
    this.assertConfigured()

    const secureHash = params['vnp_SecureHash']
    const vnp_SecureHashType = params['vnp_SecureHashType']

    // Create a copy to delete properties without affecting original params if needed
    const verifyParams = { ...params }
    delete verifyParams['vnp_SecureHash']
    delete verifyParams['vnp_SecureHashType']

    const sortedParams = this.sortObject(verifyParams)
    const signData = qs.stringify(sortedParams, { encode: false })
    const hmac = crypto.createHmac('sha512', this.hashSecret as string)
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex')

    if (secureHash === signed) {
      const isSuccess = params['vnp_ResponseCode'] === '00'
      return {
        isSuccess,
        orderId: params['vnp_TxnRef'],
        amount: Number(params['vnp_Amount']) / 100,
        message: isSuccess ? 'Success' : 'Failed',
        transactionId: params['vnp_TransactionNo'],
        providerOrderCode: params['vnp_TxnRef'],
        providerResponseCode: params['vnp_ResponseCode'],
        rawPayload: params
      }
    } else {
      return {
        isSuccess: false,
        orderId: params['vnp_TxnRef'],
        amount: 0,
        message: 'Invalid Signature',
        providerOrderCode: params['vnp_TxnRef'],
        providerResponseCode: params['vnp_ResponseCode'],
        rawPayload: params
      }
    }
  }

  async verifyIpn(params: any): Promise<PaymentResult> {
    return this.verifyReturn(params)
  }

  private sortObject(obj: any) {
    const sorted: any = {}
    const str = []
    let key
    for (key in obj) {
      if (obj.hasOwnProperty(key)) {
        str.push(encodeURIComponent(key))
      }
    }
    str.sort()
    for (key = 0; key < str.length; key++) {
      sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, '+')
    }
    return sorted
  }

  private formatDate(date: Date) {
    const vietnamTime = new Date(date.getTime() + 7 * 60 * 60 * 1000)
    const year = vietnamTime.getUTCFullYear()
    const month = ('0' + (1 + vietnamTime.getUTCMonth())).slice(-2)
    const day = ('0' + vietnamTime.getUTCDate()).slice(-2)
    const hours = ('0' + vietnamTime.getUTCHours()).slice(-2)
    const minutes = ('0' + vietnamTime.getUTCMinutes()).slice(-2)
    const seconds = ('0' + vietnamTime.getUTCSeconds()).slice(-2)
    return year + month + day + hours + minutes + seconds
  }

  private getIpAddress(req: any) {
    return req?.ip || req?.socket?.remoteAddress || '127.0.0.1'
  }
}
