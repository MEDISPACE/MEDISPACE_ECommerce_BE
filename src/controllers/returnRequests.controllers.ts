import { Request, Response } from 'express'
import { ObjectId } from 'mongodb'
import returnRequestService from '~/services/returnRequests.services'
import { RETURN_REQUESTS_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'

// Customer Controllers

/**
 * Create return request
 * POST /returns
 */
export const createReturnRequestController = async (req: Request, res: Response) => {
  const userId = new ObjectId(req.decoded_authorization?.userId)
  const result = await returnRequestService.createReturnRequest(userId, req.body)

  return res.status(HTTP_STATUS.CREATED).json({
    message: RETURN_REQUESTS_MESSAGES.CREATE_REQUEST_SUCCESS,
    result
  })
}

/**
 * Get user's return requests
 * GET /returns
 */
export const getMyReturnRequestsController = async (req: Request, res: Response) => {
  const userId = new ObjectId(req.decoded_authorization?.userId)
  const { page, limit, status } = req.query

  const result = await returnRequestService.getReturnRequests({
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 10,
    status: status as any,
    userId
  })

  return res.json({
    message: RETURN_REQUESTS_MESSAGES.GET_REQUESTS_SUCCESS,
    result
  })
}

/**
 * Get return request by ID
 * GET /returns/:requestId
 */
export const getReturnRequestByIdController = async (req: Request, res: Response) => {
  const userId = new ObjectId(req.decoded_authorization?.userId)
  const requestId = new ObjectId(req.params.requestId)

  const result = await returnRequestService.getReturnRequestById(requestId, userId)

  return res.json({
    message: RETURN_REQUESTS_MESSAGES.GET_REQUEST_SUCCESS,
    result
  })
}

/**
 * Cancel return request
 * PATCH /returns/:requestId/cancel
 */
export const cancelReturnRequestController = async (req: Request, res: Response) => {
  const userId = new ObjectId(req.decoded_authorization?.userId)
  const requestId = new ObjectId(req.params.requestId)

  const result = await returnRequestService.cancelReturnRequest(requestId, userId)

  return res.json(result)
}

/**
 * Update return shipping info
 * PATCH /returns/:requestId/shipping
 */
export const updateReturnShippingController = async (req: Request, res: Response) => {
  const userId = new ObjectId(req.decoded_authorization?.userId)
  const requestId = new ObjectId(req.params.requestId)
  const { trackingNumber, carrier } = req.body

  const result = await returnRequestService.updateReturnShipping(requestId, userId, trackingNumber, carrier)

  return res.json({
    message: RETURN_REQUESTS_MESSAGES.UPDATE_REQUEST_SUCCESS,
    result
  })
}

// Admin/Pharmacist Controllers

/**
 * Get all return requests (admin/pharmacist)
 * GET /admin/returns
 */
export const getAllReturnRequestsController = async (req: Request, res: Response) => {
  const { page, limit, status } = req.query

  const result = await returnRequestService.getReturnRequests({
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 20,
    status: status as any
  })

  return res.json({
    message: RETURN_REQUESTS_MESSAGES.GET_REQUESTS_SUCCESS,
    result
  })
}

/**
 * Get return request by ID (admin/pharmacist - no user check)
 * GET /admin/returns/:requestId
 */
export const getReturnRequestByIdAdminController = async (req: Request, res: Response) => {
  const requestId = new ObjectId(req.params.requestId)

  const result = await returnRequestService.getReturnRequestById(requestId)

  return res.json({
    message: RETURN_REQUESTS_MESSAGES.GET_REQUEST_SUCCESS,
    result
  })
}

/**
 * Review return request (approve/reject)
 * PATCH /admin/returns/:requestId/review
 */
export const reviewReturnRequestController = async (req: Request, res: Response) => {
  const reviewerId = new ObjectId(req.decoded_authorization?.user_id)
  const requestId = new ObjectId(req.params.requestId)

  const result = await returnRequestService.reviewReturnRequest(requestId, reviewerId, req.body)

  const message =
    req.body.status === 'approved'
      ? RETURN_REQUESTS_MESSAGES.APPROVE_REQUEST_SUCCESS
      : RETURN_REQUESTS_MESSAGES.REJECT_REQUEST_SUCCESS

  return res.json({
    message,
    result
  })
}

/**
 * Receive return items
 * PATCH /admin/returns/:requestId/receive
 */
export const receiveReturnItemsController = async (req: Request, res: Response) => {
  const requestId = new ObjectId(req.params.requestId)

  const result = await returnRequestService.receiveReturnItems(requestId, req.body)

  return res.json({
    message: RETURN_REQUESTS_MESSAGES.RECEIVE_ITEMS_SUCCESS,
    result
  })
}

/**
 * Process refund
 * PATCH /admin/returns/:requestId/refund
 */
export const processRefundController = async (req: Request, res: Response) => {
  const requestId = new ObjectId(req.params.requestId)

  const result = await returnRequestService.processRefund(requestId, req.body)

  return res.json({
    message: RETURN_REQUESTS_MESSAGES.PROCESS_REFUND_SUCCESS,
    result
  })
}

/**
 * Complete return request
 * PATCH /admin/returns/:requestId/complete
 */
export const completeReturnRequestController = async (req: Request, res: Response) => {
  const requestId = new ObjectId(req.params.requestId)

  const result = await returnRequestService.completeReturnRequest(requestId)

  return res.json({
    message: RETURN_REQUESTS_MESSAGES.COMPLETE_REQUEST_SUCCESS,
    result
  })
}

/**
 * Get return request statistics
 * GET /admin/returns/stats
 */
export const getReturnRequestStatsController = async (req: Request, res: Response) => {
  const result = await returnRequestService.getReturnRequestStats()

  return res.json({
    message: RETURN_REQUESTS_MESSAGES.GET_REQUEST_STATS_SUCCESS,
    result
  })
}
