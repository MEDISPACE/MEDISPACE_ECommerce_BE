import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import { ObjectId } from 'mongodb'
import productsService from '~/services/products.services'
import { CreateProductReqBody, UpdateProductReqBody, GetProductsQuery } from '~/models/requests/Product.request'
import { PRODUCTS_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'
import { TokenPayload } from '~/models/requests/User.request'

// Create product
export const createProductController = async (
  req: Request<ParamsDictionary, unknown, CreateProductReqBody>,
  res: Response
) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const result = await productsService.createProduct(req.body, new ObjectId(userId))
  return res.status(HTTP_STATUS.CREATED).json({
    message: PRODUCTS_MESSAGES.CREATE_PRODUCT_SUCCESS,
    result
  })
}

// Get products with pagination and filters
export const getProductsController = async (
  req: Request<ParamsDictionary, unknown, unknown, GetProductsQuery>,
  res: Response
) => {
  const result = await productsService.getProducts(req.query)
  return res.status(HTTP_STATUS.OK).json({
    message: PRODUCTS_MESSAGES.GET_PRODUCTS_SUCCESS,
    result
  })
}

// Get product by ID with populated data
export const getProductByIdController = async (req: Request<{ productId: string }>, res: Response) => {
  const result = await productsService.getProductById(req.params.productId)
  return res.status(HTTP_STATUS.OK).json({
    message: PRODUCTS_MESSAGES.GET_PRODUCT_SUCCESS,
    result
  })
}

// Update product
export const updateProductController = async (
  req: Request<{ productId: string }, unknown, UpdateProductReqBody>,
  res: Response
) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const result = await productsService.updateProduct(req.params.productId, req.body, new ObjectId(userId))
  return res.status(HTTP_STATUS.OK).json({
    message: PRODUCTS_MESSAGES.UPDATE_PRODUCT_SUCCESS,
    result
  })
}

// Toggle product status (active/inactive)
export const toggleProductStatusController = async (
  req: Request<{ productId: string }, unknown, { isActive: boolean }>,
  res: Response
) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const result = await productsService.toggleProductStatus(
    req.params.productId,
    req.body.isActive,
    new ObjectId(userId)
  )
  return res.status(HTTP_STATUS.OK).json({
    message: PRODUCTS_MESSAGES.TOGGLE_PRODUCT_STATUS_SUCCESS,
    result
  })
}

// Update stock quantity
export const updateStockController = async (
  req: Request<{ productId: string }, unknown, { stockQuantity: number }>,
  res: Response
) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const result = await productsService.updateStock(req.params.productId, req.body.stockQuantity, new ObjectId(userId))
  return res.status(HTTP_STATUS.OK).json({
    message: PRODUCTS_MESSAGES.UPDATE_PRODUCT_SUCCESS,
    result
  })
}

// Delete product
export const deleteProductController = async (req: Request<{ productId: string }>, res: Response) => {
  const result = await productsService.deleteProduct(req.params.productId)
  return res.status(HTTP_STATUS.OK).json(result)
}
