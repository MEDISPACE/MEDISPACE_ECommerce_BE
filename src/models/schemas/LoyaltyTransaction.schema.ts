import { ObjectId } from 'mongodb'

export type TransactionType = 'earn' | 'redeem' | 'expire' | 'revoke' | 'adjust'

export interface LoyaltyPointLotAllocation {
  lotId: ObjectId
  points: number
}

export interface LoyaltyTransactionType {
  _id?: ObjectId
  userId: ObjectId
  type: TransactionType
  points: number          // Số điểm (dương = cộng, âm = trừ)
  balanceAfter: number    // Số dư sau giao dịch

  // Liên kết
  orderId?: ObjectId      // Đơn hàng liên quan (earn/redeem/revoke)
  description: string     // Mô tả: "Tích điểm đơn hàng ORD-xxx", "Đổi điểm thanh toán"...

  // Hết hạn (chỉ áp dụng cho type='earn')
  expiresAt?: Date        // Ngày hết hạn của số điểm này
  isExpired?: boolean     // Đã hết hạn chưa
  allocations?: LoyaltyPointLotAllocation[] // Các lô điểm bị trừ/hoàn theo giao dịch

  createdAt?: Date
}

export default class LoyaltyTransaction {
  _id?: ObjectId
  userId: ObjectId
  type: TransactionType
  points: number
  balanceAfter: number
  orderId?: ObjectId
  description: string
  expiresAt?: Date
  isExpired: boolean
  allocations: LoyaltyPointLotAllocation[]
  createdAt: Date

  constructor(tx: LoyaltyTransactionType) {
    this._id = tx._id || new ObjectId()
    this.userId = tx.userId
    this.type = tx.type
    this.points = tx.points
    this.balanceAfter = tx.balanceAfter
    this.orderId = tx.orderId
    this.description = tx.description
    this.expiresAt = tx.expiresAt ? new Date(tx.expiresAt) : undefined
    this.isExpired = tx.isExpired || false
    this.allocations = tx.allocations || []
    this.createdAt = tx.createdAt || new Date()
  }
}
