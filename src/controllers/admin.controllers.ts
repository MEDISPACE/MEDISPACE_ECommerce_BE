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
