import axios from 'axios'
import { config } from 'dotenv'

config()

const GHN_API_URL = process.env.GHN_API_URL || 'https://online-gateway.ghn.vn/shiip/public-api'
const GHN_API_TOKEN = process.env.GHN_TOKEN
const GHN_SHOP_ID = Number(process.env.GHN_SHOP_ID)

class GHNService {
    private client

    constructor() {
        console.log('GHN Service Initialized')
        console.log('API URL:', GHN_API_URL)
        console.log('Token:', GHN_API_TOKEN ? `${GHN_API_TOKEN.substring(0, 5)}...` : 'Missing')
        console.log('ShopID:', GHN_SHOP_ID)

        this.client = axios.create({
            baseURL: GHN_API_URL,
            headers: {
                'Content-Type': 'application/json',
                Token: GHN_API_TOKEN,
                ShopId: GHN_SHOP_ID
            }
        })
    }

    async getProvinces() {
        try {
            const response = await this.client.get('/master-data/province')
            return response.data.data
        } catch (error) {
            console.error('Error fetching provinces:', error)
            throw error
        }
    }

    async getDistricts(provinceId: number) {
        try {
            const response = await this.client.get('/master-data/district', {
                params: { province_id: provinceId }
            })
            return response.data.data
        } catch (error) {
            console.error('Error fetching districts:', error)
            throw error
        }
    }

    async getWards(districtId: number) {
        try {
            const response = await this.client.get('/master-data/ward', {
                params: { district_id: districtId }
            })
            return response.data.data
        } catch (error) {
            console.error('Error fetching wards:', error)
            throw error
        }
    }

    async calculateFee(payload: {
        to_district_id: number
        to_ward_code: string
        weight: number // gram
        service_id?: number
        service_type_id?: number // 2: Standard
        insurance_value?: number
    }) {
        try {
            // Default to Standard Service (service_type_id = 2) if not provided
            const finalPayload = {
                ...payload,
                service_type_id: payload.service_type_id || 2,
                from_district_id: Number(process.env.GHN_FROM_DISTRICT_ID) || 1454, // Example: District 12
                shop_id: GHN_SHOP_ID
            }
            const response = await this.client.post('/v2/shipping-order/fee', finalPayload)
            return response.data.data
        } catch (error) {
            console.error('Error calculating fee:', error)
            throw error
        }
    }
}

export const ghnService = new GHNService()
