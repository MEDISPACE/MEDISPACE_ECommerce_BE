import { ObjectId } from 'mongodb'
import LoyaltyAccount, { LoyaltyTier, TIER_THRESHOLDS, TIER_MULTIPLIERS, TIER_LABELS } from '~/models/schemas/LoyaltyAccount.schema'
import LoyaltyTransaction from '~/models/schemas/LoyaltyTransaction.schema'
import databaseService from './database.services'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'

// Config from env
const POINTS_PER_VND = parseInt(process.env.POINTS_PER_VND || '1000')
const POINTS_MAX_REDEEM_RATIO = parseFloat(process.env.POINTS_MAX_REDEEM_RATIO || '0.3')
const POINTS_EXPIRY_DAYS = parseInt(process.env.POINTS_EXPIRY_DAYS || '365')
const POINTS_MIN_REDEEM = parseInt(process.env.POINTS_MIN_REDEEM || '10000')
const POINTS_TO_VND = 1 // 1 điểm = 1 VNĐ khi đổi

class LoyaltyService {
  // ============================
  // ACCOUNT MANAGEMENT
  // ============================

  /**
   * Lấy hoặc tạo loyalty account cho user
   */
  async getOrCreateAccount(userId: ObjectId): Promise<LoyaltyAccount> {
    let account = await databaseService.loyaltyAccounts.findOne({ userId })

    if (!account) {
      const newAccount = new LoyaltyAccount({
        userId,
        pointsBalance: 0,
        totalPointsEarned: 0,
        totalPointsRedeemed: 0,
        totalPointsExpired: 0,
        tier: 'member',
        totalSpent: 0
      })
      await databaseService.loyaltyAccounts.insertOne(newAccount as any)
      return newAccount
    }

    return account as unknown as LoyaltyAccount
  }

  /**
   * Lấy thông tin loyalty (public API)
   */
  async getAccountInfo(userId: ObjectId) {
    const account = await this.getOrCreateAccount(userId)

    // Tính tier tiếp theo
    const tiers: LoyaltyTier[] = ['member', 'silver', 'gold', 'platinum']
    const currentTierIndex = tiers.indexOf(account.tier)
    const nextTier = currentTierIndex < tiers.length - 1 ? tiers[currentTierIndex + 1] : null
    const nextTierThreshold = nextTier ? TIER_THRESHOLDS[nextTier] : null
    const progressToNextTier = nextTierThreshold 
      ? Math.min(100, Math.round((account.totalSpent / nextTierThreshold) * 100))
      : 100

    return {
      pointsBalance: account.pointsBalance,
      totalPointsEarned: account.totalPointsEarned,
      totalPointsRedeemed: account.totalPointsRedeemed,
      tier: account.tier,
      tierLabel: TIER_LABELS[account.tier],
      totalSpent: account.totalSpent,
      multiplier: TIER_MULTIPLIERS[account.tier],
      nextTier,
      nextTierLabel: nextTier ? TIER_LABELS[nextTier] : null,
      nextTierThreshold,
      progressToNextTier,
      amountToNextTier: nextTierThreshold ? Math.max(0, nextTierThreshold - account.totalSpent) : 0,
      config: {
        pointsPerVnd: POINTS_PER_VND,
        maxRedeemRatio: POINTS_MAX_REDEEM_RATIO,
        expiryDays: POINTS_EXPIRY_DAYS,
        minRedeem: POINTS_MIN_REDEEM,
        pointsToVnd: POINTS_TO_VND
      }
    }
  }

  // ============================
  // POINT EARNING
  // ============================

  /**
   * Tích điểm khi đơn hàng được giao thành công (delivered)
   * Gọi từ order status update hook
   */
  async earnPointsFromOrder(userId: ObjectId, orderId: ObjectId, orderTotal: number, orderNumber: string) {
    const account = await this.getOrCreateAccount(userId)

    // Tính điểm: orderTotal / POINTS_PER_VND * tierMultiplier
    const basePoints = Math.floor(orderTotal / POINTS_PER_VND)
    const multiplier = TIER_MULTIPLIERS[account.tier]
    const earnedPoints = Math.floor(basePoints * multiplier)

    if (earnedPoints <= 0) return

    // Ngày hết hạn
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + POINTS_EXPIRY_DAYS)

    const newBalance = account.pointsBalance + earnedPoints

    // Ghi transaction
    const transaction = new LoyaltyTransaction({
      userId,
      type: 'earn',
      points: earnedPoints,
      balanceAfter: newBalance,
      orderId,
      description: `Tích ${earnedPoints} điểm từ đơn hàng ${orderNumber}${multiplier > 1 ? ` (x${multiplier} hạng ${TIER_LABELS[account.tier]})` : ''}`,
      expiresAt
    })
    await databaseService.loyaltyTransactions.insertOne(transaction as any)

    // Cập nhật account
    const newTotalSpent = account.totalSpent + orderTotal
    const newTier = this.calculateTier(newTotalSpent)

    await databaseService.loyaltyAccounts.updateOne(
      { userId },
      {
        $set: {
          pointsBalance: newBalance,
          totalSpent: newTotalSpent,
          tier: newTier,
          ...(newTier !== account.tier ? { tierUpdatedAt: new Date() } : {}),
          updatedAt: new Date()
        },
        $inc: { totalPointsEarned: earnedPoints }
      }
    )

    return { earnedPoints, newBalance, newTier, expiresAt }
  }

  // ============================
  // POINT REDEMPTION (CHECKOUT)
  // ============================

  /**
   * Preview: tính số tiền giảm tối đa khi đổi điểm
   */
  previewRedeem(pointsBalance: number, orderSubtotal: number) {
    const maxRedeemByRatio = Math.floor(orderSubtotal * POINTS_MAX_REDEEM_RATIO)
    const maxRedeemByBalance = pointsBalance * POINTS_TO_VND
    const maxRedeemAmount = Math.min(maxRedeemByRatio, maxRedeemByBalance)

    const pointsNeeded = Math.floor(maxRedeemAmount / POINTS_TO_VND)
    const canRedeem = pointsBalance >= POINTS_MIN_REDEEM

    return {
      canRedeem,
      maxRedeemAmount,
      pointsNeeded,
      pointsBalance,
      minRedeem: POINTS_MIN_REDEEM,
      maxRedeemRatio: POINTS_MAX_REDEEM_RATIO | 0
    }
  }

  /**
   * Đổi điểm khi đặt hàng
   * Trả về số tiền giảm thực tế
   */
  async redeemPoints(
    userId: ObjectId,
    orderId: ObjectId,
    pointsToRedeem: number,
    orderSubtotal: number,
    orderNumber: string
  ): Promise<number> {
    if (pointsToRedeem <= 0) return 0

    const account = await this.getOrCreateAccount(userId)

    // Validate
    if (account.pointsBalance < pointsToRedeem) {
      throw new ErrorWithStatus({
        message: `Không đủ điểm. Số dư hiện tại: ${account.pointsBalance} điểm.`,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (pointsToRedeem < POINTS_MIN_REDEEM) {
      throw new ErrorWithStatus({
        message: `Cần tối thiểu ${POINTS_MIN_REDEEM.toLocaleString('vi-VN')} điểm để đổi.`,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const redeemAmount = pointsToRedeem * POINTS_TO_VND
    const maxRedeemByRatio = Math.floor(orderSubtotal * POINTS_MAX_REDEEM_RATIO)

    if (redeemAmount > maxRedeemByRatio) {
      throw new ErrorWithStatus({
        message: `Chỉ được đổi tối đa ${POINTS_MAX_REDEEM_RATIO * 100}% giá trị đơn hàng (${maxRedeemByRatio.toLocaleString('vi-VN')}đ).`,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const newBalance = account.pointsBalance - pointsToRedeem

    // Ghi transaction
    const transaction = new LoyaltyTransaction({
      userId,
      type: 'redeem',
      points: -pointsToRedeem,
      balanceAfter: newBalance,
      orderId,
      description: `Đổi ${pointsToRedeem.toLocaleString('vi-VN')} điểm giảm ${redeemAmount.toLocaleString('vi-VN')}đ cho đơn ${orderNumber}`
    })
    await databaseService.loyaltyTransactions.insertOne(transaction as any)

    // Cập nhật account
    await databaseService.loyaltyAccounts.updateOne(
      { userId },
      {
        $set: {
          pointsBalance: newBalance,
          updatedAt: new Date()
        },
        $inc: { totalPointsRedeemed: pointsToRedeem }
      }
    )

    return redeemAmount
  }

  // ============================
  // POINT REVOCATION (RETURNS)
  // ============================

  /**
   * Thu hồi điểm khi hoàn trả đơn hàng
   */
  async revokePointsForReturn(userId: ObjectId, orderId: ObjectId, orderTotal: number, orderNumber: string) {
    const account = await this.getOrCreateAccount(userId)

    // Tìm transaction earn gốc
    const earnTx = await databaseService.loyaltyTransactions.findOne({
      userId,
      orderId,
      type: 'earn'
    })

    if (!earnTx) return // Chưa tích thì không cần hoàn

    const revokePoints = Math.min(earnTx.points, account.pointsBalance)
    if (revokePoints <= 0) return

    const newBalance = account.pointsBalance - revokePoints

    const transaction = new LoyaltyTransaction({
      userId,
      type: 'revoke',
      points: -revokePoints,
      balanceAfter: newBalance,
      orderId,
      description: `Thu hồi ${revokePoints} điểm do hoàn trả đơn ${orderNumber}`
    })
    await databaseService.loyaltyTransactions.insertOne(transaction as any)

    // Cập nhật account — cũng trừ totalSpent
    const newTotalSpent = Math.max(0, account.totalSpent - orderTotal)
    const newTier = this.calculateTier(newTotalSpent)

    await databaseService.loyaltyAccounts.updateOne(
      { userId },
      {
        $set: {
          pointsBalance: newBalance,
          totalSpent: newTotalSpent,
          tier: newTier,
          ...(newTier !== account.tier ? { tierUpdatedAt: new Date() } : {}),
          updatedAt: new Date()
        }
      }
    )
  }

  // ============================
  // TRANSACTION HISTORY
  // ============================

  async getTransactions(userId: ObjectId, page: number = 1, limit: number = 20, filter?: { type?: string }) {
    const skip = (page - 1) * limit
    const query: any = { userId }
    if (filter?.type) query.type = filter.type

    const [transactions, total] = await Promise.all([
      databaseService.loyaltyTransactions.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      databaseService.loyaltyTransactions.countDocuments(query)
    ])

    return {
      transactions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    }
  }

  // ============================
  // HELPERS
  // ============================

  private calculateTier(totalSpent: number): LoyaltyTier {
    if (totalSpent >= TIER_THRESHOLDS.platinum) return 'platinum'
    if (totalSpent >= TIER_THRESHOLDS.gold) return 'gold'
    if (totalSpent >= TIER_THRESHOLDS.silver) return 'silver'
    return 'member'
  }

  /**
   * Xử lý điểm hết hạn — chạy bằng cron job hoặc khi user truy cập
   */
  async processExpiredPoints(userId: ObjectId) {
    const now = new Date()

    // Tìm các transaction earn chưa hết hạn nhưng đã quá date
    const expiredTxs = await databaseService.loyaltyTransactions.find({
      userId,
      type: 'earn',
      isExpired: false,
      expiresAt: { $lte: now }
    }).toArray()

    if (!expiredTxs.length) return

    let totalExpired = 0
    for (const tx of expiredTxs) {
      totalExpired += tx.points
      await databaseService.loyaltyTransactions.updateOne(
        { _id: tx._id },
        { $set: { isExpired: true } }
      )
    }

    // Ghi transaction expire
    const account = await this.getOrCreateAccount(userId)
    const actualExpired = Math.min(totalExpired, account.pointsBalance)

    if (actualExpired > 0) {
      const newBalance = account.pointsBalance - actualExpired

      const expireTx = new LoyaltyTransaction({
        userId,
        type: 'expire',
        points: -actualExpired,
        balanceAfter: newBalance,
        description: `${actualExpired.toLocaleString('vi-VN')} điểm đã hết hạn`
      })
      await databaseService.loyaltyTransactions.insertOne(expireTx as any)

      await databaseService.loyaltyAccounts.updateOne(
        { userId },
        {
          $set: { pointsBalance: newBalance, updatedAt: new Date() },
          $inc: { totalPointsExpired: actualExpired }
        }
      )
    }
  }
}

const loyaltyService = new LoyaltyService()
export default loyaltyService
