import axios, { AxiosInstance } from 'axios'
import { config } from 'dotenv'
import { ShippingProvider, ShippingRateOption, ShippingRateRequest } from './shipping.types'

config()

const AHAMOVE_API_URL = process.env.AHAMOVE_API_URL || 'https://partner-apistg.ahamove.com'

const getAhamoveTokens = () => {
  const tokenPool = process.env.AHAMOVE_TOKENS || process.env.AHAMOVE_TOKEN || ''
  return tokenPool
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
}

const getAhamoveServices = () => {
  return (process.env.AHAMOVE_SERVICES || 'BIKE,ECO')
    .split(',')
    .map((service) => service.trim())
    .filter(Boolean)
}

const getFee = (item: any) => {
  const candidates = [item?.total_fee, item?.total_price, item?.fee, item?.price, item?.data?.total_fee]
  const fee = candidates.map(Number).find((value) => Number.isFinite(value))
  return fee ?? null
}

const normalizeAddress = (parts: Array<string | undefined>) => {
  return parts
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(', ')
}

const normalizeLocation = (value?: string) => {
  const normalized = (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(tp|thanh pho|city|province|tinh)\b/g, '')
    .replace(/[^a-z0-9]/g, '')

  const aliases: Record<string, string> = {
    hcm: 'hochiminh',
    tphcm: 'hochiminh',
    hochiminhcity: 'hochiminh',
    hanoi: 'hanoi',
    hn: 'hanoi',
    danang: 'danang',
    dn: 'danang'
  }

  return aliases[normalized] || normalized
}

const shouldLimitToSameProvince = () => {
  return process.env.AHAMOVE_SAME_PROVINCE_ONLY !== 'false'
}

const createPoint = (address: string, name: string, mobile: string, lat?: string, lng?: string) => {
  const point: Record<string, unknown> = { address, name, mobile }
  if (lat && lng) {
    point.lat = Number(lat)
    point.lng = Number(lng)
  }
  return point
}

export class AhamoveShippingProvider implements ShippingProvider {
  readonly provider = 'ahamove' as const
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: AHAMOVE_API_URL,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    })
  }

  private isEnabled() {
    return getAhamoveTokens().length > 0
  }

  private getPickupAddress() {
    return normalizeAddress([
      process.env.AHAMOVE_PICK_ADDRESS || process.env.GHTK_PICK_ADDRESS || process.env.GHN_FROM_ADDRESS,
      process.env.AHAMOVE_PICK_WARD || process.env.GHTK_PICK_WARD || process.env.GHN_FROM_WARD,
      process.env.AHAMOVE_PICK_DISTRICT || process.env.GHTK_PICK_DISTRICT || process.env.GHN_FROM_DISTRICT,
      process.env.AHAMOVE_PICK_PROVINCE || process.env.GHTK_PICK_PROVINCE || process.env.GHN_FROM_PROVINCE
    ])
  }

  private getPickupProvince() {
    return process.env.AHAMOVE_PICK_PROVINCE || process.env.GHTK_PICK_PROVINCE || process.env.GHN_FROM_PROVINCE || ''
  }

  async getRates(payload: ShippingRateRequest): Promise<ShippingRateOption[]> {
    const rates = await Promise.all(getAhamoveServices().map((serviceCode) => this.calculateRate(payload, serviceCode)))
    return rates.filter((rate): rate is ShippingRateOption => Boolean(rate)).sort((a, b) => a.price - b.price)
  }

  async calculateRate(payload: ShippingRateRequest, serviceCode: string = 'BIKE'): Promise<ShippingRateOption | null> {
    if (!this.isEnabled()) return null

    const pickupAddress = this.getPickupAddress()
    const dropoffAddress = normalizeAddress([payload.toAddress, payload.toWard, payload.toDistrict, payload.toProvince])
    const pickupMobile = process.env.AHAMOVE_PICK_MOBILE || process.env.SHOP_PHONE || '0900000000'

    if (!pickupAddress || !dropoffAddress || !pickupMobile) return null

    if (shouldLimitToSameProvince()) {
      const pickupProvince = normalizeLocation(this.getPickupProvince())
      const dropoffProvince = normalizeLocation(payload.toProvince)
      if (pickupProvince && dropoffProvince && pickupProvince !== dropoffProvince) return null
    }

    const requestBody = {
      order_time: 0,
      path: [
        createPoint(
          pickupAddress,
          process.env.AHAMOVE_PICK_NAME || 'MediSpace',
          pickupMobile,
          process.env.AHAMOVE_PICK_LAT,
          process.env.AHAMOVE_PICK_LNG
        ),
        createPoint(
          dropoffAddress,
          process.env.AHAMOVE_DROP_NAME || 'Khach hang MediSpace',
          process.env.AHAMOVE_DROP_MOBILE || pickupMobile,
          undefined,
          undefined
        )
      ],
      group_services: [
        {
          _id: serviceCode,
          group_requests: []
        }
      ],
      payment_method: process.env.AHAMOVE_PAYMENT_METHOD || 'CASH',
      items: [
        {
          _id: 'MEDISPACE_ORDER',
          name: 'MediSpace order',
          num: 1,
          price: Math.max(0, Math.floor(payload.orderValue || 0)),
          weight: Math.max(0.1, Number((payload.weight / 1000).toFixed(2)))
        }
      ],
      package_detail: [
        {
          weight: Math.max(0.1, Number((payload.weight / 1000).toFixed(2))),
          description: 'MediSpace order'
        }
      ]
    }

    for (const [index, token] of getAhamoveTokens().entries()) {
      try {
        const response = await this.client.post('/v3/orders/estimates', requestBody, {
          headers: { Authorization: `Bearer ${token}` }
        })

        const estimate = Array.isArray(response.data) ? response.data[0] : response.data?.data?.[0] || response.data
        const price = getFee(estimate)
        if (!Number.isFinite(price)) continue

        return {
          id: `ahamove:${serviceCode}`,
          provider: this.provider,
          serviceCode,
          name: `Ahamove ${serviceCode}`,
          description: 'Giao hàng bởi Ahamove',
          price: Math.max(0, Number(price)),
          estimatedDays: serviceCode.toUpperCase().includes('EXPRESS') ? '2-4 giờ' : 'Trong ngày',
          supportsCod: false,
          raw: { ...estimate, tokenIndex: index + 1 }
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
