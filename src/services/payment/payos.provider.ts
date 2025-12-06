const { PayOS } = require('@payos/node')
import { config } from 'dotenv'
import Order from '~/models/schemas/Order.schema'
import { PaymentProvider, PaymentResult } from './payment.interface'

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

    async createPaymentUrl(order: Order, req?: any): Promise<string> {
        // Generate a unique numeric orderCode
        // Using timestamp + random part to ensure uniqueness and fit in integer limits
        const orderCode = Number(String(Date.now()).slice(-6) + Math.floor(Math.random() * 1000))

        const appUrl = process.env.CLIENT_URL || 'http://localhost:3000'

        // Append orderId to return/cancel URLs to identify the order on frontend return
        const returnUrl = `${appUrl}/order/success?orderId=${order._id}&paymentStatus=success`
        const cancelUrl = `${appUrl}/order/success?orderId=${order._id}&paymentStatus=failed`

        // Description format: "DH {orderNumber}"
        // We will use this to lookup the order in the webhook
        const description = `DH ${order.orderNumber}`.substring(0, 25) // PayOS description limit might apply

        const paymentData = {
            orderCode: orderCode,
            amount: order.totalAmount,
            description: description,
            items: order.items.map(item => ({
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
                    console.error('PayOS create payment inner error:', innerError)
                    throw innerError
                }
            }
            console.error('PayOS create payment error:', error)
            throw new Error('Failed to create PayOS payment URL')
        }
    }

    async verifyReturn(params: any): Promise<PaymentResult> {
        // Since we append orderId and paymentStatus to the return URL ourselves,
        // we can just parse them from the query params in the controller.
        // However, the provider interface expects verification logic.
        // For PayOS, the return is a direct redirect, so we trust the params we set ourselves?
        // Actually, PayOS appends its own params too (code, id, cancel, status, orderCode).

        const isSuccess = params.status === 'PAID' || params.code === '00'

        return {
            isSuccess,
            orderId: params.orderId, // Retrieved from our custom query param
            amount: 0,
            message: isSuccess ? 'Success' : 'Failed'
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
            console.error('PayOS verify IPN error:', error)
            return {
                isSuccess: false,
                orderId: '',
                amount: 0,
                message: 'Invalid Webhook Data'
            }
        }
    }
}
