import crypto from 'crypto'
import qs from 'qs'
import { config } from 'dotenv'
import Order from '~/models/schemas/Order.schema'
import { PaymentProvider, PaymentResult } from './payment.interface'

config()

export class VNPayProvider implements PaymentProvider {
  private tmnCode = process.env.VNP_TMN_CODE
  private hashSecret = process.env.VNP_HASH_SECRET
  private vnpUrl = process.env.VNP_URL
  private returnUrl = process.env.VNP_RETURN_URL

  async createPaymentUrl(order: Order, req?: any): Promise<string> {
    const date = new Date()
    const createDate = this.formatDate(date)
    const ipAddr = this.getIpAddress(req)

    const amount = order.totalAmount
    const bankCode = '' // Optional
    const orderInfo = `Thanh toan don hang ${order.orderNumber}`
    const orderType = 'billpayment'
    const locale = 'vn'
    const currCode = 'VND'

    const apiUrl = (process.env.API_URL || 'http://localhost:8000').replace(/\/$/, '')
    const vnp_ReturnUrl = this.returnUrl || `${apiUrl}/payment/vnpay-return`

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

    let vnpUrl = this.vnpUrl
    vnpUrl += '?' + qs.stringify(vnp_Params, { encode: false })

    return vnpUrl as string
  }

  async verifyReturn(params: any): Promise<PaymentResult> {
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
        transactionId: params['vnp_TransactionNo']
      }
    } else {
      return {
        isSuccess: false,
        orderId: params['vnp_TxnRef'],
        amount: 0,
        message: 'Invalid Signature'
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
    const year = date.getFullYear()
    const month = ('0' + (1 + date.getMonth())).slice(-2)
    const day = ('0' + date.getDate()).slice(-2)
    const hours = ('0' + date.getHours()).slice(-2)
    const minutes = ('0' + date.getMinutes()).slice(-2)
    const seconds = ('0' + date.getSeconds()).slice(-2)
    return year + month + day + hours + minutes + seconds
  }

  private getIpAddress(req: any) {
    return req?.ip || req?.socket?.remoteAddress || '127.0.0.1'
  }
}
