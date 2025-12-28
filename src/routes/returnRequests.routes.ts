import { Router } from 'express'
import {
    createReturnRequestController,
    getMyReturnRequestsController,
    getReturnRequestByIdController,
    cancelReturnRequestController,
    updateReturnShippingController,
    getAllReturnRequestsController,
    getReturnRequestByIdAdminController,
    reviewReturnRequestController,
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
    updateReturnShippingValidator,
    receiveReturnItemsValidator,
    processRefundValidator
} from '~/middlewares/returnRequests.middlewares'
import { accessTokenValidator } from '~/middlewares/users.middlewares'
import { isAdminOrPharmacist } from '~/middlewares/common.middlewares'
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

/**
 * @swagger
 * /returns/{requestId}/shipping:
 *   patch:
 *     summary: Update return shipping info
 *     tags: [Return Requests]
 *     security:
 *       - bearerAuth: []
 */
returnRequestsRouter.patch(
    '/:requestId/shipping',
    accessTokenValidator,
    requestIdValidator,
    updateReturnShippingValidator,
    wrapRequestHandler(updateReturnShippingController)
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
    isAdminOrPharmacist,
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
    isAdminOrPharmacist,
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
    isAdminOrPharmacist,
    requestIdValidator,
    wrapRequestHandler(getReturnRequestByIdAdminController)
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
    isAdminOrPharmacist,
    requestIdValidator,
    reviewReturnRequestValidator,
    wrapRequestHandler(reviewReturnRequestController)
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
    isAdminOrPharmacist,
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
    isAdminOrPharmacist,
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
    isAdminOrPharmacist,
    requestIdValidator,
    wrapRequestHandler(completeReturnRequestController)
)

export default returnRequestsRouter
