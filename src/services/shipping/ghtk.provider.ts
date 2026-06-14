import axios, { AxiosInstance } from 'axios'
import { config } from 'dotenv'
import { ShippingProvider, ShippingRateOption, ShippingRateRequest } from './shipping.types'

config()

const GHTK_API_URL = process.env.GHTK_API_URL || 'https://services.giaohangtietkiem.vn'

const getGHTKTokens = () => {
  const tokenPool = process.env.GHTK_TOKENS || process.env.GHTK_TOKEN || ''
  return tokenPool
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
}

export class GHTKShippingProvider implements ShippingProvider {
  readonly provider = 'ghtk' as const
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: GHTK_API_URL,
      headers: {
        'X-Client-Source': process.env.GHTK_CLIENT_SOURCE || 'MediSpace'
      },
      timeout: 10000
    })
  }

  private isEnabled() {
    return getGHTKTokens().length > 0
  }

  private getPickupAddress() {
    return {
      pick_address: process.env.GHTK_PICK_ADDRESS || process.env.GHN_FROM_ADDRESS || '',
      pick_ward: process.env.GHTK_PICK_WARD || process.env.GHN_FROM_WARD || '',
      pick_district: process.env.GHTK_PICK_DISTRICT || process.env.GHN_FROM_DISTRICT || '',
      pick_province: process.env.GHTK_PICK_PROVINCE || process.env.GHN_FROM_PROVINCE || ''
    }
  }

  async getRates(payload: ShippingRateRequest): Promise<ShippingRateOption[]> {
    const rates = await Promise.all([this.calculateRate(payload, 'road'), this.calculateRate(payload, 'fly')])

    return rates.filter((rate): rate is ShippingRateOption => Boolean(rate)).sort((a, b) => a.price - b.price)
  }

  async calculateRate(payload: ShippingRateRequest, serviceCode: string = 'road'): Promise<ShippingRateOption | null> {
    if (!this.isEnabled()) return null

    const pickup = this.getPickupAddress()
    if (!pickup.pick_province || !pickup.pick_district) return null

    const params = {
      ...pickup,
      address: payload.toAddress,
      ward: payload.toWard,
      district: payload.toDistrict,
      province: payload.toProvince,
      weight: Math.max(1, Math.ceil(payload.weight)),
      value: Math.max(0, Math.floor(payload.orderValue || 0)),
      transport: serviceCode
    }

    for (const [index, token] of getGHTKTokens().entries()) {
      try {
        const response = await this.client.get('/services/shipment/fee', {
          headers: { Token: token },
          params
        })

        const fee = response.data?.fee
        const price = Number(fee?.fee)
        if (!response.data?.success || !Number.isFinite(price)) continue

        const isAir = serviceCode === 'fly'
        return {
          id: `ghtk:${serviceCode}`,
          provider: this.provider,
          serviceCode,
          name: isAir ? 'GHTK bay' : 'GHTK đường bộ',
          description: isAir ? 'Giao Hàng Tiết Kiệm tuyến bay' : 'Giao Hàng Tiết Kiệm đường bộ',
          price: Math.max(0, price),
          estimatedDays: isAir ? '1-2 ngày' : '2-4 ngày',
          supportsCod: true,
          raw: { ...fee, tokenIndex: index + 1 }
        }
      } catch (error: any) {
        if (![401, 403].includes(error?.response?.status)) {
          continue
        }
      }
    }

    return null
  }
}
