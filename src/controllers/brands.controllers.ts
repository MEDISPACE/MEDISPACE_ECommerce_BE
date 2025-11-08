import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import brandsService from '~/services/brands.services'
import { CreateBrandReqBody, UpdateBrandReqBody, GetBrandsQuery } from '~/models/requests/Product.request'
import { BRANDS_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'

// Create brand
export const createBrandController = async (
  req: Request<ParamsDictionary, unknown, CreateBrandReqBody>,
  res: Response
) => {
  const result = await brandsService.createBrand(req.body)
  return res.status(HTTP_STATUS.CREATED).json({
    message: BRANDS_MESSAGES.CREATE_BRAND_SUCCESS,
    result
  })
}

// Get brands with pagination and filters
export const getBrandsController = async (
  req: Request<ParamsDictionary, unknown, unknown, GetBrandsQuery>,
  res: Response
) => {
  const result = await brandsService.getBrands(req.query)
  return res.status(HTTP_STATUS.OK).json({
    message: BRANDS_MESSAGES.GET_BRANDS_SUCCESS,
    result
  })
}

// Get brand by ID
export const getBrandByIdController = async (req: Request<{ brandId: string }>, res: Response) => {
  const result = await brandsService.getBrandById(req.params.brandId)
  return res.status(HTTP_STATUS.OK).json({
    message: BRANDS_MESSAGES.GET_BRAND_SUCCESS,
    result
  })
}

// Update brand
export const updateBrandController = async (
  req: Request<{ brandId: string }, unknown, UpdateBrandReqBody>,
  res: Response
) => {
  const result = await brandsService.updateBrand(req.params.brandId, req.body)
  return res.status(HTTP_STATUS.OK).json({
    message: BRANDS_MESSAGES.UPDATE_BRAND_SUCCESS,
    result
  })
}

// Toggle brand status (active/inactive)
export const toggleBrandStatusController = async (
  req: Request<{ brandId: string }, unknown, { isActive: boolean }>,
  res: Response
) => {
  const result = await brandsService.toggleBrandStatus(req.params.brandId, req.body.isActive)
  return res.status(HTTP_STATUS.OK).json({
    message: BRANDS_MESSAGES.TOGGLE_BRAND_STATUS_SUCCESS,
    result
  })
}

// Delete brand
export const deleteBrandController = async (req: Request<{ brandId: string }>, res: Response) => {
  const result = await brandsService.deleteBrand(req.params.brandId)
  return res.status(HTTP_STATUS.OK).json(result)
}
