import { ShippingProviderCode, ShippingRateOption, ShippingRateRequest } from './shipping/shipping.types'
import { GHNShippingProvider } from './shipping/ghn.provider'
import { GHTKShippingProvider } from './shipping/ghtk.provider'
import { AhamoveShippingProvider } from './shipping/ahamove.provider'

class ShippingService {
  private providers = {
    ghn: new GHNShippingProvider(),
    ghtk: new GHTKShippingProvider(),
    ahamove: new AhamoveShippingProvider()
  }

  private parseMethod(shippingMethod?: string) {
    if (!shippingMethod) return { provider: 'ghn' as ShippingProviderCode, serviceCode: undefined }

    const [provider, serviceCode] = shippingMethod.split(':')
    if (provider === 'ghn' || provider === 'ghtk' || provider === 'ahamove') {
      return { provider, serviceCode }
    }

    return { provider: 'ghn' as ShippingProviderCode, serviceCode: shippingMethod }
  }

  async getRates(payload: ShippingRateRequest) {
    const settled = await Promise.allSettled(
      Object.values(this.providers).map((provider) => provider.getRates(payload))
    )

    return settled
      .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
      .filter((rate) => Number.isFinite(rate.price))
      .sort((a, b) => a.price - b.price)
  }

  async calculateRate(payload: ShippingRateRequest, shippingMethod?: string): Promise<ShippingRateOption | null> {
    const { provider, serviceCode } = this.parseMethod(shippingMethod)
    return this.providers[provider].calculateRate(payload, serviceCode)
  }
}

const shippingService = new ShippingService()
export default shippingService
