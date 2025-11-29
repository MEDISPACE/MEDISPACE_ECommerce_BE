import Order from '~/models/schemas/Order.schema'

export interface PaymentResult {
    isSuccess: boolean
    orderId: string
    amount: number
    message: string
    transactionId?: string
}

export interface PaymentProvider {
    createPaymentUrl(order: Order, req?: any): Promise<string>
    verifyReturn(params: any): Promise<PaymentResult>
    verifyIpn(params: any): Promise<PaymentResult>
}
