export type ShippingProviderCode = 'ghn' | 'ghtk' | 'ahamove'

export interface ShippingRateRequest {
  toAddress: string
  toWard?: string
  toDistrict: string
  toProvince: string
  toDistrictId?: number
  toWardCode?: string
  weight: number
  orderValue: number
}

export interface ShippingRateOption {
  id: string
  provider: ShippingProviderCode
  serviceCode: string
  name: string
  description: string
  price: number
  estimatedDays: string
  supportsCod?: boolean
  raw?: unknown
}

export interface ShippingProvider {
  readonly provider: ShippingProviderCode
  getRates(payload: ShippingRateRequest): Promise<ShippingRateOption[]>
  calculateRate(payload: ShippingRateRequest, serviceCode?: string): Promise<ShippingRateOption | null>
}
