import { ObjectId } from 'mongodb'
import Coupon, { CouponType } from '~/models/schemas/Coupon.schema'
import CouponRedemption from '~/models/schemas/CouponRedemption.schema'
import databaseService from './database.services'
import cacheService from './cache.services'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'

export interface ValidateCouponResult {
  isValid: boolean
  coupon?: any
  discountAmount: number
  message: string
  discountType: CouponType | null
}

class CouponService {
  // ============================
  // VALIDATION & APPLICATION
  // ============================

  /**
   * Validate coupon code & tính toán discount
   * Không thay đổi DB — chỉ preview
   */
  async validateCoupon(
    code: string,
    userId: ObjectId,
    cartSubtotal: number,
    hasPrescriptionItems: boolean = false
  ): Promise<ValidateCouponResult> {
    const now = new Date()

    // 1. Tìm coupon — chỉ filter isActive ở DB, date validation xử lý ở code
    // (tránh BSON type mismatch khi endDate lưu dạng string thay vì Date)
    const coupon = await databaseService.coupons.findOne({
      code: code.toUpperCase().trim(),
      isActive: true
    })

    if (!coupon) {
      return { isValid: false, discountAmount: 0, message: 'Mã giảm giá không tồn tại hoặc đã bị vô hiệu hóa.', discountType: null }
    }

    // 2. Kiểm tra thời gian hiệu lực — cast sang Date để xử lý cả string lẫn Date từ DB
    const startDate = new Date(coupon.startDate)
    const endDate = new Date(coupon.endDate)
    if (now < startDate || now > endDate) {
      return { isValid: false, discountAmount: 0, message: 'Mã giảm giá đã hết hạn hoặc chưa đến thời gian áp dụng.', discountType: null }
    }

    // 3. Kiểm tra giá trị đơn hàng tối thiểu
    if (cartSubtotal < coupon.minOrderAmount) {
      const formatted = coupon.minOrderAmount.toLocaleString('vi-VN')
      return {
        isValid: false,
        discountAmount: 0,
        message: `Đơn hàng tối thiểu ${formatted}đ để áp dụng mã này.`,
        discountType: null
      }
    }

    // 4. Kiểm tra giới hạn tổng lần dùng
    if (coupon.totalUsageLimit !== undefined && coupon.totalUsageLimit !== null) {
      if (coupon.currentUsageCount >= coupon.totalUsageLimit) {
        return { isValid: false, discountAmount: 0, message: 'Mã giảm giá đã hết lượt sử dụng.', discountType: null }
      }
    }

    // 5. Kiểm tra giới hạn số lần mỗi user
    const userUsageCount = await databaseService.couponRedemptions.countDocuments({
      couponId: coupon._id,
      userId
    })
    if (userUsageCount >= coupon.perUserLimit) {
      return { isValid: false, discountAmount: 0, message: `Bạn đã sử dụng mã này ${coupon.perUserLimit} lần (đã đạt giới hạn).`, discountType: null }
    }

    // 6. Kiểm tra đối tượng mục tiêu
    if (coupon.targetUserIds && coupon.targetUserIds.length > 0) {
      const isTargeted = coupon.targetUserIds.some((id: ObjectId) => id.toString() === userId.toString())
      if (!isTargeted) {
        return { isValid: false, discountAmount: 0, message: 'Mã giảm giá này không áp dụng cho tài khoản của bạn.', discountType: null }
      }
    }

    // 7. Kiểm tra thuốc kê đơn
    if (coupon.excludePrescriptionItems && hasPrescriptionItems) {
      return { isValid: false, discountAmount: 0, message: 'Mã giảm giá không áp dụng cho đơn hàng có thuốc kê đơn.', discountType: null }
    }

    // 8. Tính discount amount
    let discountAmount = 0

    if (coupon.type === 'percentage') {
      discountAmount = Math.floor(cartSubtotal * (coupon.value / 100))
      // Giới hạn tối đa nếu có maxDiscountAmount
      if (coupon.maxDiscountAmount) {
        discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount)
      }
      // Không được giảm quá subtotal
      discountAmount = Math.min(discountAmount, cartSubtotal)
    } else if (coupon.type === 'fixed_amount' || coupon.type === 'fixed') {
      discountAmount = Math.min(coupon.value, cartSubtotal) // Không giảm quá subtotal
    } else if (coupon.type === 'free_shipping') {
      // discountAmount = 0 — shipping discount xử lý riêng bên order
      discountAmount = 0
    }

    return {
      isValid: true,
      coupon,
      discountAmount,
      message: 'Áp dụng mã giảm giá thành công!',
      discountType: coupon.type
    }
  }

  /**
   * Áp dụng coupon vào cart (lưu vào DB)
   * Rule: Tối đa 1 mã giảm giá + 1 mã freeship
   */
  async applyCouponToCart(
    code: string,
    userId: ObjectId,
    sessionId?: string,
    selectedSubtotal?: number  // Subtotal của các sản phẩm được chọn từ FE
  ) {
    // Lấy cart
    const cartQuery = userId
      ? { userId }
      : sessionId
        ? { sessionId }
        : null

    if (!cartQuery) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy giỏ hàng.', status: HTTP_STATUS.BAD_REQUEST })
    }

    const cart = await databaseService.carts.findOne(cartQuery as any)
    if (!cart) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy giỏ hàng.', status: HTTP_STATUS.NOT_FOUND })
    }

    // Ưu tiên dùng selectedSubtotal (sản phẩm được tick chọn trên FE)
    // nếu không có thì fallback về cart.subtotal
    const subtotalForValidation = (selectedSubtotal !== undefined && selectedSubtotal >= 0)
      ? selectedSubtotal
      : cart.subtotal

    // Validate coupon
    const validation = await this.validateCoupon(
      code,
      userId,
      subtotalForValidation,
      cart.requiresPrescription
    )

    if (!validation.isValid) {
      throw new ErrorWithStatus({ message: validation.message, status: HTTP_STATUS.BAD_REQUEST })
    }

    const coupon = validation.coupon!
    const appliedCoupons = cart.appliedCoupons || []

    // Kiểm tra rule stacking:
    // - Không cho phép 2 mã cùng loại (2 percentage/fixed_amount = lỗi)
    // - Cho phép 1 discount + 1 freeship
    const existingDiscount = appliedCoupons.find((c: any) => c.type !== 'free_shipping')
    const existingFreeship = appliedCoupons.find((c: any) => c.type === 'free_shipping')

    if (coupon.type === 'free_shipping' && existingFreeship) {
      throw new ErrorWithStatus({
        message: 'Bạn đã áp dụng mã miễn phí vận chuyển. Chỉ được dùng 1 mã mỗi loại.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (coupon.type !== 'free_shipping' && existingDiscount) {
      throw new ErrorWithStatus({
        message: 'Bạn đã áp dụng một mã giảm giá. Chỉ được dùng 1 mã giảm giá và 1 mã miễn phí vận chuyển.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // Kiểm tra code đã được áp dụng chưa
    const alreadyApplied = appliedCoupons.some((c: any) => c.code === coupon.code)
    if (alreadyApplied) {
      throw new ErrorWithStatus({ message: 'Mã giảm giá này đã được áp dụng.', status: HTTP_STATUS.BAD_REQUEST })
    }

    // Thêm coupon vào cart
    const newCoupon = {
      code: coupon.code,
      discountAmount: validation.discountAmount,
      type: coupon.type,
      name: coupon.name
    }

    appliedCoupons.push(newCoupon)

    // Tính lại tổng discount
    const totalCouponDiscount = appliedCoupons
      .filter((c: any) => c.type !== 'free_shipping')
      .reduce((sum: number, c: any) => sum + c.discountAmount, 0)

    const newTotalAmount = Math.max(0, cart.subtotal - totalCouponDiscount - (cart.loyaltyDiscount || 0) + (cart.taxAmount || 0) + (cart.shippingFee || 0))

    await databaseService.carts.updateOne(
      { _id: cart._id },
      {
        $set: {
          appliedCoupons,
          discountAmount: totalCouponDiscount,
          totalAmount: newTotalAmount,
          updatedAt: new Date()
        }
      }
    )

    return {
      appliedCoupons,
      discountAmount: totalCouponDiscount,
      totalAmount: newTotalAmount,
      addedCoupon: newCoupon
    }
  }

  /**
   * Xoá coupon khỏi cart
   */
  async removeCouponFromCart(code: string, userId: ObjectId, sessionId?: string) {
    const cartQuery = userId
      ? { userId }
      : sessionId
        ? { sessionId }
        : null

    if (!cartQuery) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy giỏ hàng.', status: HTTP_STATUS.BAD_REQUEST })
    }

    const cart = await databaseService.carts.findOne(cartQuery as any)
    if (!cart) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy giỏ hàng.', status: HTTP_STATUS.NOT_FOUND })
    }

    const upperCode = code.toUpperCase().trim()
    const appliedCoupons = (cart.appliedCoupons || []).filter((c: any) => c.code !== upperCode)

    const totalCouponDiscount = appliedCoupons
      .filter((c: any) => c.type !== 'free_shipping')
      .reduce((sum: number, c: any) => sum + c.discountAmount, 0)

    const newTotalAmount = Math.max(0, cart.subtotal - totalCouponDiscount - (cart.loyaltyDiscount || 0) + (cart.taxAmount || 0) + (cart.shippingFee || 0))

    await databaseService.carts.updateOne(
      { _id: cart._id },
      {
        $set: {
          appliedCoupons,
          discountAmount: totalCouponDiscount,
          totalAmount: newTotalAmount,
          updatedAt: new Date()
        }
      }
    )

    return { appliedCoupons, discountAmount: totalCouponDiscount, totalAmount: newTotalAmount }
  }

  /**
   * Ghi nhận việc dùng coupon sau khi order được tạo thành công.
   * ATOMIC: dùng findOneAndUpdate để tránh race condition 2 request đồng thời.
   */
  async recordCouponRedemption(
    couponCode: string,
    userId: ObjectId,
    orderId: ObjectId,
    discountAmount: number
  ) {
    const upperCode = couponCode.toUpperCase()

    const existingRedemption = await databaseService.couponRedemptions.findOne({
      couponCode: upperCode,
      userId,
      orderId
    })
    if (existingRedemption) {
      return
    }

    // Atomic: chỉ increment nếu còn lượt dùng (tránh race condition)
    const coupon = await databaseService.coupons.findOneAndUpdate(
      {
        code: upperCode,
        isActive: true,
        $or: [
          { totalUsageLimit: { $exists: false } },
          { totalUsageLimit: { $eq: undefined as any } },
          { $expr: { $lt: ['$currentUsageCount', '$totalUsageLimit'] } }
        ]
      } as any, // cast needed: MongoDB $expr not fully typed in driver
      {
        $inc: { currentUsageCount: 1 },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: 'after' }
    )

    if (!coupon) {
      throw new ErrorWithStatus({
        message: `Mã giảm giá ${upperCode} vừa hết lượt hoặc đã bị vô hiệu hóa. Vui lòng kiểm tra lại đơn hàng.`,
        status: HTTP_STATUS.CONFLICT
      })
    }

    // Kiểm tra per-user limit atomically (dùng unique index nếu có)
    const userUsageCount = await databaseService.couponRedemptions.countDocuments({
      couponId: coupon._id,
      userId
    })
    if (userUsageCount >= coupon.perUserLimit) {
      // Rollback increment
      await databaseService.coupons.updateOne(
        { _id: coupon._id },
        { $inc: { currentUsageCount: -1 } }
      )
      throw new ErrorWithStatus({
        message: `Bạn đã đạt giới hạn sử dụng mã ${upperCode}.`,
        status: HTTP_STATUS.CONFLICT
      })
    }

    // Insert redemption record
    const redemption = new CouponRedemption({
      couponId: coupon._id!,
      couponCode: coupon.code,
      userId,
      orderId,
      discountAmount
    })
    await databaseService.couponRedemptions.insertOne(redemption)
  }

  /**
   * Hoàn tác các lượt dùng coupon của một order khi order bị hủy / thanh toán thất bại.
   * Idempotent: nếu không còn redemption thì không làm gì.
   */
  async releaseCouponRedemptionsForOrder(orderId: ObjectId) {
    const redemptions = await databaseService.couponRedemptions.find({ orderId }).toArray()
    if (!redemptions.length) return { releasedCount: 0 }

    for (const redemption of redemptions) {
      await databaseService.coupons.updateOne(
        { _id: redemption.couponId, currentUsageCount: { $gt: 0 } },
        { $inc: { currentUsageCount: -1 }, $set: { updatedAt: new Date() } }
      )
    }

    const result = await databaseService.couponRedemptions.deleteMany({ orderId })
    await cacheService.invalidate('coupons:*')
    return { releasedCount: result.deletedCount || 0 }
  }

  // ============================
  // ADMIN CRUD
  // ============================

  async createCoupon(data: any, adminId: ObjectId) {
    // Kiểm tra code trùng
    const existing = await databaseService.coupons.findOne({ code: data.code.toUpperCase().trim() })
    if (existing) {
      throw new ErrorWithStatus({ message: 'Mã coupon đã tồn tại. Vui lòng chọn mã khác.', status: HTTP_STATUS.BAD_REQUEST })
    }

    const coupon = new Coupon({
      ...data,
      createdBy: adminId,
      currentUsageCount: 0
    })

    const result = await databaseService.coupons.insertOne(coupon as any)
    await cacheService.invalidate('coupons:*')
    return { ...coupon, _id: result.insertedId }
  }

  async updateCoupon(couponId: ObjectId, data: any) {
    const coupon = await databaseService.coupons.findOne({ _id: couponId })
    if (!coupon) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy mã giảm giá.', status: HTTP_STATUS.NOT_FOUND })
    }

    // Không cho sửa code
    const { code: _code, currentUsageCount: _count, createdBy: _by, createdAt: _at, ...updateData } = data

    await databaseService.coupons.updateOne(
      { _id: couponId },
      { $set: { ...updateData, updatedAt: new Date() } }
    )
    await cacheService.invalidate('coupons:*')

    return databaseService.coupons.findOne({ _id: couponId })
  }

  async deleteCoupon(couponId: ObjectId) {
    const result = await databaseService.coupons.deleteOne({ _id: couponId })
    if (result.deletedCount === 0) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy mã giảm giá.', status: HTTP_STATUS.NOT_FOUND })
    }
    await cacheService.invalidate('coupons:*')
    return { message: 'Đã xóa mã giảm giá.' }
  }

  async getCoupons(page: number = 1, limit: number = 20, filter: any = {}) {
    const skip = (page - 1) * limit
    const query: any = {}

    if (filter.isActive !== undefined) query.isActive = filter.isActive
    if (filter.type) query.type = filter.type
    if (filter.search) {
      query.$or = [
        { code: { $regex: filter.search, $options: 'i' } },
        { name: { $regex: filter.search, $options: 'i' } }
      ]
    }

    const [coupons, total] = await Promise.all([
      databaseService.coupons.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      databaseService.coupons.countDocuments(query)
    ])

    return {
      coupons,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    }
  }

  async getCouponById(couponId: ObjectId) {
    const coupon = await databaseService.coupons.findOne({ _id: couponId })
    if (!coupon) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy mã giảm giá.', status: HTTP_STATUS.NOT_FOUND })
    }
    return coupon
  }

  // Lấy danh sách public coupon cho user xem — ✅ CACHED
  async getPublicCoupons() {
    return cacheService.getOrSet('coupons:public', async () => {
      const now = new Date()
      const all = await databaseService.coupons.find({
        isPublic: true,
        isActive: true
      }).sort({ createdAt: -1 }).toArray()

      return all.filter(c => {
        const start = new Date(c.startDate)
        const end = new Date(c.endDate)
        return now >= start && now <= end
      })
    }, 300) // 5 minutes
  }

  async toggleCoupon(couponId: ObjectId) {
    const coupon = await databaseService.coupons.findOne({ _id: couponId })
    if (!coupon) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy mã giảm giá.', status: HTTP_STATUS.NOT_FOUND })
    }
    await databaseService.coupons.updateOne(
      { _id: couponId },
      { $set: { isActive: !coupon.isActive, updatedAt: new Date() } }
    )
    await cacheService.invalidate('coupons:*')
    return { isActive: !coupon.isActive }
  }
}

const couponService = new CouponService()
export default couponService
