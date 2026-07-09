import { ObjectId } from 'mongodb'

export type LoyaltyPointLotStatus = 'active' | 'consumed' | 'expired' | 'revoked'
export type LoyaltyPointLotSource = 'earn' | 'admin_adjust' | 'legacy_adjustment'

export interface LoyaltyPointLotType {
  _id?: ObjectId
  userId: ObjectId
  source: LoyaltyPointLotSource
  orderId?: ObjectId
  adminId?: ObjectId
  pointsOriginal: number
  pointsRemaining: number
  expiresAt?: Date
  status?: LoyaltyPointLotStatus
  createdAt?: Date
  updatedAt?: Date
  consumedAt?: Date
  expiredAt?: Date
  revokedAt?: Date
}

export default class LoyaltyPointLot {
  _id: ObjectId
  userId: ObjectId
  source: LoyaltyPointLotSource
  orderId?: ObjectId
  adminId?: ObjectId
  pointsOriginal: number
  pointsRemaining: number
  expiresAt?: Date
  status: LoyaltyPointLotStatus
  createdAt: Date
  updatedAt: Date
  consumedAt?: Date
  expiredAt?: Date
  revokedAt?: Date

  constructor(lot: LoyaltyPointLotType) {
    const now = new Date()
    this._id = lot._id || new ObjectId()
    this.userId = lot.userId
    this.source = lot.source
    this.orderId = lot.orderId
    this.adminId = lot.adminId
    this.pointsOriginal = lot.pointsOriginal
    this.pointsRemaining = lot.pointsRemaining
    this.expiresAt = lot.expiresAt ? new Date(lot.expiresAt) : undefined
    this.status = lot.status || 'active'
    this.createdAt = lot.createdAt || now
    this.updatedAt = lot.updatedAt || now
    this.consumedAt = lot.consumedAt
    this.expiredAt = lot.expiredAt
    this.revokedAt = lot.revokedAt
  }
}
