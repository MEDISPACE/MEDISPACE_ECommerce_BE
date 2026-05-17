import { Request, Response } from 'express'
import { NextFunction } from 'express-serve-static-core'
import adminService from '~/services/admin.services'
import { adminExportService, getTimeRangeLabel } from '~/services/admin.export.service'
import chatsService from '~/services/chats.services'
import { ADMIN_MESSAGES } from '~/constants/message'
import { getIO } from '~/sockets/chat.socket'

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
      message: ADMIN_MESSAGES.GET_DASHBOARD_STATS_SUCCESS,
      result: stats
    })
  } catch (error) {
    console.error('[Admin Controller] Error in getDashboardStatsController:', error)
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
      message: ADMIN_MESSAGES.GET_RECENT_ACTIVITIES_SUCCESS,
      result: activities
    })
  } catch (error) {
    console.error('[Admin Controller] Error in getRecentActivitiesController:', error)
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
      message: ADMIN_MESSAGES.GET_SYSTEM_HEALTH_SUCCESS,
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
      sortBy: (req.query.sortBy as string) || 'createdAt',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    }

    const result = await adminService.getAllUsers(params)
    return res.json({
      message: ADMIN_MESSAGES.GET_ALL_USERS_SUCCESS,
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
      message: ADMIN_MESSAGES.GET_USER_STATS_SUCCESS,
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
      message: ADMIN_MESSAGES.GET_PHARMACIST_STATS_SUCCESS,
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
      message: ADMIN_MESSAGES.CREATE_USER_SUCCESS,
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
    const user = await adminService.updateUser(userId as string, req.body)
    return res.json({
      message: ADMIN_MESSAGES.UPDATE_USER_SUCCESS,
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
    const result = await adminService.deleteUser(userId as string)
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
    const result = await adminService.resetUserPassword(userId as string)
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
    const result = await adminService.verifyUserEmail(userId as string)
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
    const result = await adminService.getOrderDetails(orderId as string)
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

    const result = await adminService.updateOrderStatus(orderId as string, {
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

    const result = await adminService.updatePrescriptionStatus(prescriptionId as string, {
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
 * Query: { timeRange?: 'week' | 'month' | 'quarter' | 'year' | 'custom', startDate?: string, endDate?: string }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const getReportsAnalyticsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { timeRange = 'month', startDate, endDate } = req.query
    const result = await adminService.getReportsAnalytics(
      timeRange as string,
      startDate as string | undefined,
      endDate as string | undefined
    )
    return res.json({
      message: ADMIN_MESSAGES.GET_REPORTS_ANALYTICS_SUCCESS,
      result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Export reports
 * Path: /admin/reports/export
 * Method: GET
 * Query: { timeRange?: string, startDate?: string, endDate?: string, format: 'excel' | 'pdf' }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const exportReportsAnalyticsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { timeRange = 'month', startDate, endDate, format = 'excel' } = req.query

    // 1. Lấy dữ liệu
    const data = await adminService.getReportsAnalytics(
      timeRange as string,
      startDate as string | undefined,
      endDate as string | undefined
    )

    // 2. Tạo file
    let buffer: Buffer
    let mimeType: string
    let extension: string
    const label = getTimeRangeLabel(timeRange as string, startDate as string | undefined, endDate as string | undefined)

    if (format === 'pdf') {
      buffer = await adminExportService.exportToPDF(
        data,
        timeRange as string,
        startDate as string | undefined,
        endDate as string | undefined
      )
      mimeType = 'application/pdf'
      extension = 'pdf'
    } else {
      buffer = await adminExportService.exportToExcel(
        data,
        timeRange as string,
        startDate as string | undefined,
        endDate as string | undefined
      )
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      extension = 'xlsx'
    }

    const filename = `MEDISPACE_BaoCao_${label}_${new Date().toISOString().split('T')[0]}.${extension}`

    // 3. Trả về stream
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
    res.setHeader('Content-Type', mimeType)
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition')
    return res.end(buffer)
  } catch (error) {
    next(error)
  }
}

/**
 * Get revenue analytics
 * Path: /admin/reports/revenue
 * Method: GET
 * Query: { timeRange?: 'week' | 'month' | 'quarter' | 'year' | 'custom', startDate?: string, endDate?: string }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const getRevenueAnalyticsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { timeRange = 'month', startDate, endDate } = req.query
    const result = await adminService.getRevenueAnalytics(
      timeRange as string,
      startDate as string | undefined,
      endDate as string | undefined
    )
    return res.json({
      message: ADMIN_MESSAGES.GET_REVENUE_ANALYTICS_SUCCESS,
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
 * Query: { timeRange?: 'week' | 'month' | 'quarter' | 'year' | 'custom', startDate?: string, endDate?: string }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const getProductAnalyticsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { timeRange = 'month', startDate, endDate } = req.query
    const result = await adminService.getProductAnalytics(
      timeRange as string,
      startDate as string | undefined,
      endDate as string | undefined
    )
    return res.json({
      message: ADMIN_MESSAGES.GET_PRODUCT_ANALYTICS_SUCCESS,
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
 * Query: { timeRange?: 'week' | 'month' | 'quarter' | 'year' | 'custom', startDate?: string, endDate?: string }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const getCustomerAnalyticsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { timeRange = 'month', startDate, endDate } = req.query
    const result = await adminService.getCustomerAnalytics(
      timeRange as string,
      startDate as string | undefined,
      endDate as string | undefined
    )
    return res.json({
      message: ADMIN_MESSAGES.GET_CUSTOMER_ANALYTICS_SUCCESS,
      result
    })
  } catch (error) {
    next(error)
  }
}

// ==================== CHAT MANAGEMENT ====================

// GET /admin/chats/stats
export const getChatStatsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await chatsService.getChatStats()
    return res.json({ message: 'Lấy thống kê chat thành công', result })
  } catch (error) {
    next(error)
  }
}

// GET /admin/chats/conversations
export const adminGetConversationsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, status, pharmacistId, search, dateFrom, dateTo } = req.query
    const result = await chatsService.getAdminConversations({
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
      status: status as string,
      pharmacistId: pharmacistId as string,
      search: search as string,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string
    })
    return res.json({ message: 'Lấy danh sách cuộc trò chuyện thành công', result })
  } catch (error) {
    next(error)
  }
}

// GET /admin/chats/conversations/:conversationId/messages
export const adminGetConversationMessagesController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { conversationId } = req.params
    const { page, limit } = req.query
    const result = await chatsService.getMessages(
      conversationId as string,
      page ? parseInt(page as string) : 1,
      limit ? parseInt(limit as string) : 50
    )
    return res.json({ message: 'Lấy tin nhắn thành công', result })
  } catch (error) {
    next(error)
  }
}

// PATCH /admin/chats/conversations/:conversationId/close
export const adminCloseConversationController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { conversationId } = req.params
    const result = await chatsService.adminCloseConversation(conversationId as string)

    // Emit realtime: notify customer & pharmacist that conversation was closed by admin
    try {
      const io = getIO()
      const payload = {
        conversationId,
        closedBy: 'admin',
        closedAt: new Date().toISOString()
      }
      // Notify everyone in the conversation room (customer + pharmacist đang xem)
      io.to(`conversation:${conversationId}`).emit('conversation:closed', payload)
      // Also notify customer via personal room (nếu không join room hội thoại)
      if (result.customerId) {
        io.to(`user:${result.customerId.toString()}`).emit('conversation:closed', payload)
      }
      // Notify pharmacists room to update inbox
      io.to('pharmacists').emit('conversation:closed', payload)
    } catch {
      /* socket not critical */
    }

    return res.json({ message: 'Đã đóng cuộc trò chuyện', result })
  } catch (error) {
    next(error)
  }
}

// PATCH /admin/chats/conversations/:conversationId/transfer
export const adminTransferConversationController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { conversationId } = req.params
    const { pharmacistId } = req.body
    if (!pharmacistId) {
      return res.status(400).json({ message: 'pharmacistId là bắt buộc' })
    }

    // Lấy pharmacistId cũ trước khi transfer
    const before = await chatsService.getConversationById(conversationId as string)
    const oldPharmacistId = before?.pharmacistId?.toString()

    const result = await chatsService.adminTransferConversation(conversationId as string, pharmacistId as string)

    // Emit realtime: notify old pharmacist, new pharmacist, and pharmacists room
    try {
      const io = getIO()
      const payload = {
        conversationId,
        newPharmacistId: pharmacistId,
        oldPharmacistId,
        transferredAt: new Date().toISOString()
      }
      // Notify everyone in the conversation room
      io.to(`conversation:${conversationId}`).emit('conversation:transferred', payload)
      // Notify old pharmacist personally to remove from their inbox
      if (oldPharmacistId) {
        io.to(`user:${oldPharmacistId}`).emit('conversation:transferred', payload)
      }
      // Notify new pharmacist personally so they pick it up
      io.to(`user:${pharmacistId}`).emit('conversation:transferred', payload)
      // Notify all pharmacists to refresh lists
      io.to('pharmacists').emit('conversation:transferred', payload)
    } catch {
      /* socket not critical */
    }

    return res.json({ message: 'Đã chuyển cuộc trò chuyện thành công', result })
  } catch (error) {
    next(error)
  }
}

// ==================== INVENTORY MANAGEMENT ====================

/**
 * Get inventory statistics
 * Path: /admin/inventory/stats
 * Method: GET
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const getInventoryStatsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await adminService.getInventoryStats()
    return res.json({
      message: 'Lấy thống kê tồn kho thành công',
      result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Get inventory products
 * Path: /admin/inventory/products
 * Method: GET
 * Query: { page, limit, stockFilter, search, sortBy, sortOrder }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const getInventoryProductsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await adminService.getInventoryProducts({
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      stockFilter: req.query.stockFilter as string,
      search: req.query.search as string,
      sortBy: req.query.sortBy as string,
      sortOrder: req.query.sortOrder as 'asc' | 'desc'
    })
    return res.json({
      message: 'Lấy danh sách tồn kho thành công',
      result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Update product stock
 * Path: /admin/inventory/:productId/stock
 * Method: PATCH
 * Body: { stockQuantity: number }
 * Headers: { Authorization: Bearer <access_token> } (Admin)
 */
export const updateProductStockController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params
    const { stockQuantity } = req.body

    if (stockQuantity === undefined || stockQuantity === null) {
      return res.status(400).json({ message: 'stockQuantity là bắt buộc' })
    }

    const result = await adminService.updateProductStock(productId as string, parseInt(stockQuantity))
    return res.json({
      message: 'Cập nhật tồn kho thành công',
      result
    })
  } catch (error) {
    next(error)
  }
}
