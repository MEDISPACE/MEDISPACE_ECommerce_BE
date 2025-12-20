import { Request, Response } from 'express'
import { ghnService } from '~/services/ghn.services'
import HTTP_STATUS from '~/constants/httpStatus'

export const ghnController = {
    getProvinces: async (req: Request, res: Response) => {
        try {
            const data = await ghnService.getProvinces()
            return res.status(HTTP_STATUS.OK).json({
                message: 'Get provinces successfully',
                data
            })
        } catch (error) {
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                message: 'Error fetching provinces',
                error
            })
        }
    },

    getDistricts: async (req: Request, res: Response) => {
        try {
            const provinceId = Number(req.query.province_id)
            if (!provinceId) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    message: 'province_id is required'
                })
            }
            const data = await ghnService.getDistricts(provinceId)
            return res.status(HTTP_STATUS.OK).json({
                message: 'Get districts successfully',
                data
            })
        } catch (error) {
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                message: 'Error fetching districts',
                error
            })
        }
    },

    getWards: async (req: Request, res: Response) => {
        try {
            const districtId = Number(req.query.district_id)
            if (!districtId) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    message: 'district_id is required'
                })
            }
            const data = await ghnService.getWards(districtId)
            return res.status(HTTP_STATUS.OK).json({
                message: 'Get wards successfully',
                data
            })
        } catch (error) {
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                message: 'Error fetching wards',
                error
            })
        }
    },

    calculateFee: async (req: Request, res: Response) => {
        try {
            const { to_district_id, to_ward_code, weight, insurance_value } = req.body
            if (!to_district_id || !to_ward_code || !weight) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    message: 'Missing required fields: to_district_id, to_ward_code, weight'
                })
            }

            const data = await ghnService.calculateFee({
                to_district_id,
                to_ward_code,
                weight,
                insurance_value
            })

            return res.status(HTTP_STATUS.OK).json({
                message: 'Calculate fee successfully',
                data
            })
        } catch (error) {
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                message: 'Error calculating fee',
                error
            })
        }
    }
}
