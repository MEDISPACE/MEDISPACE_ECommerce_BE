import { ObjectId } from 'mongodb'
import { Server as SocketIOServer } from 'socket.io'
import Notification, { NotificationTypeEnum, NotificationTargetRole } from '~/models/schemas/Notification.schema'
import databaseService from './database.services'

interface CreateNotificationPayload {
  userId: ObjectId
  type: NotificationTypeEnum
  title: string
  message: string
  actionUrl?: string
  metadata?: Record<string, unknown>
  targetRole?: NotificationTargetRole
}

class NotificationService {
  /**
   * Create and persist a single notification to DB
   */
  async createNotification(payload: CreateNotificationPayload): Promise<Notification> {
    const notification = new Notification({
      userId: payload.userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      actionUrl: payload.actionUrl,
      metadata: payload.metadata,
      targetRole: payload.targetRole || 'customer',
    })

    const result = await databaseService.notifications.insertOne(notification)
    return { ...notification, _id: result.insertedId }
  }

  /**
   * Create notification + push via Socket.IO in real-time
   * - For customer: push to personal room `user:{userId}`
   * - For admin: push to room `admins`
   * - For pharmacist: push to room `pharmacists`
   */
  async createAndPush(payload: CreateNotificationPayload, io?: SocketIOServer): Promise<Notification> {
    const notification = await this.createNotification(payload)

    if (io) {
      const targetRole = payload.targetRole || 'customer'

      if (targetRole === 'customer') {
        io.to(`user:${payload.userId.toString()}`).emit('notification:new', notification)
      } else if (targetRole === 'admin') {
        io.to('admins').emit('notification:new', notification)
      } else if (targetRole === 'pharmacist') {
        io.to('pharmacists').emit('notification:new', notification)
      }
    }

    return notification
  }

  /**
   * Broadcast a notification to ALL users with a specific role (admin or pharmacist).
   * A single notification document per admin/pharmacist user is inserted.
   */
  async broadcastToRole(
    role: 'admin' | 'pharmacist',
    payload: Omit<CreateNotificationPayload, 'userId' | 'targetRole'>,
    io?: SocketIOServer
  ): Promise<void> {
    const dbRole = role === 'admin' ? 2 : 1
    const users = await databaseService.users
      .find({ role: dbRole }, { projection: { _id: 1 } })
      .toArray()

    const notifications = users.map(
      (u) =>
        new Notification({
          userId: u._id!,
          type: payload.type,
          title: payload.title,
          message: payload.message,
          actionUrl: payload.actionUrl,
          metadata: payload.metadata,
          targetRole: role,
        })
    )

    if (notifications.length > 0) {
      await databaseService.notifications.insertMany(notifications)

      // Push via socket to all online admins/pharmacists
      if (io) {
        const room = role === 'admin' ? 'admins' : 'pharmacists'
        // Emit a representative notification (the first one) – FE will refresh count
        if (notifications[0]) {
          io.to(room).emit('notification:new', notifications[0])
        }
      }
    }
  }

  /**
   * Get paginated notifications for a specific user
   */
  async getByUserId(
    userId: ObjectId,
    page = 1,
    limit = 20,
    filter?: 'all' | 'unread' | 'order' | 'prescription' | 'promotion' | 'system' | 'reminder' | 'review'
  ) {
    const skip = (page - 1) * limit
    const query: Record<string, unknown> = { userId }

    if (filter === 'unread') {
      query.isRead = false
    } else if (filter && filter !== 'all') {
      query.type = filter
    }

    const [notifications, total] = await Promise.all([
      databaseService.notifications
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      databaseService.notifications.countDocuments(query),
    ])

    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  /**
   * Get count of unread notifications for a user (for bell badge)
   */
  async getUnreadCount(userId: ObjectId): Promise<number> {
    return databaseService.notifications.countDocuments({ userId, isRead: false })
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(notificationId: ObjectId, userId: ObjectId): Promise<void> {
    await databaseService.notifications.updateOne(
      { _id: notificationId, userId },
      { $set: { isRead: true, readAt: new Date() } }
    )
  }

  /**
   * Mark ALL notifications for a user as read
   */
  async markAllAsRead(userId: ObjectId): Promise<void> {
    await databaseService.notifications.updateMany(
      { userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    )
  }

  /**
   * Delete a single notification (user can permanently delete)
   */
  async deleteNotification(notificationId: ObjectId, userId: ObjectId): Promise<void> {
    await databaseService.notifications.deleteOne({ _id: notificationId, userId })
  }

  // ─── Trigger helpers (called by other services) ───────────────────────────

  /**
   * Trigger: Order status changed → notify customer
   */
  async notifyOrderStatusChange(
    userId: ObjectId,
    orderId: ObjectId,
    orderNumber: string,
    newStatus: string,
    io?: SocketIOServer
  ) {
    const statusLabels: Record<string, string> = {
      confirmed: 'Đã xác nhận',
      processing: 'Đang chuẩn bị',
      shipped: 'Đang giao hàng',
      delivered: 'Đã giao thành công',
      cancelled: 'Đã hủy',
    }

    const label = statusLabels[newStatus]
    if (!label) return // Only notify for meaningful statuses

    await this.createAndPush(
      {
        userId,
        type: 'order',
        title: `Đơn hàng ${label.toLowerCase()}`,
        message: `Đơn hàng ${orderNumber} của bạn đã ${label.toLowerCase()}.`,
        actionUrl: `/account/orders`,
        metadata: { orderId: orderId.toString(), orderNumber, status: newStatus },
        targetRole: 'customer',
      },
      io
    )
  }

  /**
   * Trigger: New order placed → notify all admins
   */
  async notifyNewOrderToAdmin(orderNumber: string, totalAmount: number, io?: SocketIOServer) {
    const formattedAmount = totalAmount.toLocaleString('vi-VN') + 'đ'
    await this.broadcastToRole(
      'admin',
      {
        type: 'order',
        title: 'Đơn hàng mới',
        message: `Đơn hàng ${orderNumber} (${formattedAmount}) vừa được đặt.`,
        actionUrl: '/admin/orders',
        metadata: { orderNumber, totalAmount },
      },
      io
    )
  }

  /**
   * Trigger: Prescription status changed → notify customer
   */
  async notifyPrescriptionStatus(
    userId: ObjectId,
    prescriptionId: ObjectId,
    status: 'verified' | 'rejected',
    io?: SocketIOServer
  ) {
    const isVerified = status === 'verified'
    await this.createAndPush(
      {
        userId,
        type: 'prescription',
        title: isVerified ? 'Đơn thuốc đã được duyệt' : 'Đơn thuốc bị từ chối',
        message: isVerified
          ? 'Đơn thuốc của bạn đã được dược sĩ xác nhận. Bạn có thể đặt thuốc ngay.'
          : 'Đơn thuốc của bạn chưa đáp ứng yêu cầu. Vui lòng tải lại ảnh rõ hơn.',
        actionUrl: `/account/prescriptions`,
        metadata: { prescriptionId: prescriptionId.toString() },
        targetRole: 'customer',
      },
      io
    )
  }

  /**
   * Trigger: Return request status changed → notify customer
   */
  async notifyReturnRequestStatus(
    userId: ObjectId,
    returnRequestId: ObjectId,
    requestNumber: string,
    status: string,
    io?: SocketIOServer
  ) {
    const statusMap: Record<string, { title: string; message: string }> = {
      approved: {
        title: 'Yêu cầu hoàn hàng được chấp thuận',
        message: `Yêu cầu hoàn hàng ${requestNumber} của bạn đã được chấp thuận.`,
      },
      rejected: {
        title: 'Yêu cầu hoàn hàng bị từ chối',
        message: `Yêu cầu hoàn hàng ${requestNumber} chưa đáp ứng điều kiện.`,
      },
      completed: {
        title: 'Hoàn hàng hoàn tất',
        message: `Yêu cầu hoàn hàng ${requestNumber} đã hoàn tất xử lý.`,
      },
    }

    const content = statusMap[status]
    if (!content) return

    await this.createAndPush(
      {
        userId,
        type: 'system',
        title: content.title,
        message: content.message,
        actionUrl: `/account/returns`,
        metadata: { returnRequestId: returnRequestId.toString(), requestNumber, status },
        targetRole: 'customer',
      },
      io
    )
  }

  /**
   * Trigger: Low stock alert → notify all admins (threshold: 30)
   */
  async notifyLowStock(
    productId: ObjectId,
    productName: string,
    stockQuantity: number,
    io?: SocketIOServer
  ) {
    await this.broadcastToRole(
      'admin',
      {
        type: 'system',
        title: 'Cảnh báo tồn kho thấp',
        message: `Sản phẩm "${productName}" chỉ còn ${stockQuantity} đơn vị trong kho.`,
        actionUrl: '/admin/inventory',
        metadata: { productId: productId.toString(), productName, stockQuantity },
      },
      io
    )
  }

  /**
   * Trigger: New return request → notify all admins
   */
  async notifyNewReturnRequestToAdmin(requestNumber: string, io?: SocketIOServer) {
    await this.broadcastToRole(
      'admin',
      {
        type: 'system',
        title: 'Yêu cầu hoàn hàng mới',
        message: `Yêu cầu hoàn hàng ${requestNumber} cần được xử lý.`,
        actionUrl: '/admin/returns',
        metadata: { requestNumber },
      },
      io
    )
  }

  /**
   * Trigger: Review moderation result → notify customer
   *
   * Logic:
   * - REJECTED (always): Customer must know why their review was rejected.
   * - APPROVED from pending (manual moderation): Customer was waiting, let them know it's live.
   * - APPROVED auto (auto-approved on submit): Toast was already shown on submit — skip.
   *
   * @param userId       - Customer who wrote the review
   * @param reviewId     - ID of the review
   * @param productName  - Name of the reviewed product (for context in message)
   * @param newStatus    - 'approved' | 'rejected'
   * @param wasAutoApproved - true if review was auto-approved on submit (no notification needed)
   * @param moderationNotes - Rejection reason (required when rejected)
   * @param io           - Socket.IO server instance for real-time push
   */
  async notifyReviewModerated(
    userId: ObjectId,
    reviewId: ObjectId,
    productName: string,
    newStatus: 'approved' | 'rejected',
    wasAutoApproved: boolean,
    moderationNotes?: string,
    io?: SocketIOServer
  ): Promise<void> {
    // Auto-approved reviews: user already got a success toast on submit → skip
    if (newStatus === 'approved' && wasAutoApproved) return

    const isApproved = newStatus === 'approved'

    await this.createAndPush(
      {
        userId,
        type: 'review',
        title: isApproved ? 'Đánh giá đã được duyệt' : 'Đánh giá bị từ chối',
        message: isApproved
          ? `Đánh giá của bạn về "${productName}" đã được duyệt và hiển thị công khai.`
          : moderationNotes
            ? `Đánh giá của bạn về "${productName}" bị từ chối. Lý do: ${moderationNotes}`
            : `Đánh giá của bạn về "${productName}" không đáp ứng tiêu chuẩn và bị từ chối.`,
        actionUrl: `/account/reviews`,
        metadata: {
          reviewId: reviewId.toString(),
          productName,
          moderationStatus: newStatus,
          moderationNotes: moderationNotes || null,
        },
        targetRole: 'customer',
      },
      io
    )
  }

  async notifyVideoEventReminder(userId: ObjectId, eventTitle: string, eventId: string, io?: SocketIOServer): Promise<void> {
    await this.createAndPush(
      {
        userId,
        type: 'reminder',
        title: 'Hội thảo sắp bắt đầu',
        message: `"${eventTitle}" sẽ bắt đầu trong 15 phút.`,
        actionUrl: `/community/video-events/${eventId}`,
        metadata: { eventId },
        targetRole: 'customer'
      },
      io
    )
  }
}

const notificationService = new NotificationService()
export default notificationService
