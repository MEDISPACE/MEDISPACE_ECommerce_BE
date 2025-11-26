import databaseService from './database.services'
import { ObjectId } from 'mongodb'
import User from '~/models/schemas/User.schema'
import { hashPassword } from '~/utils/crypto'
import { UserRole, UserStatus } from '~/constants/enum'
import { signToken } from '~/utils/jwt'
import { TokenType } from '~/constants/enum'
import { config } from 'dotenv'

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
    metadata?: Record<string, any>
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
    /**
     * Get dashboard statistics
     */
    async getDashboardStats(): Promise<DashboardStats> {
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
        const startOfYear = new Date(today.getFullYear(), 0, 1)
        const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59)

        // Revenue calculations
        const [todayOrders, monthOrders, yearOrders, lastMonthOrders] = await Promise.all([
            databaseService.orders
                .find({
                    createdAt: { $gte: today },
                    paymentStatus: 'paid'
                })
                .toArray(),
            databaseService.orders
                .find({
                    createdAt: { $gte: startOfMonth },
                    paymentStatus: 'paid'
                })
                .toArray(),
            databaseService.orders
                .find({
                    createdAt: { $gte: startOfYear },
                    paymentStatus: 'paid'
                })
                .toArray(),
            databaseService.orders
                .find({
                    createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
                    paymentStatus: 'paid'
                })
                .toArray()
        ])

        const todayRevenue = todayOrders.reduce((sum, order) => sum + order.totalAmount, 0)
        const monthRevenue = monthOrders.reduce((sum, order) => sum + order.totalAmount, 0)
        const yearRevenue = yearOrders.reduce((sum, order) => sum + order.totalAmount, 0)
        const lastMonthRevenue = lastMonthOrders.reduce((sum, order) => sum + order.totalAmount, 0)

        const revenueGrowth = lastMonthRevenue > 0
            ? ((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
            : 0

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

        // Product statistics
        const products = await databaseService.products.find().toArray()
        const activeProducts = products.filter(p => p.isActive).length
        const outOfStockProducts = products.filter(p => p.stockQuantity === 0).length
        const lowStockProducts = products.filter(p => p.stockQuantity > 0 && p.stockQuantity < 20).length
        const totalProductValue = products.reduce((sum, p) => sum + (p.price * p.stockQuantity), 0)

        // Prescription statistics
        const [totalPrescriptions, pendingPrescriptions, approvedPrescriptions, rejectedPrescriptions] = await Promise.all([
            databaseService.prescriptions.countDocuments(),
            databaseService.prescriptions.countDocuments({ status: 'pending' }),
            databaseService.prescriptions.countDocuments({ status: 'approved' }),
            databaseService.prescriptions.countDocuments({ status: 'rejected' })
        ])

        return {
            revenue: {
                today: todayRevenue,
                month: monthRevenue,
                year: yearRevenue,
                growth: Math.round(revenueGrowth * 100) / 100
            },
            orders: {
                total: totalOrders,
                pending: pendingOrders,
                processing: processingOrders,
                completed: completedOrders,
                cancelled: cancelledOrders,
                todayCount: todayOrders.length
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
                total: products.length,
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
    }

    /**
     * Get recent activities
     */
    async getRecentActivities(limit: number = 10): Promise<RecentActivity[]> {
        const activities: RecentActivity[] = []

        // Get recent users
        const recentUsers = await databaseService.users
            .find()
            .sort({ createdAt: -1 })
            .limit(3)
            .toArray()

        recentUsers.forEach(user => {
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
        const recentOrders = await databaseService.orders
            .find()
            .sort({ createdAt: -1 })
            .limit(3)
            .toArray()

        recentOrders.forEach(order => {
            const severity = order.orderStatus === 'delivered' ? 'success' : 'info'
            const message = order.orderStatus === 'delivered'
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
        const recentPrescriptions = await databaseService.prescriptions
            .find()
            .sort({ createdAt: -1 })
            .limit(3)
            .toArray()

        recentPrescriptions.forEach(prescription => {
            const type = prescription.status === 'approved' ? 'prescription_approved' : 'prescription_uploaded'
            const severity = prescription.status === 'approved' ? 'success' : 'info'
            const message = prescription.status === 'approved'
                ? `Đơn thuốc đã được duyệt`
                : `Đơn thuốc mới chờ duyệt`

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
        return activities
            .sort((a, b) => b.time.getTime() - a.time.getTime())
            .slice(0, limit)
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
        const {
            page = 1,
            limit = 10,
            role,
            status,
            verified,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = params

        // Build filter query
        const filter: any = {}

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
            filter.$or = [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phoneNumber: { $regex: search, $options: 'i' } }
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
        const sanitizedUsers = users.map(user => {
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
     * Create new user (Admin only)
     */
    async createUser(userData: {
        email: string
        password: string
        firstName: string
        lastName: string
        phoneNumber: string
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
        const { password, emailVerifyToken, forgotPasswordToken, ...sanitizedUser } = user

        return sanitizedUser
    }

    /**
     * Update user
     */
    async updateUser(userId: string, updateData: Partial<User>) {
        // Remove fields that shouldn't be updated directly
        const { password, emailVerifyToken, forgotPasswordToken, _id, createdAt, ...safeUpdateData } = updateData as any

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
        const { password: pwd, emailVerifyToken: evt, forgotPasswordToken: fpt, ...sanitizedUser } = result

        return sanitizedUser
    }

    /**
     * Delete user
     */
    async deleteUser(userId: string) {
        const result = await databaseService.users.deleteOne({ _id: new ObjectId(userId) })

        if (result.deletedCount === 0) {
            throw new Error('User not found')
        }

        return { message: 'User deleted successfully' }
    }

    /**
     * Reset user password (Admin only)
     */
    async resetUserPassword(userId: string) {
        // Generate random password
        const newPassword = Math.random().toString(36).slice(-8)

        await databaseService.users.updateOne(
            { _id: new ObjectId(userId) },
            {
                $set: {
                    password: hashPassword(newPassword),
                    updatedAt: new Date()
                }
            }
        )

        // TODO: Send email with new password
        return {
            message: 'Password reset successfully',
            newPassword // In production, send via email instead
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
}

const adminService = new AdminService()
export default adminService
