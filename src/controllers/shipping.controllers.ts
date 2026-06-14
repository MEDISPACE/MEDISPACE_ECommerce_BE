import { Request, Response } from 'express'
import HTTP_STATUS from '~/constants/httpStatus'
import shippingService from '~/services/shipping.services'

export const shippingController = {
  getRates: async (req: Request, res: Response) => {
    const { toAddress, toWard, toDistrict, toProvince, toDistrictId, toWardCode, weight, orderValue } = req.body

    if (!toAddress || !toDistrict || !toProvince) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: 'Thiếu địa chỉ giao hàng để tính phí vận chuyển.' })
    }

    const result = await shippingService.getRates({
      toAddress,
      toWard,
      toDistrict,
      toProvince,
      toDistrictId: toDistrictId ? Number(toDistrictId) : undefined,
      toWardCode,
      weight: Number(weight) || 1000,
      orderValue: Number(orderValue) || 0
    })

    return res.status(HTTP_STATUS.OK).json({
      message: 'Lấy danh sách phí vận chuyển thành công.',
      result
    })
  }
}
