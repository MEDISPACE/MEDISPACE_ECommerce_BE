import { Router } from 'express'
import {
  createBrandController,
  getBrandsController,
  getBrandByIdController,
  updateBrandController,
  toggleBrandStatusController,
  deleteBrandController
} from '~/controllers/brands.controllers'
import {
  createBrandValidator,
  updateBrandValidator,
  getBrandsValidator,
  brandIdValidator,
  toggleBrandStatusValidator
} from '~/middlewares/brands.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const brandsRouter = Router()

/**
 * Description: Create a new brand
 * Path: /brands
 * Method: POST
 * Body: CreateBrandReqBody
 * Headers: { Authorization: Bearer <access_token> } (Admin only - to be implemented)
 */
brandsRouter.post('/', createBrandValidator, wrapRequestHandler(createBrandController))

/**
 * Description: Get brands with pagination and filters
 * Path: /brands
 * Method: GET
 * Query: { page?, limit?, isActive?, search?, country?, sortBy?, sortOrder? }
 */
brandsRouter.get('/', getBrandsValidator, wrapRequestHandler(getBrandsController))

/**
 * Description: Get brand by ID
 * Path: /brands/:brandId
 * Method: GET
 * Params: { brandId: string }
 */
brandsRouter.get('/:brandId', brandIdValidator, wrapRequestHandler(getBrandByIdController))

/**
 * Description: Update brand
 * Path: /brands/:brandId
 * Method: PATCH
 * Params: { brandId: string }
 * Body: UpdateBrandReqBody
 * Headers: { Authorization: Bearer <access_token> } (Admin only - to be implemented)
 */
brandsRouter.patch('/:brandId', brandIdValidator, updateBrandValidator, wrapRequestHandler(updateBrandController))

/**
 * Description: Toggle brand status (active/inactive)
 * Path: /brands/:brandId/toggle-status
 * Method: PATCH
 * Params: { brandId: string }
 * Body: { isActive: boolean }
 * Headers: { Authorization: Bearer <access_token> } (Admin/Pharmacist - to be implemented)
 */
brandsRouter.patch(
  '/:brandId/toggle-status',
  brandIdValidator,
  toggleBrandStatusValidator,
  wrapRequestHandler(toggleBrandStatusController)
)

/**
 * Description: Delete brand
 * Path: /brands/:brandId
 * Method: DELETE
 * Params: { brandId: string }
 * Headers: { Authorization: Bearer <access_token> } (Admin only - to be implemented)
 */
brandsRouter.delete('/:brandId', brandIdValidator, wrapRequestHandler(deleteBrandController))

export default brandsRouter
