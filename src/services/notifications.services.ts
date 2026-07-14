import { ObjectId } from 'mongodb'
import { Server as SocketIOServer } from 'socket.io'
import { UserRole, UserStatus } from '~/constants/enum'
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
  eventKey?: string
}

type NotificationFilter = 'all' | 'unread' | NotificationTypeEnum

const DEFAULT_NOTIFICATION_PREFERENCES = {
  channels: {
    inApp: true,
    email: true,
    push: false,
    sms: false
  },
  types: {
    order: true,
    payment: true,
    shipping: true,
    prescription: true,
    promotion: true,
    reminder: true,
    system: true,
    review: true,
    return: true,
    security: true,
    community: true
  }
}

type NotificationPreferences = typeof DEFAULT_NOTIFICATION_PREFERENCES
const ALWAYS_ON_TYPES: NotificationTypeEnum[] = ['order', 'payment', 'shipping', 'prescription', 'return', 'security']

const compactUndefined = <T extends Record<string, unknown>>(value: T): T => {
  Object.keys(value).forEach((key) => {
    if (value[key] === undefined) delete value[key]
  })
  return value
}

class NotificationService {
  /**
   * Create and persist a single notification to DB
   */
  private normalizePreferences(raw?: Partial<NotificationPreferences>): NotificationPreferences {
    return {
      channels: { ...DEFAULT_NOTIFICATION_PREFERENCES.channels, ...(raw?.channels || {}) },
      types: { ...DEFAULT_NOTIFICATION_PREFERENCES.types, ...(raw?.types || {}) }
    }
  }

  async getPreferences(userId: ObjectId): Promise<NotificationPreferences> {
    const user = await databaseService.users.findOne({ _id: userId }, { projection: { notificationPreferences: 1 } })
    return this.normalizePreferences(
      (user as any)?.notificationPreferences as Partial<NotificationPreferences> | undefined
    )
  }

  async updatePreferences(
    userId: ObjectId,
    preferences: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    const normalized = this.normalizePreferences(preferences)
    await databaseService.users.updateOne(
      { _id: userId },
      { $set: { notificationPreferences: normalized, updatedAt: new Date() } }
    )
    return normalized
  }

  private async shouldCreateInAppNotification(payload: CreateNotificationPayload): Promise<boolean> {
    if (ALWAYS_ON_TYPES.includes(payload.type)) return true
    const preferences = await this.getPreferences(payload.userId)
    if (!preferences.channels.inApp) return false
    return preferences.types[payload.type] !== false
  }

  async createNotification(payload: CreateNotificationPayload): Promise<Notification | null> {
    if (!(await this.shouldCreateInAppNotification(payload))) return null

    const notification = compactUndefined(new Notification({
      userId: payload.userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      actionUrl: payload.actionUrl,
      metadata: payload.metadata,
      targetRole: payload.targetRole || 'customer',
      eventKey: payload.eventKey
    }) as unknown as Record<string, unknown>) as Notification

    if (payload.eventKey) {
      const result = await databaseService.notifications.findOneAndUpdate(
        { userId: payload.userId, eventKey: payload.eventKey },
        { $setOnInsert: notification },
        { upsert: true, returnDocument: 'after' }
      )
      if (result) return result
    }

    const result = await databaseService.notifications.insertOne(notification)
    return { ...notification, _id: result.insertedId }
  }

  /**
   * Create notification + push via Socket.IO in real-time
   * - For customer: push to personal room `user:{userId}`
   * - For admin: push to room `admins`
   * - For pharmacist: push to room `pharmacists`
   */
  async createAndPush(payload: CreateNotificationPayload, io?: SocketIOServer): Promise<Notification | null> {
    const notification = await this.createNotification(payload)
    if (!notification) return null

    if (io) {
      const targetRole = payload.targetRole || 'customer'

      if (targetRole === 'customer') {
        io.to(`user:${payload.userId.toString()}`).emit('notification:new', notification)
      } else if (targetRole === 'admin') {
        io.to('admins').emit('notification:new', { ...notification, userId: undefined, _id: undefined })
      } else if (targetRole === 'pharmacist') {
        io.to('pharmacists').emit('notification:new', { ...notification, userId: undefined, _id: undefined })
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
    const dbRole = role === 'admin' ? UserRole.Admin : UserRole.Pharmacist
    const users = await databaseService.users
      .find({ role: dbRole, status: { $ne: UserStatus.Banned } }, { projection: { _id: 1 } })
      .toArray()

    if (users.length > 0) {
      await Promise.all(
        users.map((u) =>
          this.createNotification({
            userId: u._id!,
            type: payload.type,
            title: payload.title,
            message: payload.message,
            actionUrl: payload.actionUrl,
            metadata: payload.metadata,
            targetRole: role,
            eventKey: payload.eventKey
          })
        )
      )

      // Push via socket to all online admins/pharmacists
      if (io) {
        const room = role === 'admin' ? 'admins' : 'pharmacists'
        // Role subscribers refetch their own documents after receiving this generic payload.
        io.to(room).emit('notification:new', {
          type: payload.type,
          title: payload.title,
          message: payload.message,
          actionUrl: payload.actionUrl,
          metadata: payload.metadata,
          targetRole: role,
          eventKey: payload.eventKey,
          createdAt: new Date()
        })
      }
    }
  }

  async broadcastToCustomers(
    payload: Omit<CreateNotificationPayload, 'userId' | 'targetRole'>,
    io?: SocketIOServer,
    targetUserIds?: ObjectId[]
  ): Promise<void> {
    const query: Record<string, unknown> = {
      role: UserRole.Customer,
      status: UserStatus.Verified
    }

    if (targetUserIds && targetUserIds.length > 0) {
      query._id = { $in: targetUserIds }
    }

    const users = await databaseService.users.find(query, { projection: { _id: 1 } }).toArray()
    if (users.length === 0) return

    const created = await Promise.all(
      users.map((u) =>
        this.createNotification({
          userId: u._id!,
          type: payload.type,
          title: payload.title,
          message: payload.message,
          actionUrl: payload.actionUrl,
          metadata: payload.metadata,
          targetRole: 'customer',
          eventKey: payload.eventKey
        })
      )
    )

    if (io) {
      created.filter(Boolean).forEach((notification) => {
        io.to(`user:${notification!.userId.toString()}`).emit('notification:new', notification)
      })
    }
  }

  /**
   * Get paginated notifications for a specific user
   */
  async getByUserId(userId: ObjectId, page = 1, limit = 20, filter?: NotificationFilter) {
    const skip = (page - 1) * limit
    const query: Record<string, unknown> = { userId }

    if (filter === 'unread') {
      query.isRead = false
    } else if (filter && filter !== 'all') {
      query.type = filter
    }

    const [notifications, total] = await Promise.all([
      databaseService.notifications.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      databaseService.notifications.countDocuments(query)
    ])

    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
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
      cancelled: 'Đã hủy'
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
        eventKey: `order:${orderId.toString()}:status:${newStatus}`
      },
      io
    )
  }

  async notifyPaymentStatusChange(
    userId: ObjectId,
    orderId: ObjectId,
    orderNumber: string,
    paymentStatus: 'paid' | 'failed' | 'refunded' | 'partially_refunded',
    io?: SocketIOServer
  ) {
    const statusMap: Record<string, { title: string; message: string }> = {
      paid: {
        title: 'Thanh toán thành công',
        message: `Thanh toán cho đơn hàng ${orderNumber} đã được ghi nhận.`
      },
      failed: {
        title: 'Thanh toán thất bại',
        message: `Thanh toán cho đơn hàng ${orderNumber} không thành công. Đơn hàng đã được hủy.`
      },
      refunded: {
        title: 'Hoàn tiền hoàn tất',
        message: `Đơn hàng ${orderNumber} đã được hoàn tiền.`
      },
      partially_refunded: {
        title: 'Hoàn tiền một phần',
        message: `Đơn hàng ${orderNumber} đã được hoàn tiền một phần.`
      }
    }

    const content = statusMap[paymentStatus]
    if (!content) return

    await this.createAndPush(
      {
        userId,
        type: 'payment',
        title: content.title,
        message: content.message,
        actionUrl: '/account/orders',
        metadata: { orderId: orderId.toString(), orderNumber, paymentStatus },
        targetRole: 'customer',
        eventKey: `order:${orderId.toString()}:payment:${paymentStatus}`
      },
      io
    )
  }

  async notifyShippingStatusChange(
    userId: ObjectId,
    orderId: ObjectId,
    orderNumber: string,
    status: 'pickup_confirmed' | 'in_transit' | 'delivery_failed' | 'delivery_rescheduled' | 'shipped',
    trackingNumber?: string,
    io?: SocketIOServer
  ) {
    const statusMap: Record<string, { title: string; message: string }> = {
      pickup_confirmed: {
        title: 'Đơn vị vận chuyển đã nhận đơn',
        message: `Đơn hàng ${orderNumber} đã được xác nhận lấy hàng.`
      },
      in_transit: {
        title: 'Đơn hàng đang vận chuyển',
        message: `Đơn hàng ${orderNumber} đang trên đường giao đến bạn.`
      },
      delivery_failed: {
        title: 'Giao hàng chưa thành công',
        message: `Đơn hàng ${orderNumber} giao chưa thành công. MediSpace sẽ tiếp tục hỗ trợ bạn.`
      },
      delivery_rescheduled: {
        title: 'Lịch giao hàng được cập nhật',
        message: `Đơn hàng ${orderNumber} đã được cập nhật lịch giao hàng.`
      },
      shipped: {
        title: 'Đơn hàng đang giao',
        message: trackingNumber
          ? `Đơn hàng ${orderNumber} đang được giao. Mã vận đơn: ${trackingNumber}.`
          : `Đơn hàng ${orderNumber} đang được giao.`
      }
    }

    const content = statusMap[status]
    if (!content) return

    await this.createAndPush(
      {
        userId,
        type: 'shipping',
        title: content.title,
        message: content.message,
        actionUrl: '/account/orders',
        metadata: { orderId: orderId.toString(), orderNumber, status, trackingNumber: trackingNumber || null },
        targetRole: 'customer',
        eventKey: `order:${orderId.toString()}:shipping:${status}:${trackingNumber || 'none'}`
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
        eventKey: `order:${orderNumber}:admin:new`
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
        eventKey: `prescription:${prescriptionId.toString()}:status:${status}`
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
        message: `Yêu cầu hoàn hàng ${requestNumber} của bạn đã được chấp thuận.`
      },
      rejected: {
        title: 'Yêu cầu hoàn hàng bị từ chối',
        message: `Yêu cầu hoàn hàng ${requestNumber} chưa đáp ứng điều kiện.`
      },
      completed: {
        title: 'Hoàn hàng hoàn tất',
        message: `Yêu cầu hoàn hàng ${requestNumber} đã hoàn tất xử lý.`
      }
    }

    const content = statusMap[status]
    if (!content) return

    await this.createAndPush(
      {
        userId,
        type: 'return',
        title: content.title,
        message: content.message,
        actionUrl: `/account/returns`,
        metadata: { returnRequestId: returnRequestId.toString(), requestNumber, status },
        targetRole: 'customer',
        eventKey: `return:${returnRequestId.toString()}:status:${status}`
      },
      io
    )
  }

  /**
   * Trigger: Low stock alert → notify all admins (threshold: 30)
   */
  async notifyLowStock(productId: ObjectId, productName: string, stockQuantity: number, io?: SocketIOServer) {
    const payload = {
      type: 'system' as NotificationTypeEnum,
      title: 'Cảnh báo tồn kho thấp',
      message: `Sản phẩm "${productName}" chỉ còn ${stockQuantity} đơn vị trong kho.`,
      metadata: { productId: productId.toString(), productName, stockQuantity },
      eventKey: `product:${productId.toString()}:low-stock:${stockQuantity}`
    }
    await Promise.all([
      this.broadcastToRole('admin', { ...payload, actionUrl: '/admin/inventory' }, io),
      this.broadcastToRole('pharmacist', { ...payload, actionUrl: '/pharmacist/inventory' }, io)
    ])
  }

  async notifyCouponAvailable(coupon: Record<string, any>, io?: SocketIOServer): Promise<void> {
    const couponId = coupon._id?.toString?.()
    if (!couponId || !coupon.isActive) return

    const now = new Date()
    const startDate = new Date(coupon.startDate)
    const endDate = new Date(coupon.endDate)
    if (now < startDate || now > endDate) return

    const targetUserIds = (coupon.targetUserIds || [])
      .filter((id: ObjectId | string) => id && ObjectId.isValid(id.toString()))
      .map((id: ObjectId | string) => new ObjectId(id.toString()))

    if (!coupon.isPublic && targetUserIds.length === 0) return

    const valueLabel =
      coupon.type === 'percentage'
        ? `giảm ${coupon.value}%`
        : coupon.type === 'free_shipping'
          ? 'miễn phí vận chuyển'
          : `giảm ${Number(coupon.value || 0).toLocaleString('vi-VN')}đ`

    await this.broadcastToCustomers(
      {
        type: 'promotion',
        title: 'Ưu đãi mới dành cho bạn',
        message: `Mã ${coupon.code} ${valueLabel}. Áp dụng đến ${endDate.toLocaleDateString('vi-VN')}.`,
        actionUrl: '/account/coupons',
        metadata: {
          couponId,
          code: coupon.code,
          type: coupon.type,
          value: coupon.value,
          endDate: endDate.toISOString()
        },
        eventKey: `coupon:${couponId}:available`
      },
      io,
      coupon.isPublic ? undefined : targetUserIds
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
        eventKey: `return:${requestNumber}:admin:new`
      },
      io
    )
  }

  async notifyNewReturnRequestToPharmacists(requestNumber: string, io?: SocketIOServer) {
    await this.broadcastToRole(
      'pharmacist',
      {
        type: 'return',
        title: 'Yêu cầu hoàn hàng mới',
        message: `Yêu cầu hoàn hàng ${requestNumber} vừa được tạo và cần xem xét.`,
        actionUrl: '/pharmacist/returns',
        metadata: { requestNumber },
        eventKey: `return:${requestNumber}:pharmacist:new`
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
          moderationNotes: moderationNotes || null
        },
        targetRole: 'customer',
        eventKey: `review:${reviewId.toString()}:moderation:${newStatus}`
      },
      io
    )
  }

  async notifyVideoEventReminder(
    userId: ObjectId,
    eventTitle: string,
    eventId: string,
    io?: SocketIOServer
  ): Promise<void> {
    await this.createAndPush(
      {
        userId,
        type: 'reminder',
        title: 'Hội thảo sắp bắt đầu',
        message: `"${eventTitle}" sẽ bắt đầu trong 15 phút.`,
        actionUrl: `/community/video-events/${eventId}`,
        metadata: { eventId },
        targetRole: 'customer',
        eventKey: `community-video-event:${eventId}:reminder15m`
      },
      io
    )
  }

  async notifyVideoEventLifecycle(
    userId: ObjectId,
    eventTitle: string,
    eventId: string,
    status: 'registered' | 'live' | 'cancelled' | 'time_changed',
    io?: SocketIOServer
  ): Promise<void> {
    const contentMap: Record<typeof status, { title: string; message: string }> = {
      registered: {
        title: 'Đăng ký hội thảo thành công',
        message: `Bạn đã đăng ký hội thảo "${eventTitle}".`
      },
      live: {
        title: 'Hội thảo đang live',
        message: `"${eventTitle}" đang diễn ra. Bạn có thể tham gia ngay.`
      },
      cancelled: {
        title: 'Hội thảo đã hủy',
        message: `"${eventTitle}" đã bị hủy. MediSpace sẽ cập nhật lịch mới khi có.`
      },
      time_changed: {
        title: 'Lịch hội thảo được cập nhật',
        message: `"${eventTitle}" vừa được cập nhật thời gian tổ chức.`
      }
    }
    const content = contentMap[status]

    await this.createAndPush(
      {
        userId,
        type: 'community',
        title: content.title,
        message: content.message,
        actionUrl: `/community/video-events/${eventId}`,
        metadata: { eventId, status },
        targetRole: 'customer',
        eventKey: `community-video-event:${eventId}:${status}`
      },
      io
    )
  }

  async notifySecurityAlert(
    userId: ObjectId,
    title: string,
    message: string,
    eventKey: string,
    io?: SocketIOServer
  ): Promise<void> {
    await this.createAndPush(
      {
        userId,
        type: 'security',
        title,
        message,
        actionUrl: '/account/settings',
        metadata: { eventKey },
        targetRole: 'customer',
        eventKey
      },
      io
    )
  }
}

const notificationService = new NotificationService()
export default notificationService
