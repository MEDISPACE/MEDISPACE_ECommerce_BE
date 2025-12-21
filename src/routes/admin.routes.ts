
import { Router } from 'express'
import {
    getDashboardStatsController,
    getRecentActivitiesController,
    getUserStatsController,
    getAllUsersController,
    createUserController,
    updateUserController,
    deleteUserController,
    resetUserPasswordController,
    verifyUserEmailController,
    getOrderStatsController,
    getAllOrdersController,
    getOrderDetailsController,
    updateOrderStatusController,
    getAllPrescriptionsController,
    getPrescriptionStatsController,
    updatePrescriptionStatusController,
    bulkUpdatePrescriptionsController,
    getPharmacistStatsController,
    getReportsAnalyticsController,
    getRevenueAnalyticsController,
    getProductAnalyticsController,
    getCustomerAnalyticsController
} from '~/controllers/admin.controllers'
import { accessTokenValidator, verifiedUserValidator } from '~/middlewares/users.middlewares'
import { adminRequired } from '~/middlewares/admin.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const adminRouter = Router()

// ==================== DASHBOARD ====================

/**
 * Description: Get dashboard statistics
 * Path: /admin/dashboard/stats
 * Method: GET
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
adminRouter.get(
    '/dashboard/stats',
    accessTokenValidator,
    verifiedUserValidator,
    adminRequired,
    wrapRequestHandler(getDashboardStatsController)
)

/**
 * Description: Get recent activities
 * Path: /admin/dashboard/recent-activities
 * Method: GET
 * Query: { limit?: number }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
adminRouter.get(
    '/dashboard/recent-activities',
    accessTokenValidator,
    verifiedUserValidator,
    adminRequired,
    wrapRequestHandler(getRecentActivitiesController)
)

// ==================== USER MANAGEMENT ====================

/**
 * Description: Get user statistics
 * Path: /admin/users/stats
 * Method: GET
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
adminRouter.get(
    '/users/stats',
    accessTokenValidator,
    verifiedUserValidator,
    adminRequired,
    wrapRequestHandler(getUserStatsController)
)

/**
 * Description: Get pharmacist statistics
 * Path: /admin/users/pharmacists/stats
 * Method: GET
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
adminRouter.get(
    '/users/pharmacists/stats',
    accessTokenValidator,
    verifiedUserValidator,
    adminRequired,
    wrapRequestHandler(getPharmacistStatsController)
)

/**
 * Description: Get all users with pagination and filters
 * Path: /admin/users
 * Method: GET
 * Query: { page, limit, role, status, verified, search, sortBy, sortOrder }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
adminRouter.get(
    '/users',
    accessTokenValidator,
    verifiedUserValidator,
    adminRequired,
    wrapRequestHandler(getAllUsersController)
)

/**
 * Description: Create new user
 * Path: /admin/users
 * Method: POST
 * Body: { email, password, firstName, lastName, phoneNumber, role, gender }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
adminRouter.post(
    '/users',
    accessTokenValidator,
    verifiedUserValidator,
    adminRequired,
    wrapRequestHandler(createUserController)
)

/**
 * Description: Update user
 * Path: /admin/users/:userId
 * Method: PATCH
 * Body: Partial<User>
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
adminRouter.patch(
    '/users/:userId',
    accessTokenValidator,
    verifiedUserValidator,
    adminRequired,
    wrapRequestHandler(updateUserController)
)

/**
 * Description: Delete user
 * Path: /admin/users/:userId
 * Method: DELETE
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
adminRouter.delete(
    '/users/:userId',
    accessTokenValidator,
    verifiedUserValidator,
    adminRequired,
    wrapRequestHandler(deleteUserController)
)

/**
 * Description: Reset user password
 * Path: /admin/users/:userId/reset-password
 * Method: PATCH
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
adminRouter.patch(
    '/users/:userId/reset-password',
    accessTokenValidator,
    verifiedUserValidator,
    adminRequired,
    wrapRequestHandler(resetUserPasswordController)
)

/**
 * Description: Verify user email manually
 * Path: /admin/users/:userId/verify-email
 * Method: PATCH
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
adminRouter.patch(
    '/users/:userId/verify-email',
    accessTokenValidator,
    verifiedUserValidator,
    adminRequired,
    wrapRequestHandler(verifyUserEmailController)
)

// ==================== ORDER MANAGEMENT ====================
/**
 * Description: Get order statistics
 * Path: /admin/orders/stats
 * Method: GET
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
adminRouter.get(
    '/orders/stats',
    accessTokenValidator,
    verifiedUserValidator,
    adminRequired,
    wrapRequestHandler(getOrderStatsController)
)
/**
 * Description: Get all orders with filters
 * Path: /admin/orders
 * Method: GET
 * Query: { page, limit, status, paymentStatus, search, dateFrom, dateTo }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
adminRouter.get(
    '/orders',
    accessTokenValidator,
    verifiedUserValidator,
    adminRequired,
    wrapRequestHandler(getAllOrdersController)
)
/**
 * Description: Get order details
 * Path: /admin/orders/:orderId
 * Method: GET
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
adminRouter.get(
    '/orders/:orderId',
    accessTokenValidator,
    verifiedUserValidator,
    adminRequired,
    wrapRequestHandler(getOrderDetailsController)
)
/**
 * Description: Update order status
 * Path: /admin/orders/:orderId/status
 * Method: PATCH
 * Body: { status, notes?, trackingNumber? }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
adminRouter.patch(
    '/orders/:orderId/status',
    accessTokenValidator,
    verifiedUserValidator,
    adminRequired,
    wrapRequestHandler(updateOrderStatusController)
)

export default adminRouter

// ==================== PRESCRIPTION MANAGEMENT ====================

/**
 * Description: Get prescription statistics
 * Path: /admin/prescriptions/stats
 * Method: GET
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
adminRouter.get(
    '/prescriptions/stats',
    accessTokenValidator,
    verifiedUserValidator,
    adminRequired,
    wrapRequestHandler(getPrescriptionStatsController)
)

/**
 * Description: Get all prescriptions
 * Path: /admin/prescriptions
 * Method: GET
 * Query: { page?, limit?, status?, search? }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
adminRouter.get(
    '/prescriptions',
    accessTokenValidator,
    verifiedUserValidator,
    adminRequired,
    wrapRequestHandler(getAllPrescriptionsController)
)

/**
 * Description: Update prescription status
 * Path: /admin/prescriptions/:prescriptionId/status
 * Method: PATCH
 * Body: { status, notes? }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
adminRouter.patch(
    '/prescriptions/:prescriptionId/status',
    accessTokenValidator,
    verifiedUserValidator,
    adminRequired,
    wrapRequestHandler(updatePrescriptionStatusController)
)

/**
 * Description: Bulk update prescriptions
 * Path: /admin/prescriptions/bulk-update
 * Method: PATCH
 * Body: { prescriptionIds: string[], status: string }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
adminRouter.patch(
    '/prescriptions/bulk-update',
    accessTokenValidator,
    verifiedUserValidator,
    adminRequired,
    wrapRequestHandler(bulkUpdatePrescriptionsController)
)

// ==================== REPORTS & ANALYTICS ====================

/**
 * Description: Get comprehensive reports analytics
 * Path: /admin/reports/analytics
 * Method: GET
 * Query: { timeRange?: 'week' | 'month' | 'quarter' | 'year' }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
adminRouter.get(
    '/reports/analytics',
    accessTokenValidator,
    verifiedUserValidator,
    adminRequired,
    wrapRequestHandler(getReportsAnalyticsController)
)

/**
 * Description: Get revenue analytics
 * Path: /admin/reports/revenue
 * Method: GET
 * Query: { timeRange?: 'week' | 'month' | 'quarter' | 'year' }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
adminRouter.get(
    '/reports/revenue',
    accessTokenValidator,
    verifiedUserValidator,
    adminRequired,
    wrapRequestHandler(getRevenueAnalyticsController)
)

/**
 * Description: Get product analytics
 * Path: /admin/reports/products
 * Method: GET
 * Query: { timeRange?: 'week' | 'month' | 'quarter' | 'year' }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
adminRouter.get(
    '/reports/products',
    accessTokenValidator,
    verifiedUserValidator,
    adminRequired,
    wrapRequestHandler(getProductAnalyticsController)
)

/**
 * Description: Get customer analytics
 * Path: /admin/reports/customers
 * Method: GET
 * Query: { timeRange?: 'week' | 'month' | 'quarter' | 'year' }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
adminRouter.get(
    '/reports/customers',
    accessTokenValidator,
    verifiedUserValidator,
    adminRequired,
    wrapRequestHandler(getCustomerAnalyticsController)
)
