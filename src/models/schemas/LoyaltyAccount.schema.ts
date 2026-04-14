import { ObjectId } from 'mongodb'

export type LoyaltyTier = 'member' | 'silver' | 'gold' | 'platinum'

export interface LoyaltyAccountType {
  _id?: ObjectId
  userId: ObjectId

  // Điểm
  pointsBalance: number      // Số điểm hiện có (có thể dùng)
  totalPointsEarned: number  // Tổng điểm đã tích từ trước đến nay
  totalPointsRedeemed: number // Tổng điểm đã dùng
  totalPointsExpired: number  // Tổng điểm đã hết hạn

  // Hạng thành viên
  tier: LoyaltyTier
  tierUpdatedAt?: Date

  // Tổng chi tiêu (dùng để xét hạng)
  totalSpent: number // Tổng tiền đã chi (VNĐ)

  createdAt?: Date
  updatedAt?: Date
}

// Bậc hạng: ngưỡng chi tiêu (VNĐ)
export const TIER_THRESHOLDS: Record<LoyaltyTier, number> = {
  member: 0,
  silver: 2_000_000,    // ≥ 2 triệu
  gold: 10_000_000,     // ≥ 10 triệu
  platinum: 50_000_000  // ≥ 50 triệu
}

// Hệ số nhân điểm theo hạng
export const TIER_MULTIPLIERS: Record<LoyaltyTier, number> = {
  member: 1,
  silver: 1.2,
  gold: 1.5,
  platinum: 2
}

export const TIER_LABELS: Record<LoyaltyTier, string> = {
  member: 'Thành viên',
  silver: 'Bạc',
  gold: 'Vàng',
  platinum: 'Kim cương'
}

export default class LoyaltyAccount {
  _id?: ObjectId
  userId: ObjectId
  pointsBalance: number
  totalPointsEarned: number
  totalPointsRedeemed: number
  totalPointsExpired: number
  tier: LoyaltyTier
  tierUpdatedAt?: Date
  totalSpent: number
  createdAt: Date
  updatedAt: Date

  constructor(account: LoyaltyAccountType) {
    const date = new Date()
    this._id = account._id || new ObjectId()
    this.userId = account.userId
    this.pointsBalance = account.pointsBalance || 0
    this.totalPointsEarned = account.totalPointsEarned || 0
    this.totalPointsRedeemed = account.totalPointsRedeemed || 0
    this.totalPointsExpired = account.totalPointsExpired || 0
    this.tier = account.tier || 'member'
    this.tierUpdatedAt = account.tierUpdatedAt
    this.totalSpent = account.totalSpent || 0
    this.createdAt = account.createdAt || date
    this.updatedAt = account.updatedAt || date
  }
}
