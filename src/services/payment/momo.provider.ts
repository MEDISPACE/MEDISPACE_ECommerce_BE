import axios from 'axios'
import crypto from 'crypto'
import { config } from 'dotenv'
import Order from '~/models/schemas/Order.schema'
import { PaymentProvider, PaymentResult } from './payment.interface'
import { ORDERS_MESSAGES } from '~/constants/message'

config()

export class MomoProvider implements PaymentProvider {
    private partnerCode = process.env.MOMO_PARTNER_CODE
    private accessKey = process.env.MOMO_ACCESS_KEY
    private secretKey = process.env.MOMO_SECRET_KEY
    private endpoint = process.env.MOMO_ENDPOINT || 'https://test-payment.momo.vn/v2/gateway/api/create'

    async createPaymentUrl(order: Order, req?: any): Promise<string> {
        const requestId = (order._id as any).toString() + new Date().getTime()
        const orderId = (order._id as any).toString()
        const orderInfo = `${ORDERS_MESSAGES.PAYMENT_ORDER_INFO_PREFIX}${order.orderNumber}`
        const amount = order.totalAmount.toString()
        const requestType = 'captureWallet'
        const extraData = ''

        // Base URL from env or default to localhost
        // Assuming VNP_RETURN_URL is set to something like https://domain.com/payment/vnpay-return
        // We extract the base domain from it
        const appUrl = process.env.VNP_RETURN_URL
            ? process.env.VNP_RETURN_URL.split('/payment')[0]
            : 'http://localhost:8000'

        const redirectUrl = `${appUrl}/payment/momo/return`
        const ipnUrl = `${appUrl}/payment/momo/ipn`

        const rawSignature = `accessKey=${this.accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${ipnUrl}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${this.partnerCode}&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=${requestType}`

        const signature = crypto.createHmac('sha256', this.secretKey as string)
            .update(rawSignature)
            .digest('hex')

        const requestBody = {
            partnerCode: this.partnerCode,
            accessKey: this.accessKey,
            requestId,
            amount,
            orderId,
            orderInfo,
            redirectUrl,
            ipnUrl,
            extraData,
            requestType,
            signature,
            lang: 'vi'
        }

        try {
            const response = await axios.post(this.endpoint, requestBody)
            return response.data.payUrl
        } catch (error) {
            throw new Error(ORDERS_MESSAGES.MOMO_CREATE_URL_FAILED)
        }
    }

    async verifyReturn(params: any): Promise<PaymentResult> {
        const { orderId, resultCode, message, amount, transId } = params
        // Momo return params verification logic

        const isSuccess = resultCode === '0'
        return {
            isSuccess,
            orderId,
            amount: Number(amount),
            message,
            transactionId: transId
        }
    }

    async verifyIpn(params: any): Promise<PaymentResult> {
        const { partnerCode, orderId, requestId, amount, orderInfo, orderType, transId, resultCode, message, payType, responseTime, extraData, signature } = params

        const rawSignature = `accessKey=${this.accessKey}&amount=${amount}&extraData=${extraData}&message=${message}&orderId=${orderId}&orderInfo=${orderInfo}&orderType=${orderType}&partnerCode=${partnerCode}&payType=${payType}&requestId=${requestId}&responseTime=${responseTime}&resultCode=${resultCode}&transId=${transId}`

        const generatedSignature = crypto.createHmac('sha256', this.secretKey as string)
            .update(rawSignature)
            .digest('hex')

        if (signature !== generatedSignature) {
            return {
                isSuccess: false,
                orderId,
                amount: Number(amount),
                message: ORDERS_MESSAGES.INVALID_SIGNATURE,
                transactionId: transId
            }
        }

        return {
            isSuccess: resultCode === '0',
            orderId,
            amount: Number(amount),
            message,
            transactionId: transId
        }
    }
}
