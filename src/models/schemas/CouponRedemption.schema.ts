import { ObjectId } from 'mongodb'

export interface CouponRedemptionType {
  _id?: ObjectId
  couponId: ObjectId
  couponCode: string
  userId: ObjectId
  orderId: ObjectId
  discountAmount: number // Số tiền đã giảm thực tế
  createdAt?: Date
}

export default class CouponRedemption {
  _id?: ObjectId
  couponId: ObjectId
  couponCode: string
  userId: ObjectId
  orderId: ObjectId
  discountAmount: number
  createdAt: Date

  constructor(redemption: CouponRedemptionType) {
    this._id = redemption._id || new ObjectId()
    this.couponId = redemption.couponId
    this.couponCode = redemption.couponCode
    this.userId = redemption.userId
    this.orderId = redemption.orderId
    this.discountAmount = redemption.discountAmount
    this.createdAt = redemption.createdAt || new Date()
  }
}
