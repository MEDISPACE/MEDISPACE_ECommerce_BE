const { PayOS } = require('@payos/node')
import { config } from 'dotenv'
import Order from '~/models/schemas/Order.schema'
import { PaymentProvider, PaymentResult } from './payment.interface'
import { ORDERS_MESSAGES } from '~/constants/message'

config()

export class PayOSProvider implements PaymentProvider {
  private payOS: any

  constructor() {
    this.payOS = new PayOS(
      process.env.PAYOS_CLIENT_ID || '',
      process.env.PAYOS_API_KEY || '',
      process.env.PAYOS_CHECKSUM_KEY || ''
    )
  }

  private generateOrderCode(): number {
    return Date.now() * 1000 + Math.floor(Math.random() * 1000)
  }

  async createPaymentUrl(order: Order, req?: any): Promise<string> {
    // PayOS requires a unique numeric orderCode for every payment link request.
    // Retrying payment for the same pending order must create a fresh link.
    const orderCode = this.generateOrderCode()

    const apiUrl = process.env.API_URL || 'http://localhost:8000'

    // Return URL goes to backend first to verify and update payment status
    const returnUrl = `${apiUrl}/payment/payos/return?orderId=${order._id}`
    const cancelUrl = `${apiUrl}/payment/payos/return?orderId=${order._id}&status=CANCELLED`

    // Description format: "DH {orderNumber}"
    // We will use this to lookup the order in the webhook
    const description = `DH ${order.orderNumber}`.substring(0, 25) // PayOS description limit might apply

    const paymentData = {
      orderCode: orderCode,
      amount: order.totalAmount,
      description: description,
      items: order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.unitPrice
      })),
      returnUrl: returnUrl,
      cancelUrl: cancelUrl
    }

    try {
      const link = await this.payOS.createPaymentLink(paymentData)
      return link.checkoutUrl
    } catch (error: any) {
      // Fallback for newer/different library versions
      if (this.payOS.paymentRequests && typeof this.payOS.paymentRequests.create === 'function') {
        try {
          const link = await this.payOS.paymentRequests.create(paymentData)
          return link.checkoutUrl
        } catch (innerError) {
          throw innerError
        }
      }
      throw new Error(ORDERS_MESSAGES.PAYOS_CREATE_URL_FAILED)
    }
  }

  async verifyReturn(params: any): Promise<PaymentResult> {
    return {
      isSuccess: false,
      orderId: params.orderId,
      amount: 0,
      message: 'Payment status is confirmed by the signed webhook only'
    }
  }

  async verifyIpn(body: any): Promise<PaymentResult> {
    try {
      const webhookData = this.payOS.verifyPaymentWebhookData(body)
      // webhookData: { orderCode, amount, description, ... }

      // Extract orderNumber from description "DH {orderNumber}"
      // Assuming description format: "DH ORD-..."
      const description = webhookData.description
      const orderNumber = description.replace('DH ', '').trim()

      // We return the orderNumber as transactionId or a special field so the controller can find the order
      // Ideally we should return orderId, but we don't have it here without DB lookup.
      // We will return transactionId = orderNumber and let the controller/service handle lookup.

      return {
        isSuccess: webhookData.code === '00',
        orderId: '', // Empty, controller must lookup by transactionId (which holds orderNumber)
        transactionId: orderNumber, // Using this to pass orderNumber back
        amount: webhookData.amount,
        message: webhookData.desc
      }
    } catch (error) {
      return {
        isSuccess: false,
        orderId: '',
        amount: 0,
        message: ORDERS_MESSAGES.INVALID_WEBHOOK_DATA
      }
    }
  }
}
