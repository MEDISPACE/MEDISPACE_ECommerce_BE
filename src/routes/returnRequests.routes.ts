import { Router } from 'express'
import {
  createReturnRequestController,
  getMyReturnRequestsController,
  getReturnRequestByIdController,
  getReturnTrackingController,
  cancelReturnRequestController,
  getAllReturnRequestsController,
  getReturnRequestByIdAdminController,
  getReturnTrackingAdminController,
  reviewReturnRequestController,
  arrangeReturnShippingController,
  updateMockReturnTrackingController,
  receiveReturnItemsController,
  processRefundController,
  completeReturnRequestController,
  getReturnRequestStatsController
} from '~/controllers/returnRequests.controllers'
import {
  createReturnRequestValidator,
  requestIdValidator,
  getReturnRequestsValidator,
  reviewReturnRequestValidator,
  arrangeReturnShippingValidator,
  receiveReturnItemsValidator,
  processRefundValidator,
  updateMockReturnTrackingValidator
} from '~/middlewares/returnRequests.middlewares'
import { accessTokenValidator } from '~/middlewares/users.middlewares'
import { isAdmin, isAdminOrLicensedPharmacist } from '~/middlewares/common.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const returnRequestsRouter = Router()

/**
 * @swagger
 * /returns:
 *   post:
 *     summary: Create a new return request
 *     tags: [Return Requests]
 *     security:
 *       - bearerAuth: []
 */
returnRequestsRouter.post(
  '/',
  accessTokenValidator,
  createReturnRequestValidator,
  wrapRequestHandler(createReturnRequestController)
)

/**
 * @swagger
 * /returns:
 *   get:
 *     summary: Get user's return requests
 *     tags: [Return Requests]
 *     security:
 *       - bearerAuth: []
 */
returnRequestsRouter.get(
  '/',
  accessTokenValidator,
  getReturnRequestsValidator,
  wrapRequestHandler(getMyReturnRequestsController)
)

/**
 * @swagger
 * /returns/{requestId}:
 *   get:
 *     summary: Get return request by ID
 *     tags: [Return Requests]
 *     security:
 *       - bearerAuth: []
 */
returnRequestsRouter.get(
  '/:requestId',
  accessTokenValidator,
  requestIdValidator,
  wrapRequestHandler(getReturnRequestByIdController)
)

returnRequestsRouter.get(
  '/:requestId/tracking',
  accessTokenValidator,
  requestIdValidator,
  wrapRequestHandler(getReturnTrackingController)
)

/**
 * @swagger
 * /returns/{requestId}/cancel:
 *   patch:
 *     summary: Cancel return request
 *     tags: [Return Requests]
 *     security:
 *       - bearerAuth: []
 */
returnRequestsRouter.patch(
  '/:requestId/cancel',
  accessTokenValidator,
  requestIdValidator,
  wrapRequestHandler(cancelReturnRequestController)
)

// ==================== ADMIN/PHARMACIST ROUTES ====================

/**
 * @swagger
 * /returns/admin/stats:
 *   get:
 *     summary: Get return request statistics (Admin/Pharmacist)
 *     tags: [Return Requests - Admin]
 *     security:
 *       - bearerAuth: []
 */
returnRequestsRouter.get(
  '/admin/stats',
  accessTokenValidator,
  isAdminOrLicensedPharmacist,
  wrapRequestHandler(getReturnRequestStatsController)
)

/**
 * @swagger
 * /returns/admin/all:
 *   get:
 *     summary: Get all return requests (Admin/Pharmacist)
 *     tags: [Return Requests - Admin]
 *     security:
 *       - bearerAuth: []
 */
returnRequestsRouter.get(
  '/admin/all',
  accessTokenValidator,
  isAdminOrLicensedPharmacist,
  getReturnRequestsValidator,
  wrapRequestHandler(getAllReturnRequestsController)
)

/**
 * @swagger
 * /returns/admin/{requestId}:
 *   get:
 *     summary: Get return request by ID (Admin/Pharmacist)
 *     tags: [Return Requests - Admin]
 *     security:
 *       - bearerAuth: []
 */
returnRequestsRouter.get(
  '/admin/:requestId',
  accessTokenValidator,
  isAdminOrLicensedPharmacist,
  requestIdValidator,
  wrapRequestHandler(getReturnRequestByIdAdminController)
)

returnRequestsRouter.get(
  '/admin/:requestId/tracking',
  accessTokenValidator,
  isAdminOrLicensedPharmacist,
  requestIdValidator,
  wrapRequestHandler(getReturnTrackingAdminController)
)

/**
 * @swagger
 * /returns/admin/{requestId}/review:
 *   patch:
 *     summary: Review return request (approve/reject)
 *     tags: [Return Requests - Admin]
 *     security:
 *       - bearerAuth: []
 */
returnRequestsRouter.patch(
  '/admin/:requestId/review',
  accessTokenValidator,
  isAdminOrLicensedPharmacist,
  requestIdValidator,
  reviewReturnRequestValidator,
  wrapRequestHandler(reviewReturnRequestController)
)

/**
 * @swagger
 * /returns/admin/{requestId}/arrange-return:
 *   patch:
 *     summary: Arrange return pickup/shipping and generate return tracking code
 *     tags: [Return Requests - Admin]
 *     security:
 *       - bearerAuth: []
 */
returnRequestsRouter.patch(
  '/admin/:requestId/arrange-return',
  accessTokenValidator,
  isAdminOrLicensedPharmacist,
  requestIdValidator,
  arrangeReturnShippingValidator,
  wrapRequestHandler(arrangeReturnShippingController)
)

returnRequestsRouter.patch(
  '/admin/:requestId/tracking/mock',
  accessTokenValidator,
  isAdminOrLicensedPharmacist,
  requestIdValidator,
  updateMockReturnTrackingValidator,
  wrapRequestHandler(updateMockReturnTrackingController)
)

/**
 * @swagger
 * /returns/admin/{requestId}/receive:
 *   patch:
 *     summary: Receive return items
 *     tags: [Return Requests - Admin]
 *     security:
 *       - bearerAuth: []
 */
returnRequestsRouter.patch(
  '/admin/:requestId/receive',
  accessTokenValidator,
  isAdminOrLicensedPharmacist,
  requestIdValidator,
  receiveReturnItemsValidator,
  wrapRequestHandler(receiveReturnItemsController)
)

/**
 * @swagger
 * /returns/admin/{requestId}/refund:
 *   patch:
 *     summary: Process refund
 *     tags: [Return Requests - Admin]
 *     security:
 *       - bearerAuth: []
 */
returnRequestsRouter.patch(
  '/admin/:requestId/refund',
  accessTokenValidator,
  isAdmin,
  requestIdValidator,
  processRefundValidator,
  wrapRequestHandler(processRefundController)
)

/**
 * @swagger
 * /returns/admin/{requestId}/complete:
 *   patch:
 *     summary: Complete return request
 *     tags: [Return Requests - Admin]
 *     security:
 *       - bearerAuth: []
 */
returnRequestsRouter.patch(
  '/admin/:requestId/complete',
  accessTokenValidator,
  isAdmin,
  requestIdValidator,
  wrapRequestHandler(completeReturnRequestController)
)

export default returnRequestsRouter
