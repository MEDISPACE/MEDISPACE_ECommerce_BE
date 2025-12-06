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
        const matchConditions: any = {}

        if (params.status && params.status !== 'all') {
            matchConditions.orderStatus = params.status
        }

        if (params.paymentStatus && params.paymentStatus !== 'all') {
            matchConditions.paymentStatus = params.paymentStatus
        }

        if (params.search) {
            matchConditions.$or = [
                { orderNumber: { $regex: params.search, $options: 'i' } },
                { 'shippingAddress.firstName': { $regex: params.search, $options: 'i' } },
                { 'shippingAddress.lastName': { $regex: params.search, $options: 'i' } },
                { 'shippingAddress.phone': { $regex: params.search, $options: 'i' } }
            ]
        }

        if (params.dateFrom || params.dateTo) {
            matchConditions.createdAt = {}
            if (params.dateFrom) {
                matchConditions.createdAt.$gte = new Date(params.dateFrom)
            }
            if (params.dateTo) {
                const dateTo = new Date(params.dateTo)
                dateTo.setHours(23, 59, 59, 999)
                matchConditions.createdAt.$lte = dateTo
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
                        createdAt: 1,
                        updatedAt: 1,
                        'customer.name': 1,
                        'customer.email': 1,
                        'customer.phone_number': 1
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

    async getOrderStats() {
        const orders = await databaseService.orders.find({}).toArray()

        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const stats = {
            total: orders.length,
            pending: orders.filter(o => o.orderStatus === 'pending').length,
            processing: orders.filter(o => o.orderStatus === 'processing').length,
            shipped: orders.filter(o => o.orderStatus === 'shipped').length,
            delivered: orders.filter(o => o.orderStatus === 'delivered').length,
            cancelled: orders.filter(o => o.orderStatus === 'cancelled').length,
            revenue: orders
                .filter(o => o.orderStatus !== 'cancelled' && o.paymentStatus === 'paid')
                .reduce((acc, curr) => acc + (curr.totalAmount || 0), 0),
            todayOrders: orders.filter(o => {
                const orderDate = new Date(o.createdAt || new Date())
                orderDate.setHours(0, 0, 0, 0)
                return orderDate.getTime() === today.getTime()
            }).length
        }

        return stats
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

    async updateOrderStatus(orderId: string, data: {
        status: string
        notes?: string
        trackingNumber?: string
    }) {
        const updateData: any = {
            orderStatus: data.status,
            updatedAt: new Date()
        }

        if (data.notes) {
            updateData.notes = data.notes
        }

        if (data.trackingNumber) {
            updateData.trackingNumber = data.trackingNumber
        }

        if (data.status === 'delivered') {
            updateData.paymentStatus = 'paid'
            updateData.deliveredAt = new Date()
        }

        const result = await databaseService.orders.findOneAndUpdate(
            { _id: new ObjectId(orderId) },
            { $set: updateData },
            { returnDocument: 'after' }
        )

        if (!result) {
            throw new Error('Order not found')
        }

        return result
    }

    // ==================== PRESCRIPTION MANAGEMENT ====================

    async getAllPrescriptions(params: {
        page?: number
        limit?: number
        status?: string
        search?: string
    }) {
        const page = params.page || 1
        const limit = params.limit || 10
        const skip = (page - 1) * limit

        // 1. Initial Match (Status)
        const initialMatch: any = {}
        if (params.status && params.status !== 'all') {
            initialMatch.status = params.status
        }

        // 2. Search Match (After Lookup)
        const searchMatch: any = {}
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
            pending: prescriptions.filter(p => p.status === 'pending').length,
            verified: prescriptions.filter(p => p.status === 'verified').length,
            rejected: prescriptions.filter(p => p.status === 'rejected').length,
            verifiedToday: prescriptions.filter(p => {
                if (!p.verifiedAt) return false
                const verifiedDate = new Date(p.verifiedAt)
                verifiedDate.setHours(0, 0, 0, 0)
                return verifiedDate.getTime() === today.getTime()
            }).length
        }

        return stats
    }

    async updatePrescriptionStatus(prescriptionId: string, data: {
        status: string
        notes?: string
    }) {
        const updateData: any = {
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
        const objectIds = prescriptionIds.map(id => new ObjectId(id))

        const updateData: any = {
            status,
            updatedAt: new Date()
        }

        if (status === 'verified') {
            updateData.verifiedAt = new Date()
        }

        const result = await databaseService.prescriptions.updateMany(
            { _id: { $in: objectIds } },
            { $set: updateData }
        )

        return {
            modifiedCount: result.modifiedCount
        }
    }

    // ==================== REPORTS & ANALYTICS ====================

    /**
     * Get comprehensive reports analytics
     */
    async getReportsAnalytics(timeRange: string = 'month') {
        const dateRanges = this.getDateRanges(timeRange)

        const [revenueData, ordersData, usersData, productsData] = await Promise.all([
            this.getRevenueAnalytics(timeRange),
            this.getOrderStats(),
            this.getUserStats(),
            this.getProductAnalytics(timeRange)
        ])

        // Calculate metrics
        const avgOrderValue = ordersData.revenue > 0 && ordersData.total > 0
            ? ordersData.revenue / ordersData.total
            : 0

        // Placeholder for conversion rate and retention (would need more complex tracking)
        const conversionRate = 3.8 // Placeholder
        const customerRetention = 68.5 // Placeholder

        return {
            revenue: revenueData,
            orders: {
                total: ordersData.total,
                growth: 0, // Calculate from previous period
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
                growth: 0, // Calculate from previous period
                newUsers: 0, // Would need time-based query
                returningUsers: 0, // Would need tracking
                customers: usersData.customers,
                pharmacists: usersData.pharmacists,
                admins: usersData.admins,
                verified: usersData.verified
            },
            products: productsData,
            metrics: {
                avgOrderValue: Math.round(avgOrderValue),
                conversionRate,
                customerRetention
            }
        }
    }

    /**
     * Get revenue analytics with time-based filtering
     */
    async getRevenueAnalytics(timeRange: string = 'month') {
        const { startDate, endDate, previousStartDate, previousEndDate } = this.getDateRanges(timeRange)

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

        const growth = previousRevenue > 0
            ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
            : 0

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
        currentOrders.forEach(order => {
            const method = order.paymentMethod || 'unknown'
            byPaymentMethod[method] = (byPaymentMethod[method] || 0) + order.totalAmount
        })

        const avgOrderValue = currentOrders.length > 0
            ? currentRevenue / currentOrders.length
            : 0

        return {
            total: currentRevenue,
            today: todayRevenue,
            month: currentRevenue,
            year: currentRevenue, // Would need year-to-date calculation
            growth: Math.round(growth * 100) / 100,
            monthlyTrends,
            byPaymentMethod,
            avgOrderValue: Math.round(avgOrderValue)
        }
    }

    /**
     * Get product analytics
     */
    async getProductAnalytics(timeRange: string = 'month') {
        const { startDate, endDate } = this.getDateRanges(timeRange)

        // Get all products
        const products = await databaseService.products.find().toArray()

        // Get orders in time range to calculate top products
        const orders = await databaseService.orders
            .find({
                createdAt: { $gte: startDate, $lte: endDate },
                orderStatus: { $ne: 'cancelled' }
            })
            .toArray()

        // Calculate product sales
        const productSales: Record<string, { sales: number; revenue: number; product: any }> = {}

        orders.forEach(order => {
            order.items.forEach((item: any) => {
                const productId = item.productId.toString()
                if (!productSales[productId]) {
                    const product = products.find(p => p._id?.toString() === productId)
                    productSales[productId] = {
                        sales: 0,
                        revenue: 0,
                        product
                    }
                }
                productSales[productId].sales += item.quantity
                productSales[productId].revenue += item.price * item.quantity
            })
        })

        // Get top 10 products
        const topProducts = Object.entries(productSales)
            .map(([id, data]) => ({
                _id: id,
                name: data.product?.name || 'Unknown',
                sku: data.product?.sku || '',
                sales: data.sales,
                revenue: data.revenue,
                category: data.product?.categoryId?.toString() || '',
                categoryName: '', // Would need category lookup
                growth: 0 // Would need previous period comparison
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10)

        // Sales by category
        const categorySales: Record<string, { count: number; sales: number; revenue: number }> = {}

        Object.values(productSales).forEach(data => {
            const categoryId = data.product?.categoryId?.toString() || 'uncategorized'
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
            categoryName: '', // Would need category lookup
            productCount: data.count,
            totalSales: data.sales,
            totalRevenue: data.revenue,
            percentage: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0
        }))

        // Stock status
        const activeProducts = products.filter(p => p.isActive).length
        const outOfStockProducts = products.filter(p => p.stockQuantity === 0).length
        const lowStockProducts = products.filter(p => p.stockQuantity > 0 && p.stockQuantity < 20).length

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
                newProducts: 0, // Would need time-based tracking
                discontinuedProducts: 0,
                growthRate: 0
            }
        }
    }

    /**
     * Get customer analytics
     */
    async getCustomerAnalytics(timeRange: string = 'month') {
        const { startDate, endDate, previousStartDate, previousEndDate } = this.getDateRanges(timeRange)

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

        // Get customers with orders (returning customers)
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

        const returningCustomers = customersWithOrders.length - newCustomers

        // Retention rate (simplified)
        const retentionRate = totalCustomers > 0
            ? (returningCustomers / totalCustomers) * 100
            : 0

        // Customer lifetime value (simplified - average order value * average orders per customer)
        const totalOrders = await databaseService.orders.countDocuments({ orderStatus: { $ne: 'cancelled' } })
        const totalRevenue = await databaseService.orders
            .aggregate([
                { $match: { paymentStatus: 'paid', orderStatus: { $ne: 'cancelled' } } },
                { $group: { _id: null, total: { $sum: '$totalAmount' } } }
            ])
            .toArray()

        const avgOrderValue = totalOrders > 0 && totalRevenue.length > 0
            ? totalRevenue[0].total / totalOrders
            : 0
        const avgOrdersPerCustomer = totalCustomers > 0 ? totalOrders / totalCustomers : 0
        const lifetimeValue = avgOrderValue * avgOrdersPerCustomer

        // Growth calculations
        const dailyGrowth = 0 // Would need daily tracking
        const weeklyGrowth = 0 // Would need weekly tracking
        const monthlyGrowth = previousNewCustomers > 0
            ? ((newCustomers - previousNewCustomers) / previousNewCustomers) * 100
            : 0

        return {
            total: totalCustomers,
            newCustomers,
            returningCustomers,
            retentionRate: Math.round(retentionRate * 100) / 100,
            lifetimeValue: Math.round(lifetimeValue),
            byLocation: [], // Would need address aggregation
            bySegment: {
                active: customersWithOrders.length,
                inactive: totalCustomers - customersWithOrders.length,
                vip: 0 // Would need VIP tracking
            },
            growth: {
                daily: dailyGrowth,
                weekly: weeklyGrowth,
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
    private getDateRanges(timeRange: string) {
        const now = new Date()
        let startDate: Date
        let endDate = new Date()
        let previousStartDate: Date
        let previousEndDate: Date

        switch (timeRange) {
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                previousStartDate = new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000)
                previousEndDate = new Date(startDate.getTime() - 1)
                break
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1)
                previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
                previousEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
                break
            case 'quarter':
                const currentQuarter = Math.floor(now.getMonth() / 3)
                startDate = new Date(now.getFullYear(), currentQuarter * 3, 1)
                previousStartDate = new Date(now.getFullYear(), (currentQuarter - 1) * 3, 1)
                previousEndDate = new Date(now.getFullYear(), currentQuarter * 3, 0, 23, 59, 59)
                break
            case 'year':
                startDate = new Date(now.getFullYear(), 0, 1)
                previousStartDate = new Date(now.getFullYear() - 1, 0, 1)
                previousEndDate = new Date(now.getFullYear(), 0, 0, 23, 59, 59)
                break
            default:
                startDate = new Date(now.getFullYear(), now.getMonth(), 1)
                previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
                previousEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
        }

        return { startDate, endDate, previousStartDate, previousEndDate }
    }
}


const adminService = new AdminService()
export default adminService
