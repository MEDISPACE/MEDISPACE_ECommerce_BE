import * as cron from 'node-cron'
import databaseService from './database.services'

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
  }
}

const cleanupService = new CleanupService()
export default cleanupService
