import { Request, Response } from 'express'
import { NextFunction } from 'express-serve-static-core'
import adminService from '~/services/admin.services'

/**
 * Get dashboard statistics
 * Path: /admin/dashboard/stats
 * Method: GET
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const getDashboardStatsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const stats = await adminService.getDashboardStats()
        return res.json({
            message: 'Get dashboard statistics successfully',
            result: stats
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Get recent activities
 * Path: /admin/dashboard/recent-activities
 * Method: GET
 * Query: { limit?: number }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const getRecentActivitiesController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 10
        const activities = await adminService.getRecentActivities(limit)
        return res.json({
            message: 'Get recent activities successfully',
            result: activities
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Get system health status
 * Path: /admin/dashboard/system-health
 * Method: GET
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const getSystemHealthController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const health = await adminService.getSystemHealth()
        return res.json({
            message: 'Get system health successfully',
            result: health
        })
    } catch (error) {
        next(error)
    }
}

// ==================== USER MANAGEMENT ====================

/**
 * Get all users with pagination and filters
 * Path: /admin/users
 * Method: GET
 * Query: { page, limit, role, status, verified, search, sortBy, sortOrder }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const getAllUsersController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const params = {
            page: req.query.page ? parseInt(req.query.page as string) : 1,
            limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
            role: req.query.role as string,
            status: req.query.status as string,
            verified: req.query.verified === 'true' ? true : req.query.verified === 'false' ? false : undefined,
            search: req.query.search as string,
            sortBy: req.query.sortBy as string || 'createdAt',
            sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
        }

        const result = await adminService.getAllUsers(params)
        return res.json({
            message: 'Get all users successfully',
            result
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Get user statistics
 * Path: /admin/users/stats
 * Method: GET
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const getUserStatsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const stats = await adminService.getUserStats()
        return res.json({
            message: 'Get user statistics successfully',
            result: stats
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Get pharmacist statistics
 * Path: /admin/users/pharmacists/stats
 * Method: GET
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const getPharmacistStatsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const stats = await adminService.getPharmacistStats()
        return res.json({
            message: 'Get pharmacist statistics successfully',
            result: stats
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Create new user
 * Path: /admin/users
 * Method: POST
 * Body: { email, password, firstName, lastName, phoneNumber, role, gender }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const createUserController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = await adminService.createUser(req.body)
        return res.status(201).json({
            message: 'User created successfully',
            result: user
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Update user
 * Path: /admin/users/:userId
 * Method: PATCH
 * Body: Partial<User>
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const updateUserController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = req.params
        const user = await adminService.updateUser(userId, req.body)
        return res.json({
            message: 'User updated successfully',
            result: user
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Delete user
 * Path: /admin/users/:userId
 * Method: DELETE
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const deleteUserController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = req.params
        const result = await adminService.deleteUser(userId)
        return res.json(result)
    } catch (error) {
        next(error)
    }
}

/**
 * Reset user password
 * Path: /admin/users/:userId/reset-password
 * Method: PATCH
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const resetUserPasswordController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = req.params
        const result = await adminService.resetUserPassword(userId)
        return res.json(result)
    } catch (error) {
        next(error)
    }
}

/**
 * Verify user email manually
 * Path: /admin/users/:userId/verify-email
 * Method: PATCH
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const verifyUserEmailController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = req.params
        const result = await adminService.verifyUserEmail(userId)
        return res.json(result)
    } catch (error) {
        next(error)
    }
}

// ==================== ORDER MANAGEMENT ====================

// Get all orders
// Path: /admin/orders
// Method: GET
// Query: { page, limit, status, paymentStatus, search, dateFrom, dateTo }
// Headers: { Authorization: Bearer <access_token> } (Admin)
export const getAllOrdersController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { page, limit, status, paymentStatus, search, dateFrom, dateTo } = req.query

        const result = await adminService.getAllOrders({
            page: page ? parseInt(page as string) : undefined,
            limit: limit ? parseInt(limit as string) : undefined,
            status: status as string,
            paymentStatus: paymentStatus as string,
            search: search as string,
            dateFrom: dateFrom as string,
            dateTo: dateTo as string
        })

        return res.json({ result })
    } catch (error) {
        next(error)
    }
}

// Get order statistics
// Path: /admin/orders/stats
// Method: GET
// Headers: { Authorization: Bearer <access_token> } (Admin)
export const getOrderStatsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await adminService.getOrderStats()
        return res.json({ result })
    } catch (error) {
        next(error)
    }
}

// Get order details
// Path: /admin/orders/:orderId
// Method: GET
// Headers: { Authorization: Bearer <access_token> } (Admin)
export const getOrderDetailsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { orderId } = req.params
        const result = await adminService.getOrderDetails(orderId)
        return res.json({ result })
    } catch (error) {
        next(error)
    }
}

// Update order status
// Path: /admin/orders/:orderId/status
// Method: PATCH
// Body: { status, notes?, trackingNumber? }
// Headers: { Authorization: Bearer <access_token> } (Admin)
export const updateOrderStatusController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { orderId } = req.params
        const { status, notes, trackingNumber } = req.body

        const result = await adminService.updateOrderStatus(orderId, {
            status,
            notes,
            trackingNumber
        })

        return res.json({ result })
    } catch (error) {
        next(error)
    }
}

// ==================== PRESCRIPTION MANAGEMENT ====================

// Get all prescriptions
// Path: /admin/prescriptions
// Method: GET
// Headers: { Authorization: Bearer <access_token> } (Admin)
export const getAllPrescriptionsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { page, limit, status, search } = req.query

        const result = await adminService.getAllPrescriptions({
            page: page ? parseInt(page as string) : undefined,
            limit: limit ? parseInt(limit as string) : undefined,
            status: status as string,
            search: search as string
        })

        return res.json({ result })
    } catch (error) {
        next(error)
    }
}

// Get prescription statistics
// Path: /admin/prescriptions/stats
// Method: GET
// Headers: { Authorization: Bearer <access_token> } (Admin)
export const getPrescriptionStatsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await adminService.getPrescriptionStats()
        return res.json({ result })
    } catch (error) {
        next(error)
    }
}

// Update prescription status
// Path: /admin/prescriptions/:prescriptionId/status
// Method: PATCH
// Headers: { Authorization: Bearer <access_token> } (Admin)
// Body: { status: string, notes?: string }
export const updatePrescriptionStatusController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { prescriptionId } = req.params
        const { status, notes } = req.body

        const result = await adminService.updatePrescriptionStatus(prescriptionId, {
            status,
            notes
        })

        return res.json({ result })
    } catch (error) {
        next(error)
    }
}

// Bulk update prescriptions
// Path: /admin/prescriptions/bulk-update
// Method: PATCH
// Headers: { Authorization: Bearer <access_token> } (Admin)
// Body: { prescriptionIds: string[], status: string }
export const bulkUpdatePrescriptionsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { prescriptionIds, status } = req.body

        const result = await adminService.bulkUpdatePrescriptions(prescriptionIds, status)

        return res.json({ result })
    } catch (error) {
        next(error)
    }
}

// ==================== REPORTS & ANALYTICS ====================

/**
 * Get comprehensive reports analytics
 * Path: /admin/reports/analytics
 * Method: GET
 * Query: { timeRange?: 'week' | 'month' | 'quarter' | 'year' }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const getReportsAnalyticsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { timeRange = 'month' } = req.query
        const result = await adminService.getReportsAnalytics(timeRange as string)
        return res.json({
            message: 'Get reports analytics successfully',
            result
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Get revenue analytics
 * Path: /admin/reports/revenue
 * Method: GET
 * Query: { timeRange?: 'week' | 'month' | 'quarter' | 'year' }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const getRevenueAnalyticsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { timeRange = 'month' } = req.query
        const result = await adminService.getRevenueAnalytics(timeRange as string)
        return res.json({
            message: 'Get revenue analytics successfully',
            result
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Get product analytics
 * Path: /admin/reports/products
 * Method: GET
 * Query: { timeRange?: 'week' | 'month' | 'quarter' | 'year' }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const getProductAnalyticsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { timeRange = 'month' } = req.query
        const result = await adminService.getProductAnalytics(timeRange as string)
        return res.json({
            message: 'Get product analytics successfully',
            result
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Get customer analytics
 * Path: /admin/reports/customers
 * Method: GET
 * Query: { timeRange?: 'week' | 'month' | 'quarter' | 'year' }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const getCustomerAnalyticsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { timeRange = 'month' } = req.query
        const result = await adminService.getCustomerAnalytics(timeRange as string)
        return res.json({
            message: 'Get customer analytics successfully',
            result
        })
    } catch (error) {
        next(error)
    }
}
