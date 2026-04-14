import { ObjectId } from 'mongodb'

export type CouponType = 'percentage' | 'fixed_amount' | 'fixed' | 'free_shipping'

export interface CouponType_Schema {
  _id?: ObjectId
  code: string // Unique, uppercase. VD: SAVE10, FREESHIP
  name: string // Tên hiển thị
  description?: string

  type: CouponType // Loại giảm giá
  value: number // Phần trăm (0–100) hoặc số tiền VNĐ
  maxDiscountAmount?: number // Giới hạn số tiền giảm tối đa (dùng khi type=percentage)

  // Điều kiện áp dụng
  minOrderAmount: number // Đơn hàng tối thiểu (VD: 200000đ)
  applicableProductIds?: ObjectId[] // Nếu có → chỉ áp dụng sản phẩm trong list
  applicableCategoryIds?: ObjectId[] // Nếu có → chỉ áp dụng danh mục trong list
  excludePrescriptionItems?: boolean // Không áp dụng cho thuốc kê đơn

  // Giới hạn sử dụng
  totalUsageLimit?: number // Tổng số lần dùng tối đa (null = không giới hạn)
  perUserLimit: number // Mỗi user được dùng tối đa N lần (default 1)
  currentUsageCount: number // Số lần đã dùng

  // Đối tượng mục tiêu
  isPublic: boolean // true = hiển thị cho tất cả, false = chỉ người có link/code
  targetUserIds?: ObjectId[] // Chỉ dành cho user cụ thể (VD: coupon sinh nhật)

  // Thời gian hiệu lực
  startDate: Date
  endDate: Date
  isActive: boolean

  createdBy: ObjectId
  createdAt?: Date
  updatedAt?: Date
}

export default class Coupon {
  _id?: ObjectId
  code: string
  name: string
  description?: string

  type: CouponType
  value: number
  maxDiscountAmount?: number

  minOrderAmount: number
  applicableProductIds?: ObjectId[]
  applicableCategoryIds?: ObjectId[]
  excludePrescriptionItems: boolean

  totalUsageLimit?: number
  perUserLimit: number
  currentUsageCount: number

  isPublic: boolean
  targetUserIds?: ObjectId[]

  startDate: Date
  endDate: Date
  isActive: boolean

  createdBy: ObjectId
  createdAt: Date
  updatedAt: Date

  constructor(coupon: CouponType_Schema) {
    const date = new Date()
    this._id = coupon._id || new ObjectId()
    this.code = coupon.code.toUpperCase().trim()
    this.name = coupon.name
    this.description = coupon.description

    this.type = coupon.type
    this.value = coupon.value
    this.maxDiscountAmount = coupon.maxDiscountAmount

    this.minOrderAmount = coupon.minOrderAmount || 0
    this.applicableProductIds = coupon.applicableProductIds
    this.applicableCategoryIds = coupon.applicableCategoryIds
    this.excludePrescriptionItems = coupon.excludePrescriptionItems || false

    this.totalUsageLimit = coupon.totalUsageLimit
    this.perUserLimit = coupon.perUserLimit || 1
    this.currentUsageCount = coupon.currentUsageCount || 0

    this.isPublic = coupon.isPublic !== undefined ? coupon.isPublic : true
    this.targetUserIds = coupon.targetUserIds

    this.startDate = coupon.startDate ? new Date(coupon.startDate) : new Date()
    this.endDate = coupon.endDate ? new Date(coupon.endDate) : new Date()
    this.isActive = coupon.isActive !== undefined ? coupon.isActive : true

    this.createdBy = coupon.createdBy
    this.createdAt = coupon.createdAt || date
    this.updatedAt = coupon.updatedAt || date
  }
}
