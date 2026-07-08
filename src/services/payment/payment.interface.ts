import Order from '~/models/schemas/Order.schema'

export interface PaymentResult {
  isSuccess: boolean
  orderId: string
  amount: number
  message: string
  transactionId?: string
  providerOrderCode?: string | number
  providerResponseCode?: string
  rawPayload?: Record<string, unknown>
}

export interface PaymentRequestResult {
  paymentUrl: string
  providerOrderCode?: string | number
  requestPayload?: Record<string, unknown>
}

export interface PaymentProvider {
  createPaymentUrl(order: Order, req?: any): Promise<string>
  createPaymentRequest?(order: Order, req?: any): Promise<PaymentRequestResult>
  verifyReturn(params: any): Promise<PaymentResult>
  verifyIpn(params: any): Promise<PaymentResult>
}
