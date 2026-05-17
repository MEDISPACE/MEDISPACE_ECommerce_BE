import { Request, Response } from 'express'
import { ghnService } from '~/services/ghn.services'
import HTTP_STATUS from '~/constants/httpStatus'
import { GHN_MESSAGES } from '~/constants/ghn'

export const ghnController = {
  getProvinces: async (req: Request, res: Response) => {
    try {
      const result = await ghnService.getProvinces()
      return res.status(HTTP_STATUS.OK).json({
        message: GHN_MESSAGES.GET_PROVINCES_SUCCESS,
        result
      })
    } catch (error) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        message: GHN_MESSAGES.GET_PROVINCES_FAILED
      })
    }
  },

  getDistricts: async (req: Request, res: Response) => {
    try {
      const provinceId = Number(req.query.province_id)

      if (!provinceId || isNaN(provinceId)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          message: GHN_MESSAGES.INVALID_PROVINCE_ID
        })
      }

      const result = await ghnService.getDistricts(provinceId)
      return res.status(HTTP_STATUS.OK).json({
        message: GHN_MESSAGES.GET_DISTRICTS_SUCCESS,
        result
      })
    } catch (error) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        message: GHN_MESSAGES.GET_DISTRICTS_FAILED
      })
    }
  },

  getWards: async (req: Request, res: Response) => {
    try {
      const districtId = Number(req.query.district_id)

      if (!districtId || isNaN(districtId)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          message: GHN_MESSAGES.INVALID_DISTRICT_ID
        })
      }

      const result = await ghnService.getWards(districtId)
      return res.status(HTTP_STATUS.OK).json({
        message: GHN_MESSAGES.GET_WARDS_SUCCESS,
        result
      })
    } catch (error) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        message: GHN_MESSAGES.GET_WARDS_FAILED
      })
    }
  },

  calculateFee: async (req: Request, res: Response) => {
    try {
      const { to_district_id, to_ward_code, weight } = req.body

      if (!to_district_id || !to_ward_code) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          message: GHN_MESSAGES.MISSING_REQUIRED_FIELDS
        })
      }

      const result = await ghnService.calculateFee(req.body)
      return res.status(HTTP_STATUS.OK).json({
        message: GHN_MESSAGES.CALCULATE_FEE_SUCCESS,
        result
      })
    } catch (error) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        message: GHN_MESSAGES.CALCULATE_FEE_FAILED
      })
    }
  },

  getShippingOptions: async (req: Request, res: Response) => {
    try {
      const { to_district_id, to_ward_code, weight } = req.body

      if (!to_district_id || !to_ward_code) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          message: GHN_MESSAGES.MISSING_REQUIRED_FIELDS
        })
      }

      const result = await ghnService.getShippingOptions({
        to_district_id,
        to_ward_code,
        weight: weight || 1000
      })

      return res.status(HTTP_STATUS.OK).json({
        message: GHN_MESSAGES.GET_SHIPPING_OPTIONS_SUCCESS,
        result
      })
    } catch (error) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        message: GHN_MESSAGES.GET_SHIPPING_OPTIONS_FAILED
      })
    }
  }
}
