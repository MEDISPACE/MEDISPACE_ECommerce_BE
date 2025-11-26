import { Router } from 'express'
import {
    getDashboardStatsController,
    getRecentActivitiesController,
    getAllUsersController,
    getUserStatsController,
    createUserController,
    updateUserController,
    deleteUserController,
    resetUserPasswordController,
    verifyUserEmailController
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

export default adminRouter
