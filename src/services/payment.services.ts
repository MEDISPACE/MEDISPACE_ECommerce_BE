import { config } from 'dotenv'
import Order from '~/models/schemas/Order.schema'
import { PaymentMethod } from '~/constants/enum'
import { PaymentProvider } from './payment/payment.interface'
import { VNPayProvider } from './payment/vnpay.provider'
import { PayOSProvider } from './payment/payos.provider'

config()

class PaymentService {
  private providers: Map<string, PaymentProvider> = new Map()

  constructor() {
    this.providers.set(PaymentMethod.VNPay, new VNPayProvider())
    this.providers.set(PaymentMethod.PayOS, new PayOSProvider())
    // Map 'bank_transfer' to VNPay
    this.providers.set(PaymentMethod.BankTransfer, new VNPayProvider())
  }

  getProvider(method: string): PaymentProvider {
    const provider = this.providers.get(method)
    if (!provider) {
      // Fallback or throw error
      throw new Error(`Payment provider for method '${method}' not found`)
    }
    return provider
  }

  async createPaymentUrl(order: Order, req?: any): Promise<string> {
    const provider = this.getProvider(order.paymentMethod)
    return provider.createPaymentUrl(order, req)
  }

  // Helper to verify return data from specific provider
  async verifyReturn(method: string, params: any) {
    const provider = this.getProvider(method)
    return provider.verifyReturn(params)
  }

  // Helper to verify IPN data from specific provider
  async verifyIpn(method: string, params: any) {
    const provider = this.getProvider(method)
    return provider.verifyIpn(params)
  }
}

const paymentService = new PaymentService()
export default paymentService
