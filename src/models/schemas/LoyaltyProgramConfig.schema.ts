import { ObjectId } from 'mongodb'
import { LoyaltyTier } from './LoyaltyAccount.schema'

export type LoyaltyProgramStatus = 'draft' | 'published' | 'archived'

export interface LoyaltyTierRule {
  code: LoyaltyTier
  label: string
  minTotalSpent: number
  multiplier: number
}

export interface LoyaltyProgramConfigType {
  _id?: ObjectId
  version: number
  status: LoyaltyProgramStatus
  pointsPerVnd: number
  pointsToVnd: number
  maxRedeemRatio: number
  minRedeem: number
  expiryDays: number
  tiers: LoyaltyTierRule[]
  createdBy?: ObjectId
  updatedBy?: ObjectId
  publishedBy?: ObjectId
  publishedAt?: Date
  createdAt?: Date
  updatedAt?: Date
}

export default class LoyaltyProgramConfig {
  _id: ObjectId
  version: number
  status: LoyaltyProgramStatus
  pointsPerVnd: number
  pointsToVnd: number
  maxRedeemRatio: number
  minRedeem: number
  expiryDays: number
  tiers: LoyaltyTierRule[]
  createdBy?: ObjectId
  updatedBy?: ObjectId
  publishedBy?: ObjectId
  publishedAt?: Date
  createdAt: Date
  updatedAt: Date

  constructor(config: LoyaltyProgramConfigType) {
    const now = new Date()
    this._id = config._id || new ObjectId()
    this.version = config.version
    this.status = config.status
    this.pointsPerVnd = config.pointsPerVnd
    this.pointsToVnd = config.pointsToVnd
    this.maxRedeemRatio = config.maxRedeemRatio
    this.minRedeem = config.minRedeem
    this.expiryDays = config.expiryDays
    this.tiers = config.tiers
    this.createdBy = config.createdBy
    this.updatedBy = config.updatedBy
    this.publishedBy = config.publishedBy
    this.publishedAt = config.publishedAt
    this.createdAt = config.createdAt || now
    this.updatedAt = config.updatedAt || now
  }
}
