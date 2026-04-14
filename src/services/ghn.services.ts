import axios from 'axios'
import { config } from 'dotenv'

config()

const GHN_API_URL = process.env.GHN_API_URL || 'https://online-gateway.ghn.vn/shiip/public-api'
const GHN_API_TOKEN = process.env.GHN_TOKEN
const GHN_SHOP_ID = Number(process.env.GHN_SHOP_ID)

class GHNService {
  private client
  private shopDistrictId: number | null = null

  constructor() {
    this.client = axios.create({
      baseURL: GHN_API_URL,
      headers: {
        'Content-Type': 'application/json',
        Token: GHN_API_TOKEN,
        ShopId: GHN_SHOP_ID
      }
    })
  }

  private async getFromDistrictId(): Promise<number> {
    if (process.env.GHN_FROM_DISTRICT_ID) {
      return Number(process.env.GHN_FROM_DISTRICT_ID)
    }
    return 3695
  }

  private getFromWardCode(): string {
    return process.env.GHN_FROM_WARD_CODE || ''
  }

  async getProvinces() {
    const response = await this.client.get('/master-data/province')
    return response.data.data
  }

  async getDistricts(provinceId: number) {
    const response = await this.client.get('/master-data/district', {
      params: { province_id: provinceId }
    })
    return response.data.data
  }

  async getWards(districtId: number) {
    const response = await this.client.get('/master-data/ward', {
      params: { district_id: districtId }
    })
    return response.data.data
  }

  async calculateFee(payload: {
    to_district_id: number
    to_ward_code: string
    weight: number
    service_id?: number
    service_type_id?: number
    insurance_value?: number
  }) {
    try {
      const fromDistrictId = await this.getFromDistrictId()

      const finalPayload: any = {
        ...payload,
        from_district_id: fromDistrictId,
        shop_id: GHN_SHOP_ID,
        weight: payload.weight && payload.weight > 0 ? payload.weight : 1000,
        length: 20,
        width: 15,
        height: 10
      }

      const response = await this.client.post('/v2/shipping-order/fee', finalPayload)
      return response.data.data
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message
      if (!msg.includes('Cân nặng không hợp lệ')) {
        console.warn(`Fee calculation failed for service ${payload.service_id}:`, msg)
      }
      throw error
    }
  }

  async getAvailableServices(toDistrictId: number) {
    try {
      const fromDistrictId = await this.getFromDistrictId()
      const response = await this.client.post('/v2/shipping-order/available-services', {
        shop_id: GHN_SHOP_ID,
        from_district: fromDistrictId,
        to_district: toDistrictId
      })
      return response.data.data
    } catch (error) {
      return []
    }
  }

  async getLeadTime(toDistrictId: number, toWardCode: string, serviceId: number) {
    try {
      const fromDistrictId = await this.getFromDistrictId()
      const fromWardCode = this.getFromWardCode()

      const body = {
        shop_id: GHN_SHOP_ID,
        from_district_id: fromDistrictId,
        from_ward_code: fromWardCode,
        to_district_id: toDistrictId,
        to_ward_code: toWardCode,
        service_id: serviceId
      }

      const response = await this.client.post('/v2/shipping-order/leadtime', body)
      return response.data.data
    } catch (error: any) {
      return null
    }
  }

  async getShippingOptions(payload: { to_district_id: number; to_ward_code: string; weight: number }) {
    const services = await this.getAvailableServices(payload.to_district_id)

    if (!services || services.length === 0) {
      return []
    }

    const fromDistrictId = await this.getFromDistrictId()

    const promises = services.map(async (service: any) => {
      try {
        const [feeData, leadTimeData] = await Promise.all([
          this.calculateFee({
            to_district_id: payload.to_district_id,
            to_ward_code: payload.to_ward_code,
            weight: payload.weight,
            service_id: service.service_id
          }).catch(() => null),

          this.getLeadTime(payload.to_district_id, payload.to_ward_code, service.service_id).catch(() => null)
        ])

        if (!feeData) return null

        let estimatedDateStr = '3-5 ngày'

        if (leadTimeData && leadTimeData.leadtime > 0) {
          const date = new Date(leadTimeData.leadtime * 1000)
          estimatedDateStr = date.toLocaleDateString('vi-VN', {
            weekday: 'short',
            day: 'numeric',
            month: 'numeric'
          })
        } else {
          if (payload.to_district_id === fromDistrictId) {
            estimatedDateStr = '1-2 ngày'
          } else {
            estimatedDateStr = '2-4 ngày'
          }
        }

        return {
          id: service.service_id,
          name: service.short_name,
          price: feeData.total,
          description: `GHN ${service.short_name}`,
          estimatedDays: estimatedDateStr,
          leadTimeUnix: leadTimeData?.leadtime
        }
      } catch (e) {
        return null
      }
    })

    const results = await Promise.all(promises)
    return results.filter((r) => r !== null).sort((a: any, b: any) => a.price - b.price)
  }
}

export const ghnService = new GHNService()
