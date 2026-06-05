import { ObjectId } from 'mongodb'
import LoyaltyAccount, { LoyaltyTier, TIER_THRESHOLDS, TIER_MULTIPLIERS, TIER_LABELS } from '~/models/schemas/LoyaltyAccount.schema'
import LoyaltyTransaction from '~/models/schemas/LoyaltyTransaction.schema'
import LoyaltyProgramConfig, { LoyaltyProgramConfigType, LoyaltyTierRule } from '~/models/schemas/LoyaltyProgramConfig.schema'
import databaseService from './database.services'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'

// Config from env
const POINTS_PER_VND = parseInt(process.env.POINTS_PER_VND || '1000')
const POINTS_MAX_REDEEM_RATIO = parseFloat(process.env.POINTS_MAX_REDEEM_RATIO || '0.3')
const POINTS_EXPIRY_DAYS = parseInt(process.env.POINTS_EXPIRY_DAYS || '365')
const POINTS_MIN_REDEEM = parseInt(process.env.POINTS_MIN_REDEEM || '10000')
const POINTS_TO_VND = 1 // 1 điểm = 1 VNĐ khi đổi

const DEFAULT_LOYALTY_TIERS: LoyaltyTierRule[] = [
  { code: 'member', label: TIER_LABELS.member, minTotalSpent: TIER_THRESHOLDS.member, multiplier: TIER_MULTIPLIERS.member },
  { code: 'silver', label: TIER_LABELS.silver, minTotalSpent: TIER_THRESHOLDS.silver, multiplier: TIER_MULTIPLIERS.silver },
  { code: 'gold', label: TIER_LABELS.gold, minTotalSpent: TIER_THRESHOLDS.gold, multiplier: TIER_MULTIPLIERS.gold },
  { code: 'platinum', label: TIER_LABELS.platinum, minTotalSpent: TIER_THRESHOLDS.platinum, multiplier: TIER_MULTIPLIERS.platinum }
]

const DEFAULT_LOYALTY_CONFIG: LoyaltyProgramConfigType = {
  version: 1,
  status: 'published',
  pointsPerVnd: POINTS_PER_VND,
  pointsToVnd: POINTS_TO_VND,
  maxRedeemRatio: POINTS_MAX_REDEEM_RATIO,
  minRedeem: POINTS_MIN_REDEEM,
  expiryDays: POINTS_EXPIRY_DAYS,
  tiers: DEFAULT_LOYALTY_TIERS
}

class LoyaltyService {
  private normalizeConfigPayload(data: any): LoyaltyProgramConfigType {
    const tiers = Array.isArray(data?.tiers) ? data.tiers : DEFAULT_LOYALTY_TIERS
    const normalizedTiers = tiers.map((tier: any) => ({
      code: tier.code as LoyaltyTier,
      label: (tier.label || TIER_LABELS[tier.code as LoyaltyTier] || tier.code || '').toString().trim(),
      minTotalSpent: Math.max(0, Math.floor(Number(tier.minTotalSpent) || 0)),
      multiplier: Number(tier.multiplier)
    }))

    const tierCodes: LoyaltyTier[] = ['member', 'silver', 'gold', 'platinum']
    const hasAllTiers = tierCodes.every((code) => normalizedTiers.some((tier) => tier.code === code))
    const multipliersValid = normalizedTiers.every((tier) => tier.label && Number.isFinite(tier.multiplier) && tier.multiplier > 0)
    const thresholdsSorted = [...normalizedTiers]
      .sort((a, b) => tierCodes.indexOf(a.code) - tierCodes.indexOf(b.code))
      .every((tier, index, arr) => index === 0 || tier.minTotalSpent >= arr[index - 1].minTotalSpent)

    if (!hasAllTiers || !multipliersValid || !thresholdsSorted) {
      throw new ErrorWithStatus({
        message: 'Cấu hình hạng loyalty không hợp lệ.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const pointsPerVnd = Math.floor(Number(data?.pointsPerVnd) || DEFAULT_LOYALTY_CONFIG.pointsPerVnd)
    const pointsToVnd = Number(data?.pointsToVnd) || DEFAULT_LOYALTY_CONFIG.pointsToVnd
    const maxRedeemRatio = Number(data?.maxRedeemRatio)
    const minRedeem = Math.floor(Number(data?.minRedeem) || DEFAULT_LOYALTY_CONFIG.minRedeem)
    const expiryDays = Math.floor(Number(data?.expiryDays) || DEFAULT_LOYALTY_CONFIG.expiryDays)

    if (pointsPerVnd <= 0 || pointsToVnd <= 0 || !Number.isFinite(maxRedeemRatio) || maxRedeemRatio <= 0 || maxRedeemRatio > 1 || minRedeem < 0 || expiryDays <= 0) {
      throw new ErrorWithStatus({
        message: 'Cấu hình quy đổi điểm không hợp lệ.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    return {
      version: Number(data?.version) || 1,
      status: (data?.status || 'draft') as any,
      pointsPerVnd,
      pointsToVnd,
      maxRedeemRatio,
      minRedeem,
      expiryDays,
      tiers: normalizedTiers
    }
  }

  async getActiveProgramConfig(): Promise<LoyaltyProgramConfigType> {
    const config = await databaseService.loyaltyProgramConfigs
      .find({ status: 'published' })
      .sort({ version: -1 })
      .limit(1)
      .toArray()

    return (config[0] as any) || DEFAULT_LOYALTY_CONFIG
  }

  async getAdminProgramConfig() {
    const [published, draft] = await Promise.all([
      databaseService.loyaltyProgramConfigs.find({ status: 'published' }).sort({ version: -1 }).limit(1).toArray(),
      databaseService.loyaltyProgramConfigs.find({ status: 'draft' }).sort({ version: -1 }).limit(1).toArray()
    ])

    return {
      published: (published[0] as any) || DEFAULT_LOYALTY_CONFIG,
      draft: draft[0] || null,
      defaults: DEFAULT_LOYALTY_CONFIG
    }
  }

  async saveDraftProgramConfig(data: any, adminId: ObjectId) {
    const current = await this.getAdminProgramConfig()
    const base = current.draft || current.published || DEFAULT_LOYALTY_CONFIG
    const latest = await databaseService.loyaltyProgramConfigs.find({}).sort({ version: -1 }).limit(1).toArray()
    const normalized = this.normalizeConfigPayload({ ...base, ...data, status: 'draft' })
    const now = new Date()

    if (current.draft?._id) {
      await databaseService.loyaltyProgramConfigs.updateOne(
        { _id: current.draft._id },
        { $set: { ...normalized, status: 'draft', updatedBy: adminId, updatedAt: now } }
      )
      return await databaseService.loyaltyProgramConfigs.findOne({ _id: current.draft._id })
    }

    const draft = new LoyaltyProgramConfig({
      ...normalized,
      version: Math.max(1, Number(latest[0]?.version || 0) + 1),
      status: 'draft',
      createdBy: adminId,
      updatedBy: adminId
    })
    await databaseService.loyaltyProgramConfigs.insertOne(draft)
    return draft
  }

  async publishDraftProgramConfig(adminId: ObjectId) {
    const draft = await databaseService.loyaltyProgramConfigs.find({ status: 'draft' }).sort({ version: -1 }).limit(1).toArray()
    if (!draft[0]) {
      throw new ErrorWithStatus({ message: 'Không có bản nháp loyalty để publish.', status: HTTP_STATUS.BAD_REQUEST })
    }

    const now = new Date()
    await databaseService.loyaltyProgramConfigs.updateMany(
      { status: 'published' },
      { $set: { status: 'archived', updatedAt: now, updatedBy: adminId } }
    )
    await databaseService.loyaltyProgramConfigs.updateOne(
      { _id: draft[0]._id },
      { $set: { status: 'published', publishedBy: adminId, publishedAt: now, updatedBy: adminId, updatedAt: now } }
    )

    return await databaseService.loyaltyProgramConfigs.findOne({ _id: draft[0]._id })
  }

  private getTierRule(config: LoyaltyProgramConfigType, tier: LoyaltyTier) {
    return config.tiers.find((rule) => rule.code === tier) || DEFAULT_LOYALTY_TIERS.find((rule) => rule.code === tier)!
  }

  private calculateTierFromConfig(totalSpent: number, config: LoyaltyProgramConfigType): LoyaltyTier {
    return [...config.tiers]
      .sort((a, b) => b.minTotalSpent - a.minTotalSpent)
      .find((tier) => totalSpent >= tier.minTotalSpent)?.code || 'member'
  }

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
    // Tự động xử lý điểm hết hạn khi user xem tài khoản — đảm bảo balance chính xác
    await this.processExpiredPoints(userId)

    const account = await this.getOrCreateAccount(userId)
    const config = await this.getActiveProgramConfig()

    // Tính tier tiếp theo
    const tiers: LoyaltyTier[] = ['member', 'silver', 'gold', 'platinum']
    const currentTierIndex = tiers.indexOf(account.tier)
    const nextTier = currentTierIndex < tiers.length - 1 ? tiers[currentTierIndex + 1] : null
    const nextTierThreshold = nextTier ? this.getTierRule(config, nextTier).minTotalSpent : null
    const progressToNextTier = nextTierThreshold 
      ? Math.min(100, Math.round((account.totalSpent / nextTierThreshold) * 100))
      : 100
    const currentTierRule = this.getTierRule(config, account.tier)

    return {
      pointsBalance: account.pointsBalance,
      totalPointsEarned: account.totalPointsEarned,
      totalPointsRedeemed: account.totalPointsRedeemed,
      tier: account.tier,
      tierLabel: currentTierRule.label,
      totalSpent: account.totalSpent,
      multiplier: currentTierRule.multiplier,
      nextTier,
      nextTierLabel: nextTier ? this.getTierRule(config, nextTier).label : null,
      nextTierThreshold,
      progressToNextTier,
      amountToNextTier: nextTierThreshold ? Math.max(0, nextTierThreshold - account.totalSpent) : 0,
      config: {
        version: config.version,
        pointsPerVnd: config.pointsPerVnd,
        maxRedeemRatio: config.maxRedeemRatio,
        expiryDays: config.expiryDays,
        minRedeem: config.minRedeem,
        pointsToVnd: config.pointsToVnd,
        tiers: config.tiers
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
    // IDEMPOTENCY: Kiểm tra đã tích điểm cho order này chưa
    const existingEarn = await databaseService.loyaltyTransactions.findOne({
      orderId, userId, type: 'earn'
    })
    if (existingEarn) {
      console.log(`[Loyalty] Points already earned for order ${orderId}, skipping.`)
      return
    }

    const account = await this.getOrCreateAccount(userId)
    const config = await this.getActiveProgramConfig()

    // Tính điểm: orderTotal / POINTS_PER_VND * tierMultiplier
    const basePoints = Math.floor(orderTotal / config.pointsPerVnd)
    const tierRule = this.getTierRule(config, account.tier)
    const multiplier = tierRule.multiplier
    const earnedPoints = Math.floor(basePoints * multiplier)

    if (earnedPoints <= 0) return

    // Ngày hết hạn
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + config.expiryDays)

    const newBalance = account.pointsBalance + earnedPoints

    // Ghi transaction
    const transaction = new LoyaltyTransaction({
      userId,
      type: 'earn',
      points: earnedPoints,
      balanceAfter: newBalance,
      orderId,
      description: `Tích ${earnedPoints} điểm từ đơn hàng ${orderNumber}${multiplier > 1 ? ` (x${multiplier} hạng ${tierRule.label})` : ''}`,
      expiresAt
    })
    try {
      await databaseService.loyaltyTransactions.insertOne(transaction as any)
    } catch (error: any) {
      if (error?.code === 11000) return
      throw error
    }

    // Cập nhật account
    const newTotalSpent = account.totalSpent + orderTotal
    const newTier = this.calculateTierFromConfig(newTotalSpent, config)

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
  async previewRedeem(pointsBalance: number, orderSubtotal: number) {
    const config = await this.getActiveProgramConfig()
    const maxRedeemByRatio = Math.floor(orderSubtotal * config.maxRedeemRatio)
    const maxRedeemByBalance = pointsBalance * config.pointsToVnd
    const maxRedeemAmount = Math.min(maxRedeemByRatio, maxRedeemByBalance)

    const pointsNeeded = Math.floor(maxRedeemAmount / config.pointsToVnd)
    const canRedeem = pointsBalance >= config.minRedeem

    return {
      canRedeem,
      maxRedeemAmount,
      pointsNeeded,
      pointsBalance,
      minRedeem: config.minRedeem,
      maxRedeemRatio: config.maxRedeemRatio,
      configVersion: config.version
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
    const config = await this.getActiveProgramConfig()

    const existingRedeem = await databaseService.loyaltyTransactions.findOne({
      userId,
      orderId,
      type: 'redeem'
    })
    if (existingRedeem && existingRedeem.points < 0) {
      return Math.abs(existingRedeem.points) * config.pointsToVnd
    }

    // Validate min redeem
    if (pointsToRedeem < config.minRedeem) {
      throw new ErrorWithStatus({
        message: `Cần tối thiểu ${config.minRedeem.toLocaleString('vi-VN')} điểm để đổi.`,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const redeemAmount = pointsToRedeem * config.pointsToVnd
    const maxRedeemByRatio = Math.floor(orderSubtotal * config.maxRedeemRatio)

    if (redeemAmount > maxRedeemByRatio) {
      throw new ErrorWithStatus({
        message: `Chỉ được đổi tối đa ${config.maxRedeemRatio * 100}% giá trị đơn hàng (${maxRedeemByRatio.toLocaleString('vi-VN')}đ).`,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // ATOMIC: trừ điểm chỉ khi còn đủ balance — tránh race condition 2 request đồng thời
    const updatedAccount = await databaseService.loyaltyAccounts.findOneAndUpdate(
      { userId, pointsBalance: { $gte: pointsToRedeem } },
      {
        $inc: { pointsBalance: -pointsToRedeem, totalPointsRedeemed: pointsToRedeem },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: 'after' }
    )

    if (!updatedAccount) {
      throw new ErrorWithStatus({
        message: 'Không đủ điểm hoặc đang xử lý giao dịch khác. Vui lòng thử lại.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // Ghi transaction (balance đã update atomically)
    const transaction = new LoyaltyTransaction({
      userId,
      type: 'redeem',
      points: -pointsToRedeem,
      balanceAfter: updatedAccount.pointsBalance,
      orderId,
      description: `Đổi ${pointsToRedeem.toLocaleString('vi-VN')} điểm giảm ${redeemAmount.toLocaleString('vi-VN')}đ cho đơn ${orderNumber}`
    })
    try {
      await databaseService.loyaltyTransactions.insertOne(transaction as any)
    } catch (error: any) {
      if (error?.code === 11000) {
        const existing = await databaseService.loyaltyTransactions.findOne({
          userId,
          orderId,
          type: 'redeem'
        })
        return existing && existing.points < 0 ? Math.abs(existing.points) * config.pointsToVnd : 0
      }

      await databaseService.loyaltyAccounts.updateOne(
        { userId },
        {
          $inc: { pointsBalance: pointsToRedeem, totalPointsRedeemed: -pointsToRedeem },
          $set: { updatedAt: new Date() }
        }
      )
      throw error
    }

    return redeemAmount
  }

  /**
   * Hoàn lại điểm đã đổi khi order bị hủy / thanh toán thất bại / rollback.
   * Idempotent theo orderId: chỉ hoàn nếu có transaction redeem và chưa có transaction adjust hoàn điểm.
   */
  async refundRedeemedPointsForOrder(userId: ObjectId, orderId: ObjectId, orderNumber: string) {
    const redeemTx = await databaseService.loyaltyTransactions.findOne({
      userId,
      orderId,
      type: 'redeem'
    })
    if (!redeemTx || redeemTx.points >= 0) return

    const existingRefund = await databaseService.loyaltyTransactions.findOne({
      userId,
      orderId,
      type: 'adjust',
      description: { $regex: 'Hoàn điểm đã đổi' }
    })
    if (existingRefund) return

    const pointsToRefund = Math.abs(redeemTx.points)
    const updatedAccount = await databaseService.loyaltyAccounts.findOneAndUpdate(
      { userId },
      {
        $inc: {
          pointsBalance: pointsToRefund,
          totalPointsRedeemed: -pointsToRefund
        },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: 'after' }
    )

    if (!updatedAccount) return

    const transaction = new LoyaltyTransaction({
      userId,
      type: 'adjust',
      points: pointsToRefund,
      balanceAfter: updatedAccount.pointsBalance,
      orderId,
      description: `Hoàn điểm đã đổi do đơn ${orderNumber} không hoàn tất`
    })
    try {
      await databaseService.loyaltyTransactions.insertOne(transaction as any)
    } catch (error: any) {
      if (error?.code === 11000) return

      await databaseService.loyaltyAccounts.updateOne(
        { userId },
        {
          $inc: {
            pointsBalance: -pointsToRefund,
            totalPointsRedeemed: pointsToRefund
          },
          $set: { updatedAt: new Date() }
        }
      )
      throw error
    }
  }

  /**
   * Admin điều chỉnh điểm thủ công.
   * Không sửa thẳng balance ngoài luồng transaction để còn audit được lý do và người thao tác.
   */
  async adjustPointsByAdmin(
    userId: ObjectId,
    adminId: ObjectId,
    points: number,
    action: 'add' | 'subtract',
    reason: string
  ) {
    const normalizedPoints = Math.floor(points)
    if (normalizedPoints <= 0) {
      throw new ErrorWithStatus({
        message: 'Số điểm điều chỉnh phải lớn hơn 0.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const cleanReason = reason?.trim()
    if (!cleanReason || cleanReason.length < 5) {
      throw new ErrorWithStatus({
        message: 'Vui lòng nhập lý do điều chỉnh điểm tối thiểu 5 ký tự.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    await this.getOrCreateAccount(userId)

    const delta = action === 'subtract' ? -normalizedPoints : normalizedPoints
    const query: any = { userId }
    if (delta < 0) query.pointsBalance = { $gte: normalizedPoints }

    const updatedAccount = await databaseService.loyaltyAccounts.findOneAndUpdate(
      query,
      {
        $inc: { pointsBalance: delta },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: 'after' }
    )

    if (!updatedAccount) {
      throw new ErrorWithStatus({
        message: 'Không đủ điểm để trừ hoặc tài khoản điểm đang được xử lý. Vui lòng thử lại.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const transaction = new LoyaltyTransaction({
      userId,
      type: 'adjust',
      points: delta,
      balanceAfter: updatedAccount.pointsBalance,
      description: `${delta > 0 ? 'Cộng' : 'Trừ'} ${normalizedPoints.toLocaleString('vi-VN')} điểm bởi admin ${adminId.toString()}: ${cleanReason}`
    })

    await databaseService.loyaltyTransactions.insertOne(transaction as any)
    return { account: updatedAccount, transaction }
  }

  // ============================
  // POINT REVOCATION (RETURNS)
  // ============================

  /**
   * Thu hồi điểm khi hoàn trả đơn hàng
   */
  async revokePointsForReturn(userId: ObjectId, orderId: ObjectId, orderTotal: number, orderNumber: string) {
    const account = await this.getOrCreateAccount(userId)
    const config = await this.getActiveProgramConfig()

    const existingRevoke = await databaseService.loyaltyTransactions.findOne({
      userId,
      orderId,
      type: 'revoke'
    })
    if (existingRevoke) return

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
    try {
      await databaseService.loyaltyTransactions.insertOne(transaction as any)
    } catch (error: any) {
      if (error?.code === 11000) return
      throw error
    }

    // Cập nhật account — cũng trừ totalSpent
    const newTotalSpent = Math.max(0, account.totalSpent - orderTotal)
    const newTier = this.calculateTierFromConfig(newTotalSpent, config)

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
