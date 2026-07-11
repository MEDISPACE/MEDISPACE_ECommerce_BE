import databaseService from './database.services'
import cacheService from './cache.services'
import { ObjectId } from 'mongodb'
import User from '~/models/schemas/User.schema'
import { hashPassword } from '~/utils/crypto'
import { TokenType, UserRole, UserStatus } from '~/constants/enum'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'
import { config } from 'dotenv'
import notificationService from './notifications.services'
import { getIO } from '~/sockets/chat.socket'
import orderService from './orders.services'
import emailService from './email.services'
import { signToken } from '~/utils/jwt'
import { ADMIN_MESSAGES } from '~/constants/message'

config()

interface DashboardStats {
  revenue: {
    today: number
    month: number
    year: number
    growth: number
  }
  orders: {
    total: number
    pending: number
    processing: number
    completed: number
    cancelled: number
    todayCount: number
  }
  users: {
    total: number
    newToday: number
    customers: number
    pharmacists: number
    admins: number
    verified: number
  }
  products: {
    total: number
    active: number
    outOfStock: number
    lowStock: number
    totalValue: number
  }
  prescriptions: {
    total: number
    pending: number
    approved: number
    rejected: number
  }
}

interface RecentActivity {
  id: string
  type: 'user_registration' | 'order_created' | 'prescription_uploaded' | 'prescription_approved' | 'order_completed'
  message: string
  time: Date
  severity: 'info' | 'success' | 'warning' | 'error'
  metadata?: Record<string, unknown>
}

interface SystemHealth {
  server: {
    status: 'healthy' | 'warning' | 'error'
    uptime: number
    memory: number
  }
  database: {
    status: 'healthy' | 'warning' | 'error'
    responseTime: number
  }
  api: {
    status: 'healthy' | 'warning' | 'error'
    averageResponseTime: number
  }
  paymentGateway: {
    status: 'healthy' | 'warning' | 'error'
  }
}

interface UserListParams {
  page?: number
  limit?: number
  role?: string
  status?: string
  verified?: boolean
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

class AdminService {
  private signAdminPasswordResetToken({ userId, status }: { userId: string; status: UserStatus }) {
    return signToken({
      payload: {
        userId,
        tokenType: TokenType.ForgotPasswordToken,
        verify: status
      },
      privateKey: process.env.JWT_SECRET_FORGOT_PASSWORD_TOKEN as string,
      options: { expiresIn: '15m' }
    })
  }

  private async writeAdminAuditLog(action: string, actorAdminId: string, targetUserId: string, metadata?: Record<string, unknown>) {
    try {
      await databaseService.adminAuditLogs.insertOne({
        action,
        actorAdminId: new ObjectId(actorAdminId),
        targetUserId: new ObjectId(targetUserId),
        metadata: metadata || {},
        createdAt: new Date()
      })
    } catch (error) {
      console.error('[AdminAudit] Failed to write audit log:', error)
    }
  }

  private async assertAdminAccountMutationAllowed(
    targetUserId: string,
    actorAdminId: string,
    updateData?: Record<string, unknown>,
    operation: 'update' | 'delete' = 'update'
  ) {
    const isSelf = targetUserId === actorAdminId

    if (operation === 'delete' && isSelf) {
      throw new ErrorWithStatus({
        message: 'Bạn không thể xóa tài khoản đang đăng nhập.',
        status: HTTP_STATUS.FORBIDDEN
      })
    }

    if (operation === 'update' && isSelf) {
      if (updateData?.role !== undefined && Number(updateData.role) !== UserRole.Admin) {
        throw new ErrorWithStatus({
          message: 'Bạn không thể thay đổi vai trò của chính mình.',
          status: HTTP_STATUS.FORBIDDEN
        })
      }

      if (updateData?.status !== undefined && Number(updateData.status) !== UserStatus.Verified) {
        throw new ErrorWithStatus({
          message: 'Bạn không thể thay đổi trạng thái tài khoản đang đăng nhập.',
          status: HTTP_STATUS.FORBIDDEN
        })
      }
    }

    const targetUser = await databaseService.users.findOne({ _id: new ObjectId(targetUserId) })
    if (!targetUser) {
      throw new ErrorWithStatus({ message: 'User not found', status: HTTP_STATUS.NOT_FOUND })
    }

    const willRemoveActiveAdmin =
      targetUser.role === UserRole.Admin &&
      targetUser.status === UserStatus.Verified &&
      (operation === 'delete' ||
        (updateData?.role !== undefined && Number(updateData.role) !== UserRole.Admin) ||
        (updateData?.status !== undefined && Number(updateData.status) !== UserStatus.Verified))

    if (willRemoveActiveAdmin) {
      const activeAdminCount = await databaseService.users.countDocuments({
        role: UserRole.Admin,
        status: UserStatus.Verified
      })

      if (activeAdminCount <= 1) {
        throw new ErrorWithStatus({
          message: 'Hệ thống cần ít nhất một quản trị viên đang hoạt động.',
          status: HTTP_STATUS.CONFLICT
        })
      }
    }
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(): Promise<DashboardStats> {
    return cacheService.getOrSet('admin:dashboard', async () => {
    const startTime = Date.now()

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    const startOfYear = new Date(today.getFullYear(), 0, 1)
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59)

    try {
      // Revenue calculations using aggregation for better performance
      const [todayRevenue, monthRevenue, yearRevenue, lastMonthRevenue, todayOrdersCount] = await Promise.all([
        databaseService.orders
          .aggregate([
            {
              $match: {
                createdAt: { $gte: today },
                paymentStatus: 'paid'
              }
            },
            {
              $group: {
                _id: null,
                total: { $sum: '$totalAmount' },
                count: { $sum: 1 }
              }
            }
          ])
          .toArray(),
        databaseService.orders
          .aggregate([
            {
              $match: {
                createdAt: { $gte: startOfMonth },
                paymentStatus: 'paid'
              }
            },
            {
              $group: {
                _id: null,
                total: { $sum: '$totalAmount' }
              }
            }
          ])
          .toArray(),
        databaseService.orders
          .aggregate([
            {
              $match: {
                createdAt: { $gte: startOfYear },
                paymentStatus: 'paid'
              }
            },
            {
              $group: {
                _id: null,
                total: { $sum: '$totalAmount' }
              }
            }
          ])
          .toArray(),
        databaseService.orders
          .aggregate([
            {
              $match: {
                createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
                paymentStatus: 'paid'
              }
            },
            {
              $group: {
                _id: null,
                total: { $sum: '$totalAmount' }
              }
            }
          ])
          .toArray(),
        databaseService.orders.countDocuments({ createdAt: { $gte: today } })
      ])

      const todayRevenueValue = todayRevenue[0]?.total || 0
      const monthRevenueValue = monthRevenue[0]?.total || 0
      const yearRevenueValue = yearRevenue[0]?.total || 0
      const lastMonthRevenueValue = lastMonthRevenue[0]?.total || 0

      const revenueGrowth =
        lastMonthRevenueValue > 0 ? ((monthRevenueValue - lastMonthRevenueValue) / lastMonthRevenueValue) * 100 : 0

      // Order statistics
      const [totalOrders, pendingOrders, processingOrders, completedOrders, cancelledOrders] = await Promise.all([
        databaseService.orders.countDocuments(),
        databaseService.orders.countDocuments({ orderStatus: 'pending' }),
        databaseService.orders.countDocuments({ orderStatus: 'processing' }),
        databaseService.orders.countDocuments({ orderStatus: 'delivered' }),
        databaseService.orders.countDocuments({ orderStatus: 'cancelled' })
      ])

      // User statistics
      const [totalUsers, newTodayUsers, customers, pharmacists, admins, verifiedUsers] = await Promise.all([
        databaseService.users.countDocuments(),
        databaseService.users.countDocuments({ createdAt: { $gte: today } }),
        databaseService.users.countDocuments({ role: 0 }), // Customer
        databaseService.users.countDocuments({ role: 1 }), // Pharmacist
        databaseService.users.countDocuments({ role: 2 }), // Admin
        databaseService.users.countDocuments({ status: 1 }) // Verified
      ])

      // Product statistics - optimized with aggregation
      const [productStats, totalProducts, activeProducts, outOfStockProducts, lowStockProducts] = await Promise.all([
        databaseService.products
          .aggregate([
            {
              $project: {
                price: {
                  $ifNull: [{ $arrayElemAt: ['$priceVariants.price', 0] }, 0]
                },
                stockQuantity: 1
              }
            },
            {
              $group: {
                _id: null,
                totalValue: {
                  $sum: {
                    $multiply: ['$price', '$stockQuantity']
                  }
                }
              }
            }
          ])
          .toArray(),
        databaseService.products.countDocuments(),
        databaseService.products.countDocuments({ status: 'active' }),
        databaseService.products.countDocuments({ status: 'out_of_stock' }),
        databaseService.products.countDocuments({ status: 'active', stockQuantity: { $gt: 0, $lt: 20 } })
      ])

      const totalProductValue = productStats[0]?.totalValue || 0

      // Prescription statistics
      const [totalPrescriptions, pendingPrescriptions, approvedPrescriptions, rejectedPrescriptions] =
        await Promise.all([
          databaseService.prescriptions.countDocuments(),
          databaseService.prescriptions.countDocuments({ status: 'pending' }),
          databaseService.prescriptions.countDocuments({ status: 'approved' }),
          databaseService.prescriptions.countDocuments({ status: 'rejected' })
        ])

      const result = {
        revenue: {
          today: todayRevenueValue,
          month: monthRevenueValue,
          year: yearRevenueValue,
          growth: Math.round(revenueGrowth * 100) / 100
        },
        orders: {
          total: totalOrders,
          pending: pendingOrders,
          processing: processingOrders,
          completed: completedOrders,
          cancelled: cancelledOrders,
          todayCount: todayOrdersCount
        },
        users: {
          total: totalUsers,
          newToday: newTodayUsers,
          customers,
          pharmacists,
          admins,
          verified: verifiedUsers
        },
        products: {
          total: totalProducts,
          active: activeProducts,
          outOfStock: outOfStockProducts,
          lowStock: lowStockProducts,
          totalValue: totalProductValue
        },
        prescriptions: {
          total: totalPrescriptions,
          pending: pendingPrescriptions,
          approved: approvedPrescriptions,
          rejected: rejectedPrescriptions
        }
      }

      const endTime = Date.now()

      return result
    } catch (error) {
      console.error('[Admin Service] Error in getDashboardStats:', error)
      throw error
    }
    }, 60) // Cache for 60 seconds
  }

  /**
   * Get recent activities
   */
  async getRecentActivities(limit: number = 10): Promise<RecentActivity[]> {
    const activities: RecentActivity[] = []

    // Get recent users
    const recentUsers = await databaseService.users.find().sort({ createdAt: -1 }).limit(3).toArray()

    recentUsers.forEach((user) => {
      activities.push({
        id: user._id!.toString(),
        type: 'user_registration',
        message: `Người dùng mới đăng ký: ${user.firstName} ${user.lastName}`,
        time: user.createdAt!,
        severity: 'info',
        metadata: { userId: user._id!.toString(), email: user.email }
      })
    })

    // Get recent orders
    const recentOrders = await databaseService.orders.find().sort({ createdAt: -1 }).limit(3).toArray()

    recentOrders.forEach((order) => {
      const severity = order.orderStatus === 'delivered' ? 'success' : 'info'
      const message =
        order.orderStatus === 'delivered'
          ? `Đơn hàng ${order.orderNumber} đã hoàn thành`
          : `Đơn hàng mới ${order.orderNumber}`

      activities.push({
        id: order._id!.toString(),
        type: order.orderStatus === 'delivered' ? 'order_completed' : 'order_created',
        message,
        time: order.createdAt!,
        severity,
        metadata: { orderId: order._id!.toString(), orderNumber: order.orderNumber }
      })
    })

    // Get recent prescriptions
    const recentPrescriptions = await databaseService.prescriptions.find().sort({ createdAt: -1 }).limit(3).toArray()

    recentPrescriptions.forEach((prescription) => {
      const type = prescription.status === 'approved' ? 'prescription_approved' : 'prescription_uploaded'
      const severity = prescription.status === 'approved' ? 'success' : 'info'
      const message = prescription.status === 'approved' ? `Đơn thuốc đã được duyệt` : `Đơn thuốc mới chờ duyệt`

      activities.push({
        id: prescription._id!.toString(),
        type,
        message,
        time: prescription.createdAt!,
        severity,
        metadata: { prescriptionId: prescription._id!.toString() }
      })
    })

    // Sort by time and limit
    return activities.sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, limit)
  }

  /**
   * Get system health status
   */
  async getSystemHealth(): Promise<SystemHealth> {
    // Server health
    const uptime = process.uptime()
    const memoryUsage = process.memoryUsage()
    const memoryPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100

    // Database health - test connection speed
    const dbStart = Date.now()
    await databaseService.users.findOne({})
    const dbResponseTime = Date.now() - dbStart

    // API health - based on database response time
    const apiResponseTime = dbResponseTime + 50 // Approximate

    return {
      server: {
        status: memoryPercent > 90 ? 'error' : memoryPercent > 70 ? 'warning' : 'healthy',
        uptime: Math.floor(uptime),
        memory: Math.round(memoryPercent * 100) / 100
      },
      database: {
        status: dbResponseTime > 1000 ? 'error' : dbResponseTime > 500 ? 'warning' : 'healthy',
        responseTime: dbResponseTime
      },
      api: {
        status: apiResponseTime > 1000 ? 'error' : apiResponseTime > 500 ? 'warning' : 'healthy',
        averageResponseTime: apiResponseTime
      },
      paymentGateway: {
        status: 'healthy' // TODO: Implement actual payment gateway health check
      }
    }
  }

  /**
   * Get all users with pagination and filters
   */
  async getAllUsers(params: UserListParams) {
    const { page = 1, limit = 10, role, status, verified, search, sortBy = 'createdAt', sortOrder = 'desc' } = params

    // Build filter query
    const filter: Record<string, unknown> = {}

    if (role !== undefined && role !== '') {
      filter.role = parseInt(role)
    }

    if (status !== undefined && status !== '') {
      filter.status = parseInt(status)
    }

    if (verified !== undefined) {
      filter.status = verified ? 1 : 0
    }

    if (search) {
      const searchConditions: Record<string, unknown>[] = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } }
      ]
      if (ObjectId.isValid(search)) {
        searchConditions.unshift({ _id: new ObjectId(search) })
      }
      filter.$or = [
        ...searchConditions
      ]
    }

    // Calculate skip
    const skip = (page - 1) * limit

    // Get total count
    const total = await databaseService.users.countDocuments(filter)

    // Get users
    const users = await databaseService.users
      .find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(limit)
      .toArray()

    // Remove sensitive data
    const sanitizedUsers = users.map((user) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, emailVerifyToken, forgotPasswordToken, ...rest } = user
      return rest
    })

    return {
      users: sanitizedUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats() {
    const [total, customers, pharmacists, admins, active, verified] = await Promise.all([
      databaseService.users.countDocuments(),
      databaseService.users.countDocuments({ role: UserRole.Customer }),
      databaseService.users.countDocuments({ role: UserRole.Pharmacist }),
      databaseService.users.countDocuments({ role: UserRole.Admin }),
      databaseService.users.countDocuments({ status: UserStatus.Verified }),
      databaseService.users.countDocuments({ status: UserStatus.Verified })
    ])

    return {
      total,
      customers,
      pharmacists,
      admins,
      active,
      verified
    }
  }

  /**
   * Get pharmacist statistics
   */
  async getPharmacistStats() {
    const [total, active, verified] = await Promise.all([
      databaseService.users.countDocuments({ role: UserRole.Pharmacist }),
      databaseService.users.countDocuments({ role: UserRole.Pharmacist, status: UserStatus.Verified }),
      databaseService.users.countDocuments({ role: UserRole.Pharmacist, status: UserStatus.Verified })
    ])

    // Get total prescriptions handled by pharmacists
    // This is a rough estimate or placeholder if we don't have a direct link yet
    const totalPrescriptions = await databaseService.prescriptions.countDocuments({
      verifiedBy: { $exists: true }
    })

    return {
      total,
      active,
      verified,
      onLeave: 0, // Placeholder
      totalPrescriptions,
      totalConsultations: 0, // Placeholder
      avgRating: 4.8 // Placeholder
    }
  }

  /**
   * Create new user (Admin only)
   */
  async createUser(userData: {
    email: string
    password: string
    firstName: string
    lastName: string
    phoneNumber: string
    lisenseNumber?: string
    role: number
    gender: number
  }) {
    // Check if email already exists
    const existingUser = await databaseService.users.findOne({ email: userData.email })
    if (existingUser) {
      throw new Error('Email already exists')
    }

    // Create user
    const user = new User({
      _id: new ObjectId(),
      ...userData,
      password: hashPassword(userData.password),
      status: UserStatus.Verified, // Admin-created users are auto-verified
      emailVerifyToken: '',
      forgotPasswordToken: '',
      createdAt: new Date(),
      updatedAt: new Date()
    })

    await databaseService.users.insertOne(user)

    // Remove sensitive data
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, emailVerifyToken, forgotPasswordToken, ...sanitizedUser } = user

    return sanitizedUser
  }

  /**
   * Update user
   */
  async updateUser(userId: string, updateData: Partial<User>, actorAdminId?: string) {
    // Remove fields that shouldn't be updated directly
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, emailVerifyToken, forgotPasswordToken, forcePasswordChange, _id, createdAt, ...safeUpdateData } =
      updateData as Record<string, unknown>

    if (actorAdminId) {
      await this.assertAdminAccountMutationAllowed(userId, actorAdminId, safeUpdateData, 'update')
    }

    const result = await databaseService.users.findOneAndUpdate(
      { _id: new ObjectId(userId) },
      {
        $set: {
          ...safeUpdateData,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    )

    if (!result) {
      throw new Error('User not found')
    }

    // Remove sensitive data
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: pwd, emailVerifyToken: evt, forgotPasswordToken: fpt, ...sanitizedUser } = result

    return sanitizedUser
  }

  /**
   * Delete user
   */
  async deleteUser(userId: string, actorAdminId?: string) {
    if (actorAdminId) {
      await this.assertAdminAccountMutationAllowed(userId, actorAdminId, undefined, 'delete')
    }

    const result = await databaseService.users.deleteOne({ _id: new ObjectId(userId) })

    if (result.deletedCount === 0) {
      throw new Error('User not found')
    }

    return { message: 'User deleted successfully' }
  }

  /**
   * Reset user password (Admin only)
   */
  async resetUserPassword(userId: string, actorAdminId: string) {
    const targetUser = await databaseService.users.findOne({ _id: new ObjectId(userId) })

    if (!targetUser) {
      throw new ErrorWithStatus({ message: 'User not found', status: HTTP_STATUS.NOT_FOUND })
    }

    const forgotPasswordToken = await this.signAdminPasswordResetToken({ userId, status: targetUser.status })
    const previousForgotPasswordToken = targetUser.forgotPasswordToken || ''
    const previousForcePasswordChange = Boolean(targetUser.forcePasswordChange)

    await Promise.all([
      databaseService.users.updateOne(
        { _id: new ObjectId(userId) },
        {
          $set: {
            forgotPasswordToken,
            forcePasswordChange: true
          },
          $currentDate: { updatedAt: true }
        }
      ),
      databaseService.refreshTokens.deleteMany({ userId: new ObjectId(userId) })
    ])

    try {
      await emailService.sendAdminPasswordResetEmail(targetUser.email, forgotPasswordToken)
    } catch (error) {
      await databaseService.users.updateOne(
        { _id: new ObjectId(userId) },
        {
          $set: {
            forgotPasswordToken: previousForgotPasswordToken,
            forcePasswordChange: previousForcePasswordChange
          },
          $currentDate: { updatedAt: true }
        }
      )
      throw error
    }

    await this.writeAdminAuditLog('ADMIN_RESET_USER_PASSWORD', actorAdminId, userId, {
      targetEmail: targetUser.email,
      delivery: 'email',
      forcePasswordChange: true,
      revokedSessions: true
    })

    return {
      message: ADMIN_MESSAGES.RESET_USER_PASSWORD_SUCCESS
    }
  }

  /**
   * Verify user email manually (Admin only)
   */
  async verifyUserEmail(userId: string) {
    const result = await databaseService.users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          status: UserStatus.Verified,
          emailVerifyToken: '',
          updatedAt: new Date()
        }
      }
    )

    if (result.matchedCount === 0) {
      throw new Error('User not found')
    }

    return { message: 'User email verified successfully' }
  }

  // ==================== ORDER MANAGEMENT ====================

  async getAllOrders(params: {
    page?: number
    limit?: number
    status?: string
    paymentStatus?: string
    search?: string
    dateFrom?: string
    dateTo?: string
  }) {
    const page = params.page || 1
    const limit = params.limit || 10
    const skip = (page - 1) * limit

    // Build match conditions
    const matchConditions: Record<string, unknown> = {}

    if (params.status && params.status !== 'all') {
      matchConditions.orderStatus = params.status
    }

    if (params.paymentStatus && params.paymentStatus !== 'all') {
      matchConditions.paymentStatus = params.paymentStatus
    }

    if (params.search) {
      const safeSearch = params.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      matchConditions.$or = [
        { orderNumber: { $regex: safeSearch, $options: 'i' } },
        { 'shippingAddress.firstName': { $regex: safeSearch, $options: 'i' } },
        { 'shippingAddress.lastName': { $regex: safeSearch, $options: 'i' } },
        { 'shippingAddress.phone': { $regex: safeSearch, $options: 'i' } }
      ]
    }

    if (params.dateFrom || params.dateTo) {
      const typedMatch = matchConditions as { createdAt?: { $gte?: Date; $lte?: Date } }
      typedMatch.createdAt = {}
      if (params.dateFrom) {
        typedMatch.createdAt.$gte = new Date(params.dateFrom)
      }
      if (params.dateTo) {
        const dateTo = new Date(params.dateTo)
        dateTo.setHours(23, 59, 59, 999)
        typedMatch.createdAt.$lte = dateTo
      }
    }

    // Get orders with customer info
    const orders = await databaseService.orders
      .aggregate([
        { $match: matchConditions },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'customer'
          }
        },
        { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'users',
            localField: 'assignedPharmacistId',
            foreignField: '_id',
            as: 'assignedPharmacist'
          }
        },
        { $unwind: { path: '$assignedPharmacist', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'users',
            localField: 'createdBy',
            foreignField: '_id',
            as: 'createdByPharmacist'
          }
        },
        { $unwind: { path: '$createdByPharmacist', preserveNullAndEmptyArrays: true } },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            _id: 1,
            orderNumber: 1,
            userId: 1,
            items: 1,
            shippingAddress: 1,
            paymentMethod: 1,
            paymentStatus: 1,
            orderStatus: 1,
            totalAmount: 1,
            shippingFee: 1,
            assignedPharmacistId: 1,
            assignedAt: 1,
            createdBy: 1,
            createdByInfo: 1,
            createdAt: 1,
            updatedAt: 1,
            'customer.name': 1,
            'customer.email': 1,
            'customer.phone_number': 1,
            assignedPharmacist: {
              _id: '$assignedPharmacist._id',
              firstName: '$assignedPharmacist.firstName',
              lastName: '$assignedPharmacist.lastName',
              email: '$assignedPharmacist.email',
              phoneNumber: '$assignedPharmacist.phoneNumber',
              lisenseNumber: '$assignedPharmacist.lisenseNumber'
            },
            createdByPharmacist: {
              _id: '$createdByPharmacist._id',
              firstName: '$createdByPharmacist.firstName',
              lastName: '$createdByPharmacist.lastName',
              email: '$createdByPharmacist.email',
              phoneNumber: '$createdByPharmacist.phoneNumber',
              lisenseNumber: '$createdByPharmacist.lisenseNumber'
            }
          }
        }
      ])
      .toArray()

    // Get total count
    const total = await databaseService.orders.countDocuments(matchConditions)

    return {
      orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  }

  async getOrderStats(params: {
    status?: string
    paymentStatus?: string
    search?: string
    dateFrom?: string
    dateTo?: string
  } = {}) {
    const matchConditions: Record<string, unknown> = {}

    if (params.status && params.status !== 'all') {
      matchConditions.orderStatus = params.status
    }

    if (params.paymentStatus && params.paymentStatus !== 'all') {
      matchConditions.paymentStatus = params.paymentStatus
    }

    if (params.search) {
      const safeSearch = params.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      matchConditions.$or = [
        { orderNumber: { $regex: safeSearch, $options: 'i' } },
        { 'shippingAddress.firstName': { $regex: safeSearch, $options: 'i' } },
        { 'shippingAddress.lastName': { $regex: safeSearch, $options: 'i' } },
        { 'shippingAddress.phone': { $regex: safeSearch, $options: 'i' } }
      ]
    }

    if (params.dateFrom || params.dateTo) {
      const typedMatch = matchConditions as { createdAt?: { $gte?: Date; $lte?: Date } }
      typedMatch.createdAt = {}
      if (params.dateFrom) typedMatch.createdAt.$gte = new Date(params.dateFrom)
      if (params.dateTo) {
        const dateTo = new Date(params.dateTo)
        dateTo.setHours(23, 59, 59, 999)
        typedMatch.createdAt.$lte = dateTo
      }
    }

    const cacheKey = `admin:order-stats:${JSON.stringify(params || {})}`
    return cacheService.getOrSet(cacheKey, async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const statusMatch = (status: string) =>
        params.status && params.status !== 'all' && params.status !== status
          ? { ...matchConditions, orderStatus: '__no_matching_status__' }
          : { ...matchConditions, orderStatus: status }
      const paymentAllowsRevenue = !params.paymentStatus || params.paymentStatus === 'all' || params.paymentStatus === 'paid'
      const revenueMatch =
        !paymentAllowsRevenue
          ? { ...matchConditions, paymentStatus: '__no_revenue_payment__' }
          : params.status && params.status !== 'all'
          ? params.status === 'cancelled'
            ? { ...matchConditions, orderStatus: '__no_revenue_status__', paymentStatus: 'paid' }
            : { ...matchConditions, paymentStatus: 'paid' }
          : { ...matchConditions, orderStatus: { $ne: 'cancelled' }, paymentStatus: 'paid' }

      // ✅ FIX: Use aggregation + countDocuments instead of loading ALL orders into RAM
      const [total, pending, processing, shipped, delivered, cancelled, returned, revenueResult, todayOrders] = await Promise.all([
        databaseService.orders.countDocuments(matchConditions),
        databaseService.orders.countDocuments(statusMatch('pending')),
        databaseService.orders.countDocuments(statusMatch('processing')),
        databaseService.orders.countDocuments(statusMatch('shipped')),
        databaseService.orders.countDocuments(statusMatch('delivered')),
        databaseService.orders.countDocuments(statusMatch('cancelled')),
        databaseService.orders.countDocuments(statusMatch('returned')),
        databaseService.orders
          .aggregate([
            { $match: revenueMatch },
            { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
          ])
          .toArray(),
        databaseService.orders.countDocuments({ ...matchConditions, createdAt: { $gte: today } })
      ])

      return {
        total,
        pending,
        processing,
        shipped,
        delivered,
        cancelled,
        returned,
        revenue: revenueResult[0]?.total || 0,
        revenueOrderCount: revenueResult[0]?.count || 0,
        averageOrderValue: revenueResult[0]?.count ? (revenueResult[0].total || 0) / revenueResult[0].count : 0,
        todayOrders
      }
    }, 60) // Cache 60 seconds
  }

  async getOrderDetails(orderId: string) {
    const order = await databaseService.orders
      .aggregate([
        { $match: { _id: new ObjectId(orderId) } },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'customer'
          }
        },
        { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'products',
            localField: 'items.productId',
            foreignField: '_id',
            as: 'products'
          }
        }
      ])
      .next()

    if (!order) {
      throw new Error('Order not found')
    }

    return order
  }

  async updateOrderStatus(
    orderId: string,
    data: {
      status: string
      notes?: string
      trackingNumber?: string
    }
  ) {
    return orderService.updateOrderStatus(new ObjectId(orderId), data.status, data.trackingNumber, data.notes)
  }

  // ==================== PRESCRIPTION MANAGEMENT ====================

  async getAllPrescriptions(params: { page?: number; limit?: number; status?: string; search?: string }) {
    const page = params.page || 1
    const limit = params.limit || 10
    const skip = (page - 1) * limit

    // 1. Initial Match (Status)
    const initialMatch: Record<string, unknown> = {}
    if (params.status && params.status !== 'all') {
      initialMatch.status = params.status
    }

    // 2. Search Match (After Lookup)
    const searchMatch: Record<string, unknown> = {}
    if (params.search) {
      const searchRegex = { $regex: params.search, $options: 'i' }
      searchMatch.$or = [
        { prescriptionNumber: searchRegex },
        { doctorName: searchRegex },
        { hospitalName: searchRegex },
        { 'customer.firstName': searchRegex },
        { 'customer.lastName': searchRegex },
        { 'customer.email': searchRegex },
        { 'pharmacist.firstName': searchRegex },
        { 'pharmacist.lastName': searchRegex }
      ]
    }

    const [result] = await databaseService.prescriptions
      .aggregate([
        { $match: initialMatch },
        {
          $lookup: {
            from: 'users',
            localField: 'customerId',
            foreignField: '_id',
            as: 'customer'
          }
        },
        { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'users',
            localField: 'verifiedBy',
            foreignField: '_id',
            as: 'pharmacist'
          }
        },
        { $unwind: { path: '$pharmacist', preserveNullAndEmptyArrays: true } },
        { $match: searchMatch },
        {
          $facet: {
            data: [
              { $sort: { createdAt: -1 } },
              { $skip: skip },
              { $limit: limit },
              {
                $project: {
                  _id: 1,
                  prescriptionNumber: 1,
                  customerId: 1,
                  doctorName: 1,
                  hospitalName: 1,
                  prescriptionDate: 1,
                  images: 1,
                  medications: 1,
                  status: 1,
                  verifiedBy: 1,
                  verifiedAt: 1,
                  notes: 1,
                  validUntil: 1,
                  createdAt: 1,
                  updatedAt: 1,
                  customerName: {
                    $cond: {
                      if: { $ne: ['$customer', null] },
                      then: { $concat: ['$customer.firstName', ' ', '$customer.lastName'] },
                      else: 'Unknown Customer'
                    }
                  },
                  customerEmail: { $ifNull: ['$customer.email', ''] },
                  customerPhone: { $ifNull: ['$customer.phoneNumber', ''] },
                  pharmacistId: '$verifiedBy',
                  pharmacistName: {
                    $cond: {
                      if: { $ne: ['$pharmacist', null] },
                      then: { $concat: ['$pharmacist.firstName', ' ', '$pharmacist.lastName'] },
                      else: 'Chưa phân công'
                    }
                  },
                  pharmacistEmail: { $ifNull: ['$pharmacist.email', ''] },
                  pharmacistPhone: { $ifNull: ['$pharmacist.phoneNumber', ''] }
                }
              }
            ],
            total: [{ $count: 'count' }]
          }
        }
      ])
      .toArray()

    const prescriptions = result.data
    const total = result.total[0]?.count || 0

    return {
      prescriptions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  }

  async getPrescriptionStats() {
    const prescriptions = await databaseService.prescriptions.find({}).toArray()

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const stats = {
      total: prescriptions.length,
      pending: prescriptions.filter((p) => p.status === 'pending').length,
      verified: prescriptions.filter((p) => p.status === 'verified').length,
      rejected: prescriptions.filter((p) => p.status === 'rejected').length,
      verifiedToday: prescriptions.filter((p) => {
        if (!p.verifiedAt) return false
        const verifiedDate = new Date(p.verifiedAt)
        verifiedDate.setHours(0, 0, 0, 0)
        return verifiedDate.getTime() === today.getTime()
      }).length
    }

    return stats
  }

  async updatePrescriptionStatus(
    prescriptionId: string,
    data: {
      status: string
      notes?: string
    }
  ) {
    const updateData: Record<string, unknown> = {
      status: data.status,
      updatedAt: new Date()
    }

    if (data.notes) {
      updateData.notes = data.notes
    }

    if (data.status === 'verified') {
      updateData.verifiedAt = new Date()
    }

    const result = await databaseService.prescriptions.findOneAndUpdate(
      { _id: new ObjectId(prescriptionId) },
      { $set: updateData },
      { returnDocument: 'after' }
    )

    if (!result) {
      throw new Error('Prescription not found')
    }

    return result
  }

  async bulkUpdatePrescriptions(prescriptionIds: string[], status: string) {
    const objectIds = prescriptionIds.map((id) => new ObjectId(id))

    const updateData: Record<string, unknown> = {
      status,
      updatedAt: new Date()
    }

    if (status === 'verified') {
      updateData.verifiedAt = new Date()
    }

    const result = await databaseService.prescriptions.updateMany({ _id: { $in: objectIds } }, { $set: updateData })

    return {
      modifiedCount: result.modifiedCount
    }
  }

  // ==================== REPORTS & ANALYTICS ====================

  /**
   * Get comprehensive reports analytics
   */
  async getReportsAnalytics(timeRange: string = 'month', customStartDate?: string, customEndDate?: string) {
    const { startDate, endDate, previousStartDate, previousEndDate } = this.getDateRanges(
      timeRange,
      customStartDate,
      customEndDate
    )

    const [revenueData, ordersData, usersData, productsData] = await Promise.all([
      this.getRevenueAnalytics(timeRange, customStartDate, customEndDate),
      this.getOrderStats(),
      this.getUserStats(),
      this.getProductAnalytics(timeRange, customStartDate, customEndDate)
    ])

    // ---- Calculate REAL orders growth ----
    const [currentPeriodOrderCount, previousPeriodOrderCount] = await Promise.all([
      databaseService.orders.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate }
      }),
      databaseService.orders.countDocuments({
        createdAt: { $gte: previousStartDate, $lte: previousEndDate }
      })
    ])
    const ordersGrowth =
      previousPeriodOrderCount > 0
        ? ((currentPeriodOrderCount - previousPeriodOrderCount) / previousPeriodOrderCount) * 100
        : 0

    // ---- Calculate REAL user metrics ----
    const [newUsersCount, previousNewUsersCount] = await Promise.all([
      databaseService.users.countDocuments({
        role: UserRole.Customer,
        createdAt: { $gte: startDate, $lte: endDate }
      }),
      databaseService.users.countDocuments({
        role: UserRole.Customer,
        createdAt: { $gte: previousStartDate, $lte: previousEndDate }
      })
    ])
    const usersGrowth =
      previousNewUsersCount > 0 ? ((newUsersCount - previousNewUsersCount) / previousNewUsersCount) * 100 : 0

    // Returning users = unique customers who placed orders in current period AND existed before this period
    const returningCustomers = await databaseService.orders
      .aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            orderStatus: { $ne: 'cancelled' }
          }
        },
        {
          $lookup: {
            from: process.env.USERS_COLLECTION as string,
            localField: 'userId',
            foreignField: '_id',
            as: 'user'
          }
        },
        { $unwind: '$user' },
        {
          $match: {
            'user.createdAt': { $lt: startDate } // User registered before this period
          }
        },
        {
          $group: { _id: '$userId' }
        }
      ])
      .toArray()
    const returningUsersCount = returningCustomers.length

    // ---- Calculate REAL conversion rate ----
    // Conversion = (unique customers who completed an order in period / total customers) × 100
    const uniqueOrderingCustomers = await databaseService.orders
      .aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            orderStatus: { $ne: 'cancelled' }
          }
        },
        { $group: { _id: '$userId' } }
      ])
      .toArray()
    const totalCustomers = usersData.customers
    const conversionRate = totalCustomers > 0 ? (uniqueOrderingCustomers.length / totalCustomers) * 100 : 0

    // ---- Calculate REAL customer retention ----
    // Retention = returning customers / (returning + new ordering customers) × 100
    const newOrderingCustomers = uniqueOrderingCustomers.length - returningUsersCount
    const customerRetention =
      uniqueOrderingCustomers.length > 0 ? (returningUsersCount / uniqueOrderingCustomers.length) * 100 : 0

    // Calculate metrics
    const avgOrderValue = ordersData.revenue > 0 && ordersData.total > 0 ? ordersData.revenue / ordersData.total : 0

    return {
      revenue: revenueData,
      orders: {
        total: ordersData.total,
        growth: Math.round(ordersGrowth * 100) / 100,
        pending: ordersData.pending,
        processing: ordersData.processing,
        completed: ordersData.delivered,
        cancelled: ordersData.cancelled,
        todayCount: ordersData.todayOrders,
        statusBreakdown: {
          pending: ordersData.pending,
          processing: ordersData.processing,
          shipped: ordersData.shipped,
          delivered: ordersData.delivered,
          cancelled: ordersData.cancelled
        }
      },
      users: {
        total: usersData.total,
        growth: Math.round(usersGrowth * 100) / 100,
        newUsers: newUsersCount,
        returningUsers: returningUsersCount,
        customers: usersData.customers,
        pharmacists: usersData.pharmacists,
        admins: usersData.admins,
        verified: usersData.verified
      },
      products: productsData,
      metrics: {
        avgOrderValue: Math.round(avgOrderValue),
        conversionRate: Math.round(conversionRate * 100) / 100,
        customerRetention: Math.round(customerRetention * 100) / 100
      }
    }
  }

  /**
   * Get revenue analytics with time-based filtering
   */
  async getRevenueAnalytics(timeRange: string = 'month', customStartDate?: string, customEndDate?: string) {
    const { startDate, endDate, previousStartDate, previousEndDate } = this.getDateRanges(
      timeRange,
      customStartDate,
      customEndDate
    )

    // Current period orders
    const currentOrders = await databaseService.orders
      .find({
        createdAt: { $gte: startDate, $lte: endDate },
        paymentStatus: 'paid'
      })
      .toArray()

    // Previous period orders for growth calculation
    const previousOrders = await databaseService.orders
      .find({
        createdAt: { $gte: previousStartDate, $lte: previousEndDate },
        paymentStatus: 'paid'
      })
      .toArray()

    const currentRevenue = currentOrders.reduce((sum, order) => sum + order.totalAmount, 0)
    const previousRevenue = previousOrders.reduce((sum, order) => sum + order.totalAmount, 0)

    const growth = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0

    // Get today's revenue
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayOrders = await databaseService.orders
      .find({
        createdAt: { $gte: today },
        paymentStatus: 'paid'
      })
      .toArray()
    const todayRevenue = todayOrders.reduce((sum, order) => sum + order.totalAmount, 0)

    // Monthly trends (last 3 months)
    const monthlyTrends = await this.getMonthlyRevenueTrends(3)

    // Revenue by payment method
    const byPaymentMethod: Record<string, number> = {}
    currentOrders.forEach((order) => {
      const method = order.paymentMethod || 'unknown'
      byPaymentMethod[method] = (byPaymentMethod[method] || 0) + order.totalAmount
    })

    const avgOrderValue = currentOrders.length > 0 ? currentRevenue / currentOrders.length : 0

    // Calculate actual year-to-date revenue
    const startOfYear = new Date(new Date().getFullYear(), 0, 1)
    const yearToDateOrders = await databaseService.orders
      .aggregate([
        {
          $match: {
            createdAt: { $gte: startOfYear },
            paymentStatus: 'paid'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$totalAmount' }
          }
        }
      ])
      .toArray()
    const yearRevenue = yearToDateOrders[0]?.total || 0

    // Calculate actual month-to-date revenue
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const monthToDateOrders = await databaseService.orders
      .aggregate([
        {
          $match: {
            createdAt: { $gte: startOfMonth },
            paymentStatus: 'paid'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$totalAmount' }
          }
        }
      ])
      .toArray()
    const monthRevenue = monthToDateOrders[0]?.total || 0

    return {
      total: currentRevenue,
      today: todayRevenue,
      month: monthRevenue,
      year: yearRevenue,
      growth: Math.round(growth * 100) / 100,
      monthlyTrends,
      byPaymentMethod,
      avgOrderValue: Math.round(avgOrderValue)
    }
  }

  /**
   * Get product analytics
   */
  async getProductAnalytics(timeRange: string = 'month', customStartDate?: string, customEndDate?: string) {
    const { startDate, endDate, previousStartDate, previousEndDate } = this.getDateRanges(
      timeRange,
      customStartDate,
      customEndDate
    )

    // Get all products and categories in parallel
    const [products, categories] = await Promise.all([
      databaseService.products.find().toArray(),
      databaseService.categories.find().toArray()
    ])

    // Build category name map for quick lookup
    const categoryNameMap: Record<string, string> = {}
    categories.forEach((cat) => {
      if (cat._id) {
        categoryNameMap[cat._id.toString()] = cat.name
      }
    })

    // Get orders in current and previous time range
    const [orders, previousOrders] = await Promise.all([
      databaseService.orders
        .find({
          createdAt: { $gte: startDate, $lte: endDate },
          orderStatus: { $ne: 'cancelled' }
        })
        .toArray(),
      databaseService.orders
        .find({
          createdAt: { $gte: previousStartDate, $lte: previousEndDate },
          orderStatus: { $ne: 'cancelled' }
        })
        .toArray()
    ])

    // Calculate product sales for current period
    const productSales: Record<string, { sales: number; revenue: number; product: unknown }> = {}

    orders.forEach((order) => {
      order.items.forEach((item: { productId: ObjectId; quantity: number; unitPrice: number }) => {
        const productId = item.productId.toString()
        if (!productSales[productId]) {
          const product = products.find((p) => p._id?.toString() === productId)
          productSales[productId] = {
            sales: 0,
            revenue: 0,
            product
          }
        }
        productSales[productId].sales += item.quantity
        productSales[productId].revenue += item.unitPrice * item.quantity
      })
    })

    // Calculate product sales for previous period (for growth comparison)
    const prevProductSales: Record<string, { sales: number; revenue: number }> = {}
    previousOrders.forEach((order) => {
      order.items.forEach((item: { productId: ObjectId; quantity: number; unitPrice: number }) => {
        const productId = item.productId.toString()
        if (!prevProductSales[productId]) {
          prevProductSales[productId] = { sales: 0, revenue: 0 }
        }
        prevProductSales[productId].sales += item.quantity
        prevProductSales[productId].revenue += item.unitPrice * item.quantity
      })
    })

    // Get top 10 products with real category names and growth
    const topProducts = Object.entries(productSales)
      .map(([id, data]) => {
        const categoryId = (data.product as { categoryId?: ObjectId })?.categoryId?.toString() || ''
        const prevData = prevProductSales[id]
        const growth =
          prevData && prevData.revenue > 0 ? ((data.revenue - prevData.revenue) / prevData.revenue) * 100 : 0
        return {
          _id: id,
          name: (data.product as { name?: string })?.name || 'Unknown',
          sku: (data.product as { sku?: string })?.sku || '',
          sales: data.sales,
          revenue: data.revenue,
          category: categoryId,
          categoryName: categoryNameMap[categoryId] || 'Chưa phân loại',
          growth: Math.round(growth * 100) / 100
        }
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)

    // Sales by category with real category names
    const categorySales: Record<string, { count: number; sales: number; revenue: number }> = {}

    Object.values(productSales).forEach((data) => {
      const categoryId = (data.product as { categoryId?: ObjectId })?.categoryId?.toString() || 'uncategorized'
      if (!categorySales[categoryId]) {
        categorySales[categoryId] = { count: 0, sales: 0, revenue: 0 }
      }
      categorySales[categoryId].count++
      categorySales[categoryId].sales += data.sales
      categorySales[categoryId].revenue += data.revenue
    })

    const totalRevenue = Object.values(categorySales).reduce((sum, cat) => sum + cat.revenue, 0)

    const salesByCategory = Object.entries(categorySales).map(([categoryId, data]) => ({
      category: categoryId,
      categoryName: categoryNameMap[categoryId] || 'Chưa phân loại',
      productCount: data.count,
      totalSales: data.sales,
      totalRevenue: data.revenue,
      percentage: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0
    }))

    // Stock status
    const activeProducts = products.filter((p) => p.isActive).length
    const outOfStockProducts = products.filter((p) => p.stockQuantity === 0).length
    const lowStockProducts = products.filter((p) => p.stockQuantity > 0 && p.stockQuantity < 20).length

    // Product trends — real calculations
    const newProductsInPeriod = products.filter(
      (p) => p.createdAt && p.createdAt >= startDate && p.createdAt <= endDate
    ).length
    const previousPeriodProducts = products.filter(
      (p) => p.createdAt && p.createdAt >= previousStartDate && p.createdAt <= previousEndDate
    ).length
    const inactiveInPeriod = products.filter(
      (p) => !p.isActive && p.updatedAt && p.updatedAt >= startDate && p.updatedAt <= endDate
    ).length
    const productGrowthRate =
      previousPeriodProducts > 0 ? ((newProductsInPeriod - previousPeriodProducts) / previousPeriodProducts) * 100 : 0

    return {
      topProducts,
      salesByCategory,
      stockStatus: {
        total: products.length,
        active: activeProducts,
        outOfStock: outOfStockProducts,
        lowStock: lowStockProducts
      },
      trends: {
        newProducts: newProductsInPeriod,
        discontinuedProducts: inactiveInPeriod,
        growthRate: Math.round(productGrowthRate * 100) / 100
      }
    }
  }

  /**
   * Get customer analytics
   */
  async getCustomerAnalytics(timeRange: string = 'month', customStartDate?: string, customEndDate?: string) {
    const { startDate, endDate, previousStartDate, previousEndDate } = this.getDateRanges(
      timeRange,
      customStartDate,
      customEndDate
    )

    // Total customers
    const totalCustomers = await databaseService.users.countDocuments({ role: UserRole.Customer })

    // New customers in current period
    const newCustomers = await databaseService.users.countDocuments({
      role: UserRole.Customer,
      createdAt: { $gte: startDate, $lte: endDate }
    })

    // Previous period new customers for growth
    const previousNewCustomers = await databaseService.users.countDocuments({
      role: UserRole.Customer,
      createdAt: { $gte: previousStartDate, $lte: previousEndDate }
    })

    // Get customers with orders in current period (active/returning)
    const customersWithOrders = await databaseService.orders
      .aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: '$userId'
          }
        }
      ])
      .toArray()

    const returningCustomers = Math.max(0, customersWithOrders.length - newCustomers)

    // Retention rate
    const retentionRate = totalCustomers > 0 ? (returningCustomers / totalCustomers) * 100 : 0

    // Customer lifetime value (average order value × average orders per customer)
    const totalOrders = await databaseService.orders.countDocuments({ orderStatus: { $ne: 'cancelled' } })
    const totalRevenueResult = await databaseService.orders
      .aggregate([
        { $match: { paymentStatus: 'paid', orderStatus: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ])
      .toArray()

    const avgOrderValue =
      totalOrders > 0 && totalRevenueResult.length > 0 ? totalRevenueResult[0].total / totalOrders : 0
    const avgOrdersPerCustomer = totalCustomers > 0 ? totalOrders / totalCustomers : 0
    const lifetimeValue = avgOrderValue * avgOrdersPerCustomer

    // ---- REAL daily growth ----
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)
    const dayBefore = new Date(yesterday)
    dayBefore.setDate(dayBefore.getDate() - 1)

    const [todayNewCount, yesterdayNewCount] = await Promise.all([
      databaseService.users.countDocuments({
        role: UserRole.Customer,
        createdAt: { $gte: yesterday }
      }),
      databaseService.users.countDocuments({
        role: UserRole.Customer,
        createdAt: { $gte: dayBefore, $lt: yesterday }
      })
    ])
    const dailyGrowth = yesterdayNewCount > 0 ? ((todayNewCount - yesterdayNewCount) / yesterdayNewCount) * 100 : 0

    // ---- REAL weekly growth ----
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
    const twoWeeksAgo = new Date()
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

    const [thisWeekCount, lastWeekCount] = await Promise.all([
      databaseService.users.countDocuments({
        role: UserRole.Customer,
        createdAt: { $gte: oneWeekAgo }
      }),
      databaseService.users.countDocuments({
        role: UserRole.Customer,
        createdAt: { $gte: twoWeeksAgo, $lt: oneWeekAgo }
      })
    ])
    const weeklyGrowth = lastWeekCount > 0 ? ((thisWeekCount - lastWeekCount) / lastWeekCount) * 100 : 0

    // Monthly growth
    const monthlyGrowth =
      previousNewCustomers > 0 ? ((newCustomers - previousNewCustomers) / previousNewCustomers) * 100 : 0

    // ---- REAL byLocation from shipping addresses ----
    const locationData = await databaseService.orders
      .aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            'shippingAddress.province': { $exists: true, $ne: '' }
          }
        },
        {
          $group: {
            _id: '$shippingAddress.province',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
      .toArray()

    const totalLocationOrders = locationData.reduce((sum, loc) => sum + loc.count, 0)
    const byLocation = locationData.map((loc) => ({
      province: loc._id || 'Không xác định',
      count: loc.count,
      percentage: totalLocationOrders > 0 ? Math.round((loc.count / totalLocationOrders) * 10000) / 100 : 0
    }))

    // ---- REAL VIP customers (5+ orders) ----
    const vipCustomers = await databaseService.orders
      .aggregate([
        {
          $match: { orderStatus: { $ne: 'cancelled' } }
        },
        {
          $group: {
            _id: '$userId',
            orderCount: { $sum: 1 }
          }
        },
        {
          $match: { orderCount: { $gte: 5 } }
        },
        {
          $count: 'total'
        }
      ])
      .toArray()
    const vipCount = vipCustomers[0]?.total || 0

    return {
      total: totalCustomers,
      newCustomers,
      returningCustomers,
      retentionRate: Math.round(retentionRate * 100) / 100,
      lifetimeValue: Math.round(lifetimeValue),
      byLocation,
      bySegment: {
        active: customersWithOrders.length,
        inactive: totalCustomers - customersWithOrders.length,
        vip: vipCount
      },
      growth: {
        daily: Math.round(dailyGrowth * 100) / 100,
        weekly: Math.round(weeklyGrowth * 100) / 100,
        monthly: Math.round(monthlyGrowth * 100) / 100
      }
    }
  }

  /**
   * Helper: Get monthly revenue trends
   */
  private async getMonthlyRevenueTrends(months: number = 3) {
    const trends = []
    const now = new Date()

    for (let i = months - 1; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)

      const orders = await databaseService.orders
        .find({
          createdAt: { $gte: monthStart, $lte: monthEnd },
          paymentStatus: 'paid'
        })
        .toArray()

      const revenue = orders.reduce((sum, order) => sum + order.totalAmount, 0)

      trends.push({
        month: monthStart.toLocaleDateString('vi-VN', { month: 'short' }),
        revenue,
        orderCount: orders.length
      })
    }

    return trends
  }

  /**
   * Helper: Get date ranges based on time range parameter
   */
  private getDateRanges(timeRange: string, customStartDate?: string, customEndDate?: string) {
    const now = new Date()
    let startDate: Date
    let endDate: Date
    let previousStartDate: Date
    let previousEndDate: Date

    switch (timeRange) {
      case 'custom': {
        // Custom date range from query params
        startDate = customStartDate ? new Date(customStartDate) : new Date(now.getFullYear(), now.getMonth(), 1)
        endDate = customEndDate ? new Date(customEndDate) : new Date()
        // Set end of day for endDate
        endDate.setHours(23, 59, 59, 999)
        // Previous period = same duration mirrored before startDate
        const durationMs = endDate.getTime() - startDate.getTime()
        previousEndDate = new Date(startDate.getTime() - 1)
        previousStartDate = new Date(previousEndDate.getTime() - durationMs)
        break
      }
      case 'week': {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        endDate = new Date()
        previousStartDate = new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000)
        previousEndDate = new Date(startDate.getTime() - 1)
        break
      }
      case 'month': {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        endDate = new Date()
        previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        previousEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
        break
      }
      case 'quarter': {
        const currentQuarter = Math.floor(now.getMonth() / 3)
        startDate = new Date(now.getFullYear(), currentQuarter * 3, 1)
        endDate = new Date()
        previousStartDate = new Date(now.getFullYear(), (currentQuarter - 1) * 3, 1)
        previousEndDate = new Date(now.getFullYear(), currentQuarter * 3, 0, 23, 59, 59)
        break
      }
      case 'year': {
        startDate = new Date(now.getFullYear(), 0, 1)
        endDate = new Date()
        previousStartDate = new Date(now.getFullYear() - 1, 0, 1)
        previousEndDate = new Date(now.getFullYear(), 0, 0, 23, 59, 59)
        break
      }
      default: {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        endDate = new Date()
        previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        previousEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
        break
      }
    }

    return { startDate, endDate, previousStartDate, previousEndDate }
  }

  // ==================== INVENTORY MANAGEMENT ====================

  /** Ngưỡng cảnh báo sắp hết hàng (đơn vị nhỏ nhất) */
  static readonly LOW_STOCK_THRESHOLD = 10

  /**
   * Get inventory statistics
   */
  async getInventoryStats() {
    const LOW_STOCK_THRESHOLD = AdminService.LOW_STOCK_THRESHOLD

    const [total, active, outOfStock, lowStock, totalValueResult] = await Promise.all([
      databaseService.products.countDocuments(),
      databaseService.products.countDocuments({ isActive: true, stockQuantity: { $gt: 0 } }),
      databaseService.products.countDocuments({ stockQuantity: { $lte: 0 } }),
      databaseService.products.countDocuments({ stockQuantity: { $gt: 0, $lte: LOW_STOCK_THRESHOLD } }),
      // Fix: dùng giá của đơn vị nhỏ nhất (quantityPerUnit===1) hoặc isDefault để tính giá trị kho chính xác
      databaseService.products
        .aggregate([
          {
            $project: {
              value: {
                $multiply: [
                  '$stockQuantity',
                  {
                    $ifNull: [
                      // Ưu tiên 1: variant có quantityPerUnit === 1 (đơn vị cơ sở)
                      {
                        $let: {
                          vars: {
                            baseVariant: {
                              $first: {
                                $filter: {
                                  input: { $ifNull: ['$priceVariants', []] },
                                  as: 'v',
                                  cond: { $eq: ['$$v.quantityPerUnit', 1] }
                                }
                              }
                            }
                          },
                          in: '$$baseVariant.price'
                        }
                      },
                      // Ưu tiên 2: variant isDefault
                      {
                        $let: {
                          vars: {
                            defaultVariant: {
                              $first: {
                                $filter: {
                                  input: { $ifNull: ['$priceVariants', []] },
                                  as: 'v',
                                  cond: { $eq: ['$$v.isDefault', true] }
                                }
                              }
                            }
                          },
                          in: '$$defaultVariant.price'
                        }
                      },
                      // Fallback: variant đầu tiên
                      { $arrayElemAt: ['$priceVariants.price', 0] },
                      0
                    ]
                  }
                ]
              }
            }
          },
          { $group: { _id: null, totalValue: { $sum: '$value' } } }
        ])
        .toArray()
    ])

    return {
      total,
      active,
      outOfStock,
      lowStock,
      totalValue: totalValueResult[0]?.totalValue || 0,
      lowStockThreshold: LOW_STOCK_THRESHOLD
    }
  }

  /**
   * Get inventory products with pagination and stock filters
   */
  async getInventoryProducts(params: {
    page?: number
    limit?: number
    stockFilter?: string // 'all' | 'inStock' | 'lowStock' | 'outOfStock'
    search?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  }) {
    const LOW_STOCK_THRESHOLD = AdminService.LOW_STOCK_THRESHOLD
    const page = params.page || 1
    const limit = params.limit || 20
    const skip = (page - 1) * limit

    const filter: Record<string, unknown> = {}

    // Stock filter
    switch (params.stockFilter) {
      case 'inStock':
        filter.stockQuantity = { $gt: LOW_STOCK_THRESHOLD }
        break
      case 'lowStock':
        filter.stockQuantity = { $gt: 0, $lte: LOW_STOCK_THRESHOLD }
        break
      case 'outOfStock':
        filter.stockQuantity = { $lte: 0 }
        break
      // 'all' or undefined — no filter
    }

    // Search filter
    if (params.search) {
      filter.$or = [
        { name: { $regex: params.search, $options: 'i' } },
        { sku: { $regex: params.search, $options: 'i' } },
        { barcode: { $regex: params.search, $options: 'i' } }
      ]
    }

    const sortBy = params.sortBy || 'stockQuantity'
    const sortOrder = params.sortOrder === 'desc' ? -1 : 1

    const [products, total] = await Promise.all([
      databaseService.products
        .aggregate([
          { $match: filter },
          {
            $lookup: {
              from: 'categories',
              localField: 'categoryId',
              foreignField: '_id',
              as: 'category',
              pipeline: [{ $project: { _id: 1, name: 1 } }]
            }
          },
          {
            $lookup: {
              from: 'brands',
              localField: 'brandId',
              foreignField: '_id',
              as: 'brand',
              pipeline: [{ $project: { _id: 1, name: 1 } }]
            }
          },
          {
            $addFields: {
              category: { $arrayElemAt: ['$category', 0] },
              brand: { $arrayElemAt: ['$brand', 0] }
            }
          },
          {
            $project: {
              _id: 1,
              name: 1,
              sku: 1,
              barcode: 1,
              featuredImage: 1,
              stockQuantity: 1,
              status: 1,
              isActive: 1,
              priceVariants: 1,
              category: 1,
              brand: 1,
              updatedAt: 1
            }
          },
          { $sort: { [sortBy]: sortOrder } },
          { $skip: skip },
          { $limit: limit }
        ])
        .toArray(),
      databaseService.products.countDocuments(filter)
    ])

    return {
      products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }
  }

  /**
   * Update product stock quantity.
   * Hỗ trợ 2 mode:
   * - Absolute mode (mặc định): truyền `stockQuantity` trực tiếp
   * - Unit mode: truyền `unit` + `quantityInput` để hệ thống tự quy đổi
   *   VD: unit='Hộp', quantityInput=5 → nếu 1 Hộp = 30 Viên → stockQuantity += 5×30
   *   adjustment='add' | 'subtract' | 'set' (mặc định 'set')
   */
  async updateProductStock(
    productId: string,
    stockQuantity: number,
    options?: {
      unit?: string
      quantityInput?: number
      adjustment?: 'add' | 'subtract' | 'set'
    }
  ) {
    // Fetch current product to resolve priceVariants
    const product = await databaseService.products.findOne({ _id: new ObjectId(productId) })
    if (!product) {
      throw new Error('Product not found')
    }

    let finalStock: number

    if (options?.unit && options?.quantityInput !== undefined) {
      // Unit mode: tìm quantityPerUnit cho đơn vị được chọn, rồi quy đổi
      const variant = (product.priceVariants as Array<{ unit: string; quantityPerUnit?: number }> | undefined)
        ?.find((v) => v.unit === options.unit)
      const quantityPerUnit = variant?.quantityPerUnit || 1
      const baseUnitAmount = options.quantityInput * quantityPerUnit

      const adjustment = options.adjustment || 'set'
      if (adjustment === 'add') {
        finalStock = (product.stockQuantity || 0) + baseUnitAmount
      } else if (adjustment === 'subtract') {
        finalStock = (product.stockQuantity || 0) - baseUnitAmount
      } else {
        // 'set' — đặt thẳng giá trị, nhưng đơn vị đang được chọn → vẫn quy đổi
        finalStock = baseUnitAmount
      }
    } else {
      // Absolute mode: dùng stockQuantity trực tiếp
      finalStock = stockQuantity
    }

    if (finalStock < 0) {
      throw new Error('Stock quantity cannot be negative')
    }

    const result = await databaseService.products.findOneAndUpdate(
      { _id: new ObjectId(productId) },
      {
        $set: {
          stockQuantity: finalStock,
          status:
            product.status === 'discontinued' || product.status === 'out_of_stock'
              ? product.status
              : finalStock === 0
                ? 'out_of_stock'
                : 'active',
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    )

    if (!result) {
      throw new Error('Product not found')
    }

    // Low-stock alert: cảnh báo admin nếu tồn kho sau cập nhật ≤ 30 (fire-and-forget)
    const NOTIFICATION_LOW_STOCK_THRESHOLD = 30
    if (finalStock <= NOTIFICATION_LOW_STOCK_THRESHOLD) {
      try {
        const io = getIO()
        notificationService.notifyLowStock(
          result._id!,
          result.name,
          finalStock,
          io
        ).catch(() => {})
      } catch { /* socket not ready */ }
    }

    return result
  }
}

const adminService = new AdminService()
export default adminService
