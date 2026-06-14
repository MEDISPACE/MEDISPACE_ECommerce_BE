import { ghnService } from '~/services/ghn.services'
import { ShippingProvider, ShippingRateOption, ShippingRateRequest } from './shipping.types'

export class GHNShippingProvider implements ShippingProvider {
  readonly provider = 'ghn' as const

  async getRates(payload: ShippingRateRequest): Promise<ShippingRateOption[]> {
    if (!payload.toDistrictId || !payload.toWardCode) return []

    const options = await ghnService.getShippingOptions({
      to_district_id: payload.toDistrictId,
      to_ward_code: payload.toWardCode,
      weight: payload.weight
    })

    return options.map((option: any) => ({
      id: `ghn:${option.id}`,
      provider: this.provider,
      serviceCode: String(option.id),
      name: `GHN ${option.name}`,
      description: option.description || 'Giao hàng bởi GHN',
      price: option.price,
      estimatedDays: option.estimatedDays || '2-4 ngày',
      supportsCod: true,
      raw: option
    }))
  }

  async calculateRate(payload: ShippingRateRequest, serviceCode?: string): Promise<ShippingRateOption | null> {
    if (!payload.toDistrictId || !payload.toWardCode) return null

    try {
      const feeData = await ghnService.calculateFee({
        to_district_id: payload.toDistrictId,
        to_ward_code: payload.toWardCode,
        weight: payload.weight,
        ...(serviceCode ? { service_id: Number(serviceCode) } : { service_type_id: 2 })
      })

      if (!feeData?.total) return null

      return {
        id: serviceCode ? `ghn:${serviceCode}` : 'ghn:standard',
        provider: this.provider,
        serviceCode: serviceCode || 'standard',
        name: serviceCode ? `GHN #${serviceCode}` : 'GHN tiêu chuẩn',
        description: 'Giao hàng bởi GHN',
        price: feeData.total,
        estimatedDays: '2-4 ngày',
        supportsCod: true,
        raw: feeData
      }
    } catch (error) {
      return null
    }
  }
}
