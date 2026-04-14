import * as cron from 'node-cron'
import databaseService from './database.services'

// Time in hours after which unpaid online payment orders will be cancelled
const ABANDONED_ORDER_TIMEOUT_HOURS = 24

class CleanupService {
  // Cleanup expired carts - chạy mỗi ngày
  startCartCleanup() {
    cron.schedule('0 0 * * *', async () => {
      try {
        const now = new Date()
        await databaseService.carts.deleteMany({
          expiresAt: { $lt: now }
        })
      } catch {
        // Silent error handling
      }
    })
  }

  // Cleanup carts after successful orders - chạy mỗi ngày
  startOrderCartCleanup() {
    cron.schedule('0 0 * * *', async () => {
      try {
        // Find carts that belong to users who have completed orders
        // This is a simplified version - in production you'd track cart-to-order relationships
        await databaseService.carts.deleteMany({
          userId: { $exists: true },
          status: 'converted_to_order'
        })
      } catch {
        // Silent error handling
      }
    })
  }

  // Cleanup abandoned orders - runs every hour
  // Cancels orders with pending payment status older than ABANDONED_ORDER_TIMEOUT_HOURS
  // Only affects online payment methods (VNPay, PayOS), NOT COD
  startAbandonedOrderCleanup() {
    console.log(
      `[CleanupService] Abandoned order cleanup scheduled. Orders older than ${ABANDONED_ORDER_TIMEOUT_HOURS} hours with pending payment will be cancelled.`
    )

    cron.schedule('0 * * * *', async () => {
      try {
        const result = await this.cleanupAbandonedOrders()
        if (result.cancelledCount > 0) {
          console.log(`[CleanupService] Cancelled ${result.cancelledCount} abandoned orders`)
        }
      } catch (error) {
        console.error('[CleanupService] Error cleaning up abandoned orders:', error)
      }
    })
  }

  // Manual cleanup method for abandoned orders
  async cleanupAbandonedOrders(): Promise<{ cancelledCount: number }> {
    const cutoffTime = new Date()
    cutoffTime.setHours(cutoffTime.getHours() - ABANDONED_ORDER_TIMEOUT_HOURS)

    // Find orders that need to be cancelled
    const ordersToCancel = await databaseService.orders
      .find({
        paymentStatus: 'pending',
        paymentMethod: { $in: ['vnpay', 'payos', 'bank_transfer'] },
        orderStatus: { $nin: ['cancelled', 'delivered'] },
        createdAt: { $lt: cutoffTime }
      })
      .toArray()

    // Restore stock for each order before cancelling
    for (const order of ordersToCancel) {
      for (const item of order.items || []) {
        const product = await databaseService.products.findOne({ _id: item.productId })
        if (product) {
          const variant = product.priceVariants?.find((v: any) => v.unit === item.unit)
          const quantityPerUnit = variant?.quantityPerUnit || 1
          const stockToRestore = item.quantity * quantityPerUnit
          await databaseService.products.updateOne({ _id: item.productId }, { $inc: { stockQuantity: stockToRestore } })
        }
      }
    }

    // Now update all orders to cancelled status
    const result = await databaseService.orders.updateMany(
      {
        paymentStatus: 'pending',
        paymentMethod: { $in: ['vnpay', 'payos', 'bank_transfer'] },
        orderStatus: { $nin: ['cancelled', 'delivered'] },
        createdAt: { $lt: cutoffTime }
      },
      {
        $set: {
          orderStatus: 'cancelled',
          cancelReason: 'Đơn hàng tự động hủy do không hoàn tất thanh toán trong thời gian quy định',
          cancelledAt: new Date(),
          updatedAt: new Date()
        }
      }
    )

    return { cancelledCount: result.modifiedCount || 0 }
  }

  // Get abandoned order statistics
  async getAbandonedOrderStats() {
    const cutoffTime = new Date()
    cutoffTime.setHours(cutoffTime.getHours() - ABANDONED_ORDER_TIMEOUT_HOURS)

    const abandonedCount = await databaseService.orders.countDocuments({
      paymentStatus: 'pending',
      paymentMethod: { $in: ['vnpay', 'payos', 'bank_transfer'] },
      orderStatus: { $nin: ['cancelled', 'delivered'] },
      createdAt: { $lt: cutoffTime }
    })

    const pendingCount = await databaseService.orders.countDocuments({
      paymentStatus: 'pending',
      paymentMethod: { $in: ['vnpay', 'payos', 'bank_transfer'] },
      orderStatus: { $nin: ['cancelled', 'delivered'] }
    })

    return {
      abandonedCount,
      pendingCount,
      timeoutHours: ABANDONED_ORDER_TIMEOUT_HOURS
    }
  }

  // Manual cleanup method for testing
  async cleanupExpiredCarts(): Promise<{ deletedCount: number }> {
    const now = new Date()
    const result = await databaseService.carts.deleteMany({
      expiresAt: { $lt: now }
    })
    return { deletedCount: result.deletedCount || 0 }
  }

  // Get cart statistics
  async getCartStats() {
    const now = new Date()
    const expiredCount = await databaseService.carts.countDocuments({
      expiresAt: { $lt: now }
    })

    const activeCount = await databaseService.carts.countDocuments({
      expiresAt: { $gte: now }
    })

    const totalCount = await databaseService.carts.countDocuments({})

    return {
      total: totalCount,
      active: activeCount,
      expired: expiredCount
    }
  }

  // Start all cleanup services
  startAll() {
    this.startCartCleanup()
    this.startAbandonedOrderCleanup()
    this.startExpiredPrescriptionCleanup()
  }

  // Cleanup expired prescriptions - runs daily at midnight
  startExpiredPrescriptionCleanup() {
    console.log(
      '[CleanupService] Expired prescription cleanup scheduled. Prescriptions past validUntil will be marked as expired.'
    )

    // Run daily at 00:30
    cron.schedule('30 0 * * *', async () => {
      try {
        const result = await this.cleanupExpiredPrescriptions()
        if (result.expiredCount > 0) {
          console.log(`[CleanupService] Marked ${result.expiredCount} prescriptions as expired`)
        }
      } catch (error) {
        console.error('[CleanupService] Error cleaning up expired prescriptions:', error)
      }
    })
  }

  // Manual cleanup method for expired prescriptions
  async cleanupExpiredPrescriptions(): Promise<{ expiredCount: number }> {
    const now = new Date()

    // Find prescriptions that are past their validity date and not already expired/rejected
    const result = await databaseService.prescriptions.updateMany(
      {
        validUntil: { $lt: now },
        status: { $in: ['pending', 'verified'] }
      },
      {
        $set: {
          status: 'expired',
          updatedAt: now
        }
      }
    )

    return { expiredCount: result.modifiedCount || 0 }
  }

  // Get expired prescription statistics
  async getExpiredPrescriptionStats() {
    const now = new Date()

    const expiredCount = await databaseService.prescriptions.countDocuments({
      validUntil: { $lt: now },
      status: { $in: ['pending', 'verified'] }
    })

    const totalPending = await databaseService.prescriptions.countDocuments({
      status: 'pending'
    })

    return {
      pendingExpiration: expiredCount,
      totalPending
    }
  }
  /**
   * Option B – Auto-reassign stale conversations (runs every 5 minutes)
   *
   * Conversation bị coi là "stale" khi:
   * - Đã được assign cho dược sĩ (pharmacistId tồn tại)
   * - Dược sĩ đó hiện đang offline (isOnline = false)
   * - lastMessageAt > STALE_TIMEOUT_MINUTES phút trước mà chưa có reply từ dược sĩ
   */
  startStaleConversationReassign() {
    const STALE_TIMEOUT_MINUTES = 5

    console.log(`[CleanupService] Stale conversation reassign scheduled every ${STALE_TIMEOUT_MINUTES} minutes.`)

    cron.schedule('*/5 * * * *', async () => {
      try {
        const result = await this.reassignStaleConversations(STALE_TIMEOUT_MINUTES)
        if (result.reassignedCount > 0) {
          console.log(`[CleanupService] Re-queued ${result.reassignedCount} stale conversations back to pending.`)
        }
      } catch (error) {
        console.error('[CleanupService] Error reassigning stale conversations:', error)
      }
    })
  }

  async reassignStaleConversations(timeoutMinutes = 5): Promise<{ reassignedCount: number }> {
    const cutoffTime = new Date()
    cutoffTime.setMinutes(cutoffTime.getMinutes() - timeoutMinutes)

    // Lấy tất cả conversation đã assign, còn active, lastMessage từ khách hàng > timeout
    const staleConversations = await databaseService.conversations
      .find({
        pharmacistId: { $exists: true },
        status: 'active',
        lastMessageAt: { $lt: cutoffTime }
      })
      .toArray()

    if (staleConversations.length === 0) return { reassignedCount: 0 }

    let reassignedCount = 0

    for (const conv of staleConversations) {
      const pharmacist = await databaseService.users.findOne({
        _id: conv.pharmacistId
      })

      // Chỉ re-queue nếu dược sĩ đang offline
      if (pharmacist && !pharmacist.isOnline) {
        await databaseService.conversations.updateOne(
          { _id: conv._id },
          {
            $unset: { pharmacistId: '' },
            $set: { updatedAt: new Date() }
          }
        )
        reassignedCount++
      }
    }

    return { reassignedCount }
  }
}

const cleanupService = new CleanupService()
export default cleanupService
