import { ObjectId } from 'mongodb'
import LoyaltyAccount, { LoyaltyTier, TIER_THRESHOLDS, TIER_MULTIPLIERS, TIER_LABELS } from '~/models/schemas/LoyaltyAccount.schema'
import LoyaltyTransaction, { LoyaltyPointLotAllocation } from '~/models/schemas/LoyaltyTransaction.schema'
import LoyaltyProgramConfig, { LoyaltyProgramConfigType, LoyaltyTierRule } from '~/models/schemas/LoyaltyProgramConfig.schema'
import LoyaltyPointLot from '~/models/schemas/LoyaltyPointLot.schema'
import databaseService from './database.services'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'

// Config from env
const POINTS_PER_VND = parseInt(process.env.POINTS_PER_VND || '1000')
const POINTS_MAX_REDEEM_RATIO = parseFloat(process.env.POINTS_MAX_REDEEM_RATIO || '0.3')
const POINTS_EXPIRY_DAYS = parseInt(process.env.POINTS_EXPIRY_DAYS || '365')
const POINTS_MIN_REDEEM = parseInt(process.env.POINTS_MIN_REDEEM || '0')
const POINTS_TO_VND = parseFloat(process.env.POINTS_TO_VND || '1')

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

    const pointsPerVnd = Math.floor(data?.pointsPerVnd == null ? DEFAULT_LOYALTY_CONFIG.pointsPerVnd : Number(data.pointsPerVnd))
    const pointsToVnd = data?.pointsToVnd == null ? DEFAULT_LOYALTY_CONFIG.pointsToVnd : Number(data.pointsToVnd)
    const maxRedeemRatio = data?.maxRedeemRatio == null ? DEFAULT_LOYALTY_CONFIG.maxRedeemRatio : Number(data.maxRedeemRatio)
    const minRedeem = Math.floor(data?.minRedeem == null ? DEFAULT_LOYALTY_CONFIG.minRedeem : Number(data.minRedeem))
    const expiryDays = Math.floor(data?.expiryDays == null ? DEFAULT_LOYALTY_CONFIG.expiryDays : Number(data.expiryDays))

    if (pointsPerVnd <= 0 || pointsToVnd <= 0 || !Number.isFinite(maxRedeemRatio) || maxRedeemRatio <= 0 || maxRedeemRatio > 1 || minRedeem < 0 || expiryDays <= 0) {
      throw new ErrorWithStatus({
        message: 'Cấu hình quy đổi điểm không hợp lệ.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    return {
      version: Number(data?.version) || 1,
      status: 'published',
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
    const published = await databaseService.loyaltyProgramConfigs.find({ status: 'published' }).sort({ version: -1 }).limit(1).toArray()
    const active = (published[0] as any) || DEFAULT_LOYALTY_CONFIG

    return {
      published: active,
      config: active,
      draft: null,
      defaults: DEFAULT_LOYALTY_CONFIG
    }
  }

  async saveProgramConfig(data: any, adminId: ObjectId) {
    const current = await this.getAdminProgramConfig()
    const base = current.published || DEFAULT_LOYALTY_CONFIG
    const latest = await databaseService.loyaltyProgramConfigs.find({}).sort({ version: -1 }).limit(1).toArray()
    const normalized = this.normalizeConfigPayload({ ...base, ...data, status: 'published' })
    const now = new Date()

    if (current.published?._id) {
      await databaseService.loyaltyProgramConfigs.updateOne(
        { _id: current.published._id },
        { $set: { ...normalized, status: 'published', publishedBy: adminId, publishedAt: now, updatedBy: adminId, updatedAt: now } }
      )
      return await databaseService.loyaltyProgramConfigs.findOne({ _id: current.published._id })
    }

    const config = new LoyaltyProgramConfig({
      ...normalized,
      version: Math.max(1, Number(latest[0]?.version || 0) + 1),
      status: 'published',
      createdBy: adminId,
      updatedBy: adminId,
      publishedBy: adminId,
      publishedAt: now
    })
    await databaseService.loyaltyProgramConfigs.insertOne(config)
    return config
  }

  private getTierRule(config: LoyaltyProgramConfigType, tier: LoyaltyTier) {
    return config.tiers.find((rule) => rule.code === tier) || DEFAULT_LOYALTY_TIERS.find((rule) => rule.code === tier)!
  }

  private calculateTierFromConfig(totalSpent: number, config: LoyaltyProgramConfigType): LoyaltyTier {
    return [...config.tiers]
      .sort((a, b) => b.minTotalSpent - a.minTotalSpent)
      .find((tier) => totalSpent >= tier.minTotalSpent)?.code || 'member'
  }

  private async createPointLot(params: {
    userId: ObjectId
    source: 'earn' | 'admin_adjust' | 'legacy_adjustment'
    points: number
    orderId?: ObjectId
    adminId?: ObjectId
    expiresAt?: Date
  }) {
    if (params.points <= 0 || !databaseService.loyaltyPointLots) return null

    const lot = new LoyaltyPointLot({
      userId: params.userId,
      source: params.source,
      orderId: params.orderId,
      adminId: params.adminId,
      pointsOriginal: params.points,
      pointsRemaining: params.points,
      expiresAt: params.expiresAt,
      status: 'active'
    })

    await databaseService.loyaltyPointLots.insertOne(lot as any)
    return lot
  }

  private sortLotsByExpiry(lots: any[]) {
    return lots.sort((left, right) => {
      const leftExpiry = left.expiresAt ? new Date(left.expiresAt).getTime() : Number.MAX_SAFE_INTEGER
      const rightExpiry = right.expiresAt ? new Date(right.expiresAt).getTime() : Number.MAX_SAFE_INTEGER
      if (leftExpiry !== rightExpiry) return leftExpiry - rightExpiry
      return new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime()
    })
  }

  private async getSpendableLots(userId: ObjectId) {
    const now = new Date()
    const lots = await databaseService.loyaltyPointLots.find({
      userId,
      status: 'active',
      pointsRemaining: { $gt: 0 },
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }]
    }).toArray()

    return this.sortLotsByExpiry(lots)
  }

  private async consumePointLots(userId: ObjectId, pointsToConsume: number): Promise<LoyaltyPointLotAllocation[]> {
    if (pointsToConsume <= 0) return []
    const lots = await this.getSpendableLots(userId)
    const availableFromLots = lots.reduce((sum, lot: any) => sum + (lot.pointsRemaining || 0), 0)

    if (availableFromLots < pointsToConsume) {
      const missing = pointsToConsume - availableFromLots
      const legacyLot = await this.createPointLot({
        userId,
        source: 'legacy_adjustment',
        points: missing
      })
      if (legacyLot) lots.push(legacyLot)
    }

    const allocations: LoyaltyPointLotAllocation[] = []
    let remaining = pointsToConsume

    for (const lot of this.sortLotsByExpiry(lots)) {
      if (remaining <= 0) break
      const currentRemaining = Math.max(0, Number(lot.pointsRemaining || 0))
      if (currentRemaining <= 0) continue

      const points = Math.min(currentRemaining, remaining)
      const nextRemaining = currentRemaining - points
      const updateResult = await databaseService.loyaltyPointLots.updateOne(
        { _id: lot._id, userId, status: 'active', pointsRemaining: { $gte: points } },
        {
          $inc: { pointsRemaining: -points },
          $set: {
            status: nextRemaining <= 0 ? 'consumed' : 'active',
            ...(nextRemaining <= 0 ? { consumedAt: new Date() } : {}),
            updatedAt: new Date()
          }
        }
      )

      if (updateResult.modifiedCount === 0) {
        throw new ErrorWithStatus({
          message: 'Không thể giữ chỗ lô điểm thưởng. Vui lòng thử lại.',
          status: HTTP_STATUS.CONFLICT
        })
      }

      allocations.push({ lotId: lot._id, points })
      remaining -= points
    }

    if (remaining > 0) {
      throw new ErrorWithStatus({
        message: 'Không đủ điểm còn hiệu lực để đổi.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    return allocations
  }

  private async restorePointLotAllocations(userId: ObjectId, allocations: LoyaltyPointLotAllocation[] = []) {
    for (const allocation of allocations) {
      if (!allocation?.lotId || allocation.points <= 0) continue
      await databaseService.loyaltyPointLots.updateOne(
        { _id: new ObjectId(allocation.lotId), userId, status: { $ne: 'revoked' } },
        {
          $inc: { pointsRemaining: allocation.points },
          $set: { status: 'active', updatedAt: new Date() },
          $unset: { consumedAt: '' }
        }
      )
    }
  }

  private async rollbackConsumedPointLots(userId: ObjectId, allocations: LoyaltyPointLotAllocation[] = []) {
    if (!allocations.length) return
    await this.restorePointLotAllocations(userId, allocations)
  }

  private async rollbackRestoredPointLots(userId: ObjectId, allocations: LoyaltyPointLotAllocation[] = []) {
    for (const allocation of allocations) {
      if (!allocation?.lotId || allocation.points <= 0) continue
      await databaseService.loyaltyPointLots.updateOne(
        { _id: new ObjectId(allocation.lotId), userId, pointsRemaining: { $gte: allocation.points } },
        {
          $inc: { pointsRemaining: -allocation.points },
          $set: { updatedAt: new Date() }
        }
      )
    }
  }

  private async revokePointLotsForOrder(userId: ObjectId, orderId: ObjectId, pointsToRevoke: number) {
    if (pointsToRevoke <= 0) return []
    const lots = await databaseService.loyaltyPointLots.find({
      userId,
      orderId,
      source: 'earn',
      status: 'active',
      pointsRemaining: { $gt: 0 }
    }).toArray()

    const allocations: LoyaltyPointLotAllocation[] = []
    let remaining = pointsToRevoke

    for (const lot of this.sortLotsByExpiry(lots)) {
      if (remaining <= 0) break
      const currentRemaining = Math.max(0, Number(lot.pointsRemaining || 0))
      if (currentRemaining <= 0) continue

      const points = Math.min(currentRemaining, remaining)
      const nextRemaining = currentRemaining - points
      const updateResult = await databaseService.loyaltyPointLots.updateOne(
        { _id: lot._id, userId, orderId, status: 'active', pointsRemaining: { $gte: points } },
        {
          $inc: { pointsRemaining: -points },
          $set: {
            status: nextRemaining <= 0 ? 'revoked' : 'active',
            ...(nextRemaining <= 0 ? { revokedAt: new Date() } : {}),
            updatedAt: new Date()
          }
        }
      )
      if (updateResult.modifiedCount === 0) break
      allocations.push({ lotId: lot._id, points })
      remaining -= points
    }

    return allocations
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
    const lot = await this.createPointLot({
      userId,
      source: 'earn',
      points: earnedPoints,
      orderId,
      expiresAt
    })

    // Ghi transaction
    const transaction = new LoyaltyTransaction({
      userId,
      type: 'earn',
      points: earnedPoints,
      balanceAfter: newBalance,
      orderId,
      description: `Tích ${earnedPoints} điểm từ đơn hàng ${orderNumber}${multiplier > 1 ? ` (x${multiplier} hạng ${tierRule.label})` : ''}`,
      expiresAt,
      allocations: lot ? [{ lotId: lot._id, points: earnedPoints }] : []
    })
    try {
      await databaseService.loyaltyTransactions.insertOne(transaction as any)
    } catch (error: any) {
      if (lot?._id) await databaseService.loyaltyPointLots.deleteOne({ _id: lot._id, userId })
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
    const canRedeem = pointsBalance > 0 && pointsBalance >= config.minRedeem && pointsNeeded > 0

    return {
      canRedeem,
      maxRedeemAmount,
      pointsNeeded,
      pointsBalance,
      minRedeem: config.minRedeem,
      pointsToVnd: config.pointsToVnd,
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

    let allocations: LoyaltyPointLotAllocation[] = []
    try {
      allocations = await this.consumePointLots(userId, pointsToRedeem)
    } catch (error) {
      await databaseService.loyaltyAccounts.updateOne(
        { userId },
        {
          $inc: { pointsBalance: pointsToRedeem, totalPointsRedeemed: -pointsToRedeem },
          $set: { updatedAt: new Date() }
        }
      )
      throw error
    }

    // Ghi transaction (balance đã update atomically)
    const transaction = new LoyaltyTransaction({
      userId,
      type: 'redeem',
      points: -pointsToRedeem,
      balanceAfter: updatedAccount.pointsBalance,
      orderId,
      description: `Đổi ${pointsToRedeem.toLocaleString('vi-VN')} điểm giảm ${redeemAmount.toLocaleString('vi-VN')}đ cho đơn ${orderNumber}`,
      allocations
    })
    try {
      await databaseService.loyaltyTransactions.insertOne(transaction as any)
    } catch (error: any) {
      if (error?.code === 11000) {
        await this.rollbackConsumedPointLots(userId, allocations)
        await databaseService.loyaltyAccounts.updateOne(
          { userId },
          {
            $inc: { pointsBalance: pointsToRedeem, totalPointsRedeemed: -pointsToRedeem },
            $set: { updatedAt: new Date() }
          }
        )
        const existing = await databaseService.loyaltyTransactions.findOne({
          userId,
          orderId,
          type: 'redeem'
        })
        return existing && existing.points < 0 ? Math.abs(existing.points) * config.pointsToVnd : 0
      }

      await this.rollbackConsumedPointLots(userId, allocations)
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

    const allocations = (redeemTx.allocations || []) as LoyaltyPointLotAllocation[]
    await this.restorePointLotAllocations(userId, allocations)

    const transaction = new LoyaltyTransaction({
      userId,
      type: 'adjust',
      points: pointsToRefund,
      balanceAfter: updatedAccount.pointsBalance,
      orderId,
      description: `Hoàn điểm đã đổi do đơn ${orderNumber} không hoàn tất`,
      allocations
    })
    try {
      await databaseService.loyaltyTransactions.insertOne(transaction as any)
    } catch (error: any) {
      if (error?.code === 11000) {
        await this.rollbackRestoredPointLots(userId, allocations)
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
        return
      }

      await this.rollbackRestoredPointLots(userId, allocations)
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

    let allocations: LoyaltyPointLotAllocation[] = []
    if (delta < 0) {
      try {
        allocations = await this.consumePointLots(userId, normalizedPoints)
      } catch (error) {
        await databaseService.loyaltyAccounts.updateOne(
          { userId },
          {
            $inc: { pointsBalance: normalizedPoints },
            $set: { updatedAt: new Date() }
          }
        )
        throw error
      }
    }

    const transaction = new LoyaltyTransaction({
      userId,
      type: 'adjust',
      points: delta,
      balanceAfter: updatedAccount.pointsBalance,
      description: `${delta > 0 ? 'Cộng' : 'Trừ'} ${normalizedPoints.toLocaleString('vi-VN')} điểm bởi admin: ${cleanReason}`,
      allocations
    })

    try {
      await databaseService.loyaltyTransactions.insertOne(transaction as any)
    } catch (error) {
      if (delta < 0) await this.rollbackConsumedPointLots(userId, allocations)
      await databaseService.loyaltyAccounts.updateOne(
        { userId },
        {
          $inc: { pointsBalance: -delta },
          $set: { updatedAt: new Date() }
        }
      )
      throw error
    }

    if (delta > 0) {
      const config = await this.getActiveProgramConfig()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + config.expiryDays)
      await this.createPointLot({
        userId,
        source: 'admin_adjust',
        points: normalizedPoints,
        adminId,
        expiresAt
      })
    }

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

    const pointsFromReturnedAmount = Math.floor(orderTotal / config.pointsPerVnd)
    const revokePoints = Math.min(earnTx.points, pointsFromReturnedAmount, account.pointsBalance)
    if (revokePoints <= 0) return

    const newBalance = account.pointsBalance - revokePoints
    const allocations = await this.revokePointLotsForOrder(userId, orderId, revokePoints)

    const transaction = new LoyaltyTransaction({
      userId,
      type: 'revoke',
      points: -revokePoints,
      balanceAfter: newBalance,
      orderId,
      description: `Thu hồi ${revokePoints} điểm do hoàn trả đơn ${orderNumber}`,
      allocations
    })
    try {
      await databaseService.loyaltyTransactions.insertOne(transaction as any)
    } catch (error: any) {
      if (error?.code === 11000) {
        await this.restorePointLotAllocations(userId, allocations)
        return
      }
      await this.restorePointLotAllocations(userId, allocations)
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

    const hasPointLots = await databaseService.loyaltyPointLots.countDocuments({ userId }, { limit: 1 } as any)
    if (hasPointLots > 0) {
      const expiredLots = await databaseService.loyaltyPointLots.find({
        userId,
        status: 'active',
        pointsRemaining: { $gt: 0 },
        expiresAt: { $lte: now }
      }).toArray()

      if (!expiredLots.length) return

      const account = await this.getOrCreateAccount(userId)
      let remainingToExpire = Math.min(
        expiredLots.reduce((sum, lot: any) => sum + (lot.pointsRemaining || 0), 0),
        account.pointsBalance
      )
      if (remainingToExpire <= 0) return

      const allocations: LoyaltyPointLotAllocation[] = []
      for (const lot of this.sortLotsByExpiry(expiredLots)) {
        if (remainingToExpire <= 0) break
        const points = Math.min(lot.pointsRemaining || 0, remainingToExpire)
        if (points <= 0) continue
        const nextRemaining = (lot.pointsRemaining || 0) - points
        await databaseService.loyaltyPointLots.updateOne(
          { _id: lot._id, userId, status: 'active', pointsRemaining: { $gte: points } },
          {
            $inc: { pointsRemaining: -points },
            $set: {
              status: nextRemaining <= 0 ? 'expired' : 'active',
              ...(nextRemaining <= 0 ? { expiredAt: now } : {}),
              updatedAt: now
            }
          }
        )
        allocations.push({ lotId: lot._id, points })
        remainingToExpire -= points
      }

      const actualExpired = allocations.reduce((sum, allocation) => sum + allocation.points, 0)
      if (actualExpired <= 0) return
      const newBalance = Math.max(0, account.pointsBalance - actualExpired)

      const expireTx = new LoyaltyTransaction({
        userId,
        type: 'expire',
        points: -actualExpired,
        balanceAfter: newBalance,
        description: `${actualExpired.toLocaleString('vi-VN')} điểm đã hết hạn`,
        allocations
      })
      await databaseService.loyaltyTransactions.insertOne(expireTx as any)

      await databaseService.loyaltyAccounts.updateOne(
        { userId },
        {
          $set: { pointsBalance: newBalance, updatedAt: new Date() },
          $inc: { totalPointsExpired: actualExpired }
        }
      )
      return
    }

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
