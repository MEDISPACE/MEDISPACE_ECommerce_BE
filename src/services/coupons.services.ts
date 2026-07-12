import { ObjectId } from 'mongodb'
import Coupon, { CouponType } from '~/models/schemas/Coupon.schema'
import CouponRedemption from '~/models/schemas/CouponRedemption.schema'
import databaseService from './database.services'
import cacheService from './cache.services'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'
import notificationService from './notifications.services'
import { getIO } from '~/sockets/chat.socket'

export interface ValidateCouponResult {
  isValid: boolean
  coupon?: any
  discountAmount: number
  eligibleSubtotal?: number
  applicableCategoryIds?: ObjectId[]
  message: string
  discountType: CouponType | null
}

export interface CouponValidationItem {
  productId: ObjectId | string
  categoryId?: ObjectId | string
  totalPrice: number
  prescriptionRequired?: boolean
}

class CouponService {
  // ============================
  // VALIDATION & APPLICATION
  // ============================

  private pushCouponNotification(coupon: any) {
    let io
    try {
      io = getIO()
    } catch {
      io = undefined
    }
    Promise.resolve((notificationService as any).notifyCouponAvailable?.(coupon, io)).catch(() => {})
  }

  private isCouponCurrentlyVisible(coupon: any) {
    if (!coupon?.isActive) return false
    const now = new Date()
    return now >= new Date(coupon.startDate) && now <= new Date(coupon.endDate)
  }

  private toIdSet(ids?: Array<ObjectId | string>) {
    return new Set((ids || []).map((id) => id.toString()))
  }

  private async getApplicableCategoryIdSet(coupon: any) {
    const targetCategoryIds = (coupon.applicableCategoryIds || [])
      .filter((id: ObjectId | string) => id && ObjectId.isValid(id.toString()))
      .map((id: ObjectId | string) => new ObjectId(id.toString()))

    if (targetCategoryIds.length === 0) return new Set<string>()

    const targetCategories = await databaseService.categories
      .find({ _id: { $in: targetCategoryIds } }, { projection: { _id: 1, path: 1 } })
      .toArray()

    const descendantQueries = targetCategories
      .filter((category: any) => category.path)
      .map((category: any) => ({
        path: { $regex: `^${category.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/` }
      }))

    const categories = await databaseService.categories
      .find(
        {
          $or: [{ _id: { $in: targetCategoryIds } }, ...descendantQueries]
        },
        { projection: { _id: 1 } }
      )
      .toArray()

    return new Set(categories.map((category: any) => category._id.toString()))
  }

  private async getEligibleSubtotal(
    coupon: any,
    cartSubtotal: number,
    items?: CouponValidationItem[],
    applicableCategoryIdSet?: Set<string>
  ) {
    const hasProductTarget = coupon.applicableProductIds && coupon.applicableProductIds.length > 0
    const categoryIds = applicableCategoryIdSet || (await this.getApplicableCategoryIdSet(coupon))
    const hasCategoryTarget = categoryIds.size > 0

    if (!hasProductTarget && !hasCategoryTarget) {
      return cartSubtotal
    }

    if (!items || items.length === 0) {
      return 0
    }

    const productIds = this.toIdSet(coupon.applicableProductIds)
    const missingCategoryProductIds = hasCategoryTarget
      ? items
          .filter((item) => !item.categoryId && ObjectId.isValid(item.productId.toString()))
          .map((item) => new ObjectId(item.productId))
      : []

    const productCategoryMap = new Map<string, string>()
    if (missingCategoryProductIds.length > 0) {
      const products = await databaseService.products
        .find({ _id: { $in: missingCategoryProductIds } }, { projection: { _id: 1, categoryId: 1 } })
        .toArray()
      products.forEach((product: any) => {
        if (product.categoryId) productCategoryMap.set(product._id.toString(), product.categoryId.toString())
      })
    }

    return items.reduce((sum, item) => {
      const itemProductId = item.productId.toString()
      const itemCategoryId = item.categoryId?.toString() || productCategoryMap.get(itemProductId)
      const productMatches = hasProductTarget && productIds.has(itemProductId)
      const categoryMatches = hasCategoryTarget && itemCategoryId && categoryIds.has(itemCategoryId)
      return productMatches || categoryMatches ? sum + Math.max(0, item.totalPrice || 0) : sum
    }, 0)
  }

  private normalizeIdArray(ids?: Array<ObjectId | string>) {
    if (!Array.isArray(ids)) return undefined
    return ids.filter((id) => id && ObjectId.isValid(id.toString())).map((id) => new ObjectId(id.toString()))
  }

  private normalizeCouponPayload(data: any) {
    const normalized = { ...data }
    if ('targetUserIds' in normalized) normalized.targetUserIds = this.normalizeIdArray(normalized.targetUserIds)
    if ('applicableProductIds' in normalized)
      normalized.applicableProductIds = this.normalizeIdArray(normalized.applicableProductIds)
    if ('applicableCategoryIds' in normalized)
      normalized.applicableCategoryIds = this.normalizeIdArray(normalized.applicableCategoryIds)
    if (normalized.totalUsageLimit === null || normalized.totalUsageLimit === '') normalized.totalUsageLimit = undefined
    if (normalized.type === 'fixed') normalized.type = 'fixed_amount'
    return normalized
  }

  private async attachTargetUsers(coupons: any[]) {
    const targetUserIds = coupons
      .flatMap((coupon) => coupon.targetUserIds || [])
      .filter((id) => id && ObjectId.isValid(id.toString()))
      .map((id) => new ObjectId(id.toString()))
    const applicableProductIds = coupons
      .flatMap((coupon) => coupon.applicableProductIds || [])
      .filter((id) => id && ObjectId.isValid(id.toString()))
      .map((id) => new ObjectId(id.toString()))

    if (targetUserIds.length === 0 && applicableProductIds.length === 0) return coupons

    const uniqueUserIds = Array.from(new Map(targetUserIds.map((id) => [id.toString(), id])).values())
    const uniqueProductIds = Array.from(new Map(applicableProductIds.map((id) => [id.toString(), id])).values())
    const [users, products] = await Promise.all([
      uniqueUserIds.length > 0
        ? databaseService.users
            .find(
              { _id: { $in: uniqueUserIds } },
              { projection: { _id: 1, firstName: 1, lastName: 1, email: 1, phoneNumber: 1 } }
            )
            .toArray()
        : [],
      uniqueProductIds.length > 0
        ? databaseService.products
            .find({ _id: { $in: uniqueProductIds } }, { projection: { _id: 1, name: 1, sku: 1 } })
            .toArray()
        : []
    ])
    const userMap = new Map(users.map((user: any) => [user._id.toString(), user]))
    const productMap = new Map(products.map((product: any) => [product._id.toString(), product]))

    return coupons.map((coupon) => ({
      ...coupon,
      targetUsers: (coupon.targetUserIds || []).map(
        (id: ObjectId | string) => userMap.get(id.toString()) || { _id: id.toString(), missing: true }
      ),
      applicableProducts: (coupon.applicableProductIds || []).map(
        (id: ObjectId | string) => productMap.get(id.toString()) || { _id: id.toString(), missing: true }
      )
    }))
  }

  private assertFiniteNumber(value: any, field: string) {
    const numberValue = Number(value)
    if (!Number.isFinite(numberValue)) {
      throw new ErrorWithStatus({ message: `${field} không hợp lệ.`, status: HTTP_STATUS.BAD_REQUEST })
    }
    return numberValue
  }

  private validateCouponPayload(data: any, existingCoupon?: any) {
    const merged = { ...(existingCoupon || {}), ...data }

    if (!merged.code || typeof merged.code !== 'string' || merged.code.trim().length === 0) {
      throw new ErrorWithStatus({ message: 'Vui lòng nhập mã coupon.', status: HTTP_STATUS.BAD_REQUEST })
    }
    if (!merged.name || typeof merged.name !== 'string' || merged.name.trim().length === 0) {
      throw new ErrorWithStatus({ message: 'Vui lòng nhập tên coupon.', status: HTTP_STATUS.BAD_REQUEST })
    }

    const allowedTypes: CouponType[] = ['percentage', 'fixed_amount', 'fixed', 'free_shipping']
    if (!allowedTypes.includes(merged.type)) {
      throw new ErrorWithStatus({ message: 'Loại coupon không hợp lệ.', status: HTTP_STATUS.BAD_REQUEST })
    }

    const type = merged.type === 'fixed' ? 'fixed_amount' : merged.type
    const value = type === 'free_shipping' ? 0 : this.assertFiniteNumber(merged.value, 'Giá trị giảm')
    if (type !== 'free_shipping' && value <= 0) {
      throw new ErrorWithStatus({ message: 'Giá trị giảm phải lớn hơn 0.', status: HTTP_STATUS.BAD_REQUEST })
    }
    if (type === 'percentage' && value > 100) {
      throw new ErrorWithStatus({
        message: 'Coupon phần trăm phải có giá trị từ 1 đến 100.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (merged.minOrderAmount !== undefined && merged.minOrderAmount !== null) {
      const minOrderAmount = this.assertFiniteNumber(merged.minOrderAmount, 'Đơn hàng tối thiểu')
      if (minOrderAmount < 0) {
        throw new ErrorWithStatus({ message: 'Đơn hàng tối thiểu không được âm.', status: HTTP_STATUS.BAD_REQUEST })
      }
    }

    if (
      merged.maxDiscountAmount !== undefined &&
      merged.maxDiscountAmount !== null &&
      merged.maxDiscountAmount !== ''
    ) {
      const maxDiscountAmount = this.assertFiniteNumber(merged.maxDiscountAmount, 'Giảm tối đa')
      if (maxDiscountAmount < 0) {
        throw new ErrorWithStatus({ message: 'Giảm tối đa không được âm.', status: HTTP_STATUS.BAD_REQUEST })
      }
      if (type !== 'percentage' && data.maxDiscountAmount !== undefined) {
        throw new ErrorWithStatus({
          message: 'Giảm tối đa chỉ áp dụng cho coupon phần trăm.',
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
    }

    if (merged.totalUsageLimit !== undefined && merged.totalUsageLimit !== null) {
      const totalUsageLimit = this.assertFiniteNumber(merged.totalUsageLimit, 'Tổng lượt dùng')
      if (!Number.isInteger(totalUsageLimit) || totalUsageLimit < 1) {
        throw new ErrorWithStatus({
          message: 'Tổng lượt dùng phải là số nguyên lớn hơn 0.',
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
    }

    const perUserLimit = this.assertFiniteNumber(merged.perUserLimit ?? 1, 'Lượt dùng mỗi khách')
    if (!Number.isInteger(perUserLimit) || perUserLimit < 1) {
      throw new ErrorWithStatus({
        message: 'Lượt dùng mỗi khách phải là số nguyên lớn hơn 0.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const startDate = new Date(merged.startDate)
    const endDate = new Date(merged.endDate)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new ErrorWithStatus({ message: 'Thời gian hiệu lực coupon không hợp lệ.', status: HTTP_STATUS.BAD_REQUEST })
    }
    if (startDate >= endDate) {
      throw new ErrorWithStatus({ message: 'Ngày kết thúc phải sau ngày bắt đầu.', status: HTTP_STATUS.BAD_REQUEST })
    }
  }

  private getSelectedCartItems(cartItems: any[], selectedItems?: Array<{ productId: string; unit?: string }>) {
    if (!selectedItems || selectedItems.length === 0) return cartItems

    return cartItems.filter((cartItem: any) =>
      selectedItems.some((selectedItem) => {
        if (selectedItem.productId !== cartItem.productId.toString()) return false
        return (selectedItem.unit || undefined) === (cartItem.unit || undefined)
      })
    )
  }

  /**
   * Validate coupon code & tính toán discount
   * Không thay đổi DB — chỉ preview
   */
  async validateCoupon(
    code: string,
    userId: ObjectId,
    cartSubtotal: number,
    hasPrescriptionItems: boolean = false,
    items?: CouponValidationItem[]
  ): Promise<ValidateCouponResult> {
    const now = new Date()
    const normalizedCode = typeof code === 'string' ? code.toUpperCase().trim() : ''

    if (!normalizedCode) {
      return {
        isValid: false,
        discountAmount: 0,
        message: 'Mã giảm giá không tồn tại hoặc đã bị vô hiệu hóa.',
        discountType: null
      }
    }

    // 1. Tìm coupon — chỉ filter isActive ở DB, date validation xử lý ở code
    // (tránh BSON type mismatch khi endDate lưu dạng string thay vì Date)
    const coupon = await databaseService.coupons.findOne({
      code: normalizedCode,
      isActive: true
    })

    if (!coupon) {
      return {
        isValid: false,
        discountAmount: 0,
        message: 'Mã giảm giá không tồn tại hoặc đã bị vô hiệu hóa.',
        discountType: null
      }
    }

    // 2. Kiểm tra thời gian hiệu lực — cast sang Date để xử lý cả string lẫn Date từ DB
    const startDate = new Date(coupon.startDate)
    const endDate = new Date(coupon.endDate)
    if (now < startDate || now > endDate) {
      return {
        isValid: false,
        discountAmount: 0,
        message: 'Mã giảm giá đã hết hạn hoặc chưa đến thời gian áp dụng.',
        discountType: null
      }
    }

    const applicableCategoryIdSet = await this.getApplicableCategoryIdSet(coupon)
    const applicableCategoryIds = Array.from(applicableCategoryIdSet)
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id))
    const eligibleSubtotal = await this.getEligibleSubtotal(coupon, cartSubtotal, items, applicableCategoryIdSet)

    if (eligibleSubtotal <= 0) {
      return {
        isValid: false,
        discountAmount: 0,
        eligibleSubtotal,
        applicableCategoryIds,
        message: 'Mã giảm giá không áp dụng cho sản phẩm đã chọn.',
        discountType: null
      }
    }

    // 3. Kiểm tra giá trị đơn hàng tối thiểu trên phần sản phẩm eligible
    if (eligibleSubtotal < coupon.minOrderAmount) {
      const formatted = coupon.minOrderAmount.toLocaleString('vi-VN')
      return {
        isValid: false,
        discountAmount: 0,
        eligibleSubtotal,
        applicableCategoryIds,
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

    // 5. Kiểm tra giới hạn số lần mỗi user.
    // userUsageCounts là source of truth sau migration/backfill; couponRedemptions chỉ là audit trail.
    const userUsageCount = coupon.userUsageCounts?.[userId.toString()] || 0
    if (userUsageCount >= coupon.perUserLimit) {
      return {
        isValid: false,
        discountAmount: 0,
        message: `Bạn đã sử dụng mã này ${coupon.perUserLimit} lần (đã đạt giới hạn).`,
        discountType: null
      }
    }

    // 6. Kiểm tra đối tượng mục tiêu
    if (coupon.targetUserIds && coupon.targetUserIds.length > 0) {
      const isTargeted = coupon.targetUserIds.some((id: ObjectId) => id.toString() === userId.toString())
      if (!isTargeted) {
        return {
          isValid: false,
          discountAmount: 0,
          message: 'Mã giảm giá này không áp dụng cho tài khoản của bạn.',
          discountType: null
        }
      }
    }

    // 7. Kiểm tra thuốc kê đơn
    if (coupon.excludePrescriptionItems && hasPrescriptionItems) {
      return {
        isValid: false,
        discountAmount: 0,
        message: 'Mã giảm giá không áp dụng cho đơn hàng có thuốc kê đơn.',
        discountType: null
      }
    }

    // 8. Tính discount amount
    let discountAmount = 0

    if (coupon.type === 'percentage') {
      discountAmount = Math.floor(eligibleSubtotal * (coupon.value / 100))
      // Giới hạn tối đa nếu có maxDiscountAmount
      if (coupon.maxDiscountAmount) {
        discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount)
      }
      // Không được giảm quá subtotal
      discountAmount = Math.min(discountAmount, eligibleSubtotal)
    } else if (coupon.type === 'fixed_amount' || coupon.type === 'fixed') {
      discountAmount = Math.min(coupon.value, eligibleSubtotal) // Không giảm quá eligible subtotal
    } else if (coupon.type === 'free_shipping') {
      // discountAmount = 0 — shipping discount xử lý riêng bên order
      discountAmount = 0
    }

    return {
      isValid: true,
      coupon,
      discountAmount,
      eligibleSubtotal,
      applicableCategoryIds,
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
    selectedSubtotal?: number, // Deprecated: BE recomputes subtotal from cart items.
    selectedItems?: Array<{ productId: string; unit?: string }>
  ) {
    // Lấy cart
    const cartQuery = userId ? { userId } : sessionId ? { sessionId } : null

    if (!cartQuery) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy giỏ hàng.', status: HTTP_STATUS.BAD_REQUEST })
    }

    const cart = await databaseService.carts.findOne(cartQuery as any)
    if (!cart) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy giỏ hàng.', status: HTTP_STATUS.NOT_FOUND })
    }

    // Ưu tiên dùng selectedSubtotal (sản phẩm được tick chọn trên FE)
    // nếu không có thì fallback về cart.subtotal
    const validationItems = this.getSelectedCartItems(cart.items, selectedItems)
    if (selectedItems && selectedItems.length > 0 && validationItems.length === 0) {
      throw new ErrorWithStatus({
        message: 'Không tìm thấy sản phẩm đã chọn trong giỏ hàng.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }
    const subtotalForValidation = validationItems.reduce(
      (sum: number, item: any) => sum + Math.max(0, item.totalPrice || 0),
      0
    )
    const hasPrescriptionItemsInSelection = validationItems.some((item: any) => item.prescriptionRequired)

    // Validate coupon
    const validation = await this.validateCoupon(
      code,
      userId,
      subtotalForValidation,
      hasPrescriptionItemsInSelection,
      validationItems
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
      eligibleSubtotal: validation.eligibleSubtotal,
      type: coupon.type,
      name: coupon.name,
      applicableProductIds: coupon.applicableProductIds || [],
      applicableCategoryIds: validation.applicableCategoryIds || coupon.applicableCategoryIds || []
    }

    appliedCoupons.push(newCoupon)

    // Tính lại tổng discount
    const totalCouponDiscount = appliedCoupons
      .filter((c: any) => c.type !== 'free_shipping')
      .reduce((sum: number, c: any) => sum + c.discountAmount, 0)

    const newTotalAmount = Math.max(
      0,
      cart.subtotal -
        totalCouponDiscount -
        (cart.loyaltyDiscount || 0) +
        (cart.taxAmount || 0) +
        (cart.shippingFee || 0)
    )

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
    const cartQuery = userId ? { userId } : sessionId ? { sessionId } : null

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

    const newTotalAmount = Math.max(
      0,
      cart.subtotal -
        totalCouponDiscount -
        (cart.loyaltyDiscount || 0) +
        (cart.taxAmount || 0) +
        (cart.shippingFee || 0)
    )

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

  async revalidateCartCoupons(userId: ObjectId, sessionId?: string) {
    const cartQuery = userId ? { userId } : sessionId ? { sessionId } : null

    if (!cartQuery) return { appliedCoupons: [], discountAmount: 0, totalAmount: 0 }

    const cart = await databaseService.carts.findOne(cartQuery as any)
    if (!cart) return { appliedCoupons: [], discountAmount: 0, totalAmount: 0 }

    const items = cart.items || []
    const subtotal = items.reduce((sum: number, item: any) => sum + Math.max(0, item.totalPrice || 0), 0)
    const hasPrescriptionItems = items.some((item: any) => item.prescriptionRequired)
    const appliedCoupons = []

    for (const cartCoupon of cart.appliedCoupons || []) {
      const validation = await this.validateCoupon(cartCoupon.code, userId, subtotal, hasPrescriptionItems, items)
      if (!validation.isValid || !validation.coupon) continue

      appliedCoupons.push({
        code: validation.coupon.code,
        discountAmount: validation.discountAmount,
        eligibleSubtotal: validation.eligibleSubtotal,
        type: validation.coupon.type,
        name: cartCoupon.name || validation.coupon.name || validation.coupon.code,
        applicableProductIds: validation.coupon.applicableProductIds || [],
        applicableCategoryIds: validation.applicableCategoryIds || validation.coupon.applicableCategoryIds || []
      })
    }

    const totalCouponDiscount = appliedCoupons
      .filter((c: any) => c.type !== 'free_shipping')
      .reduce((sum: number, c: any) => sum + (c.discountAmount || 0), 0)

    const newTotalAmount = Math.max(
      0,
      subtotal - totalCouponDiscount - (cart.loyaltyDiscount || 0) + (cart.taxAmount || 0) + (cart.shippingFee || 0)
    )

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
  async recordCouponRedemption(couponCode: string, userId: ObjectId, orderId: ObjectId, discountAmount: number) {
    const upperCode = couponCode.toUpperCase()
    const userUsagePath = `userUsageCounts.${userId.toString()}`

    const existingRedemption = await databaseService.couponRedemptions.findOne({
      couponCode: upperCode,
      userId,
      orderId
    })
    if (existingRedemption) {
      return
    }

    // Atomic: chỉ increment nếu còn tổng lượt và còn lượt theo user.
    // userUsageCounts.<userId> là counter denormalized để tránh race condition giữa countDocuments và insert.
    const coupon = await databaseService.coupons.findOneAndUpdate(
      {
        code: upperCode,
        isActive: true,
        $and: [
          {
            $or: [
              { totalUsageLimit: { $exists: false } },
              { totalUsageLimit: { $eq: undefined as any } },
              { $expr: { $lt: ['$currentUsageCount', '$totalUsageLimit'] } }
            ]
          },
          {
            $expr: {
              $lt: [{ $ifNull: [`$${userUsagePath}`, 0] }, '$perUserLimit']
            }
          }
        ]
      } as any, // cast needed: MongoDB $expr not fully typed in driver
      {
        $inc: { currentUsageCount: 1, [userUsagePath]: 1 },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: 'after' }
    )

    if (!coupon) {
      throw new ErrorWithStatus({
        message: `Mã giảm giá ${upperCode} vừa hết lượt, đã đạt giới hạn tài khoản hoặc đã bị vô hiệu hóa. Vui lòng kiểm tra lại đơn hàng.`,
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
    try {
      await databaseService.couponRedemptions.insertOne(redemption)
    } catch (error: any) {
      await databaseService.coupons.updateOne({ _id: coupon._id }, [
        {
          $set: {
            currentUsageCount: { $max: [0, { $subtract: ['$currentUsageCount', 1] }] },
            [userUsagePath]: { $max: [0, { $subtract: [{ $ifNull: [`$${userUsagePath}`, 0] }, 1] }] },
            updatedAt: new Date()
          }
        }
      ] as any)

      if (error?.code === 11000) return
      throw error
    }
  }

  /**
   * Hoàn tác các lượt dùng coupon của một order khi order bị hủy / thanh toán thất bại.
   * Idempotent: nếu không còn redemption thì không làm gì.
   */
  async releaseCouponRedemptionsForOrder(orderId: ObjectId) {
    const redemptions = await databaseService.couponRedemptions.find({ orderId }).toArray()
    if (!redemptions.length) return { releasedCount: 0 }

    for (const redemption of redemptions) {
      const userUsagePath = `userUsageCounts.${redemption.userId.toString()}`
      await databaseService.coupons.updateOne({ _id: redemption.couponId }, [
        {
          $set: {
            currentUsageCount: { $max: [0, { $subtract: ['$currentUsageCount', 1] }] },
            [userUsagePath]: { $max: [0, { $subtract: [{ $ifNull: [`$${userUsagePath}`, 0] }, 1] }] },
            updatedAt: new Date()
          }
        }
      ] as any)
    }

    const result = await databaseService.couponRedemptions.deleteMany({ orderId })
    await cacheService.invalidate('coupons:*')
    return { releasedCount: result.deletedCount || 0 }
  }

  // ============================
  // ADMIN CRUD
  // ============================

  async createCoupon(data: any, adminId: ObjectId) {
    const normalizedData = this.normalizeCouponPayload(data)
    this.validateCouponPayload(normalizedData)
    // Kiểm tra code trùng
    const existing = await databaseService.coupons.findOne({ code: normalizedData.code.toUpperCase().trim() })
    if (existing) {
      throw new ErrorWithStatus({
        message: 'Mã coupon đã tồn tại. Vui lòng chọn mã khác.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const coupon = new Coupon({
      ...normalizedData,
      createdBy: adminId,
      currentUsageCount: 0
    })

    const result = await databaseService.coupons.insertOne(coupon as any)
    await cacheService.invalidate('coupons:*')
    const createdCoupon = { ...coupon, _id: result.insertedId }
    this.pushCouponNotification(createdCoupon)
    return createdCoupon
  }

  async updateCoupon(couponId: ObjectId, data: any) {
    const coupon = await databaseService.coupons.findOne({ _id: couponId })
    if (!coupon) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy mã giảm giá.', status: HTTP_STATUS.NOT_FOUND })
    }

    // Không cho sửa các trường counter/audit do hệ thống quản lý
    const normalizedData = this.normalizeCouponPayload(data)
    const {
      code: _code,
      currentUsageCount: _count,
      userUsageCounts: _usage,
      createdBy: _by,
      createdAt: _at,
      ...updateData
    } = normalizedData

    this.validateCouponPayload(updateData, coupon)

    if (
      updateData.totalUsageLimit !== undefined &&
      updateData.totalUsageLimit !== null &&
      Number(updateData.totalUsageLimit) < (coupon.currentUsageCount || 0)
    ) {
      throw new ErrorWithStatus({
        message: `Tổng lượt dùng không thể nhỏ hơn số lượt đã dùng (${coupon.currentUsageCount || 0}).`,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const wasVisible = this.isCouponCurrentlyVisible(coupon)
    await databaseService.coupons.updateOne({ _id: couponId }, { $set: { ...updateData, updatedAt: new Date() } })
    await cacheService.invalidate('coupons:*')

    const updatedCoupon = await databaseService.coupons.findOne({ _id: couponId })
    if (updatedCoupon && this.isCouponCurrentlyVisible(updatedCoupon) && !wasVisible) {
      this.pushCouponNotification(updatedCoupon)
    }
    return updatedCoupon
  }

  async deleteCoupon(couponId: ObjectId) {
    const coupon = await databaseService.coupons.findOne({ _id: couponId })
    if (!coupon) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy mã giảm giá.', status: HTTP_STATUS.NOT_FOUND })
    }

    if ((coupon.currentUsageCount || 0) > 0) {
      throw new ErrorWithStatus({
        message: 'Coupon đã có lượt sử dụng. Vui lòng tắt coupon thay vì xóa để giữ lịch sử đối soát.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

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
      coupons: await this.attachTargetUsers(coupons),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    }
  }

  async getCouponById(couponId: ObjectId) {
    const coupon = await databaseService.coupons.findOne({ _id: couponId })
    if (!coupon) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy mã giảm giá.', status: HTTP_STATUS.NOT_FOUND })
    }
    return (await this.attachTargetUsers([coupon]))[0]
  }

  // Lấy danh sách public coupon cho user xem — ✅ CACHED
  async getPublicCoupons() {
    return cacheService.getOrSet(
      'coupons:public',
      async () => {
        const now = new Date()
        const all = await databaseService.coupons
          .find({
            isPublic: true,
            isActive: true
          })
          .sort({ createdAt: -1 })
          .toArray()

        return all.filter((c) => {
          const start = new Date(c.startDate)
          const end = new Date(c.endDate)
          return now >= start && now <= end
        })
      },
      300
    ) // 5 minutes
  }

  async getAvailableCouponsForUser(userId: ObjectId) {
    const now = new Date()
    const coupons = await databaseService.coupons
      .find({
        isActive: true,
        $or: [{ isPublic: true }, { targetUserIds: userId }, { targetUserIds: userId.toString() }]
      })
      .sort({ createdAt: -1 })
      .toArray()

    return coupons.filter((coupon) => {
      const start = new Date(coupon.startDate)
      const end = new Date(coupon.endDate)
      return now >= start && now <= end
    })
  }

  async getMyCoupons(userId: ObjectId) {
    const now = new Date()
    const coupons = await databaseService.coupons
      .find({
        isActive: true,
        $or: [{ isPublic: true }, { targetUserIds: userId }, { targetUserIds: userId.toString() }]
      })
      .sort({ createdAt: -1 })
      .toArray()

    return coupons.map((coupon: any) => {
      const start = new Date(coupon.startDate)
      const end = new Date(coupon.endDate)
      const usedCount = coupon.userUsageCounts?.[userId.toString()] || 0
      const perUserLimit = coupon.perUserLimit || 1
      const isUsedUp = usedCount >= perUserLimit
      const isNotStarted = now < start
      const isExpired = now > end
      const isTargeted = (coupon.targetUserIds || []).some(
        (id: ObjectId | string) => id.toString() === userId.toString()
      )

      let status: 'usable' | 'needs_min_order' | 'used_up' | 'expired' | 'not_started' = 'usable'
      if (isExpired) status = 'expired'
      else if (isNotStarted) status = 'not_started'
      else if (isUsedUp) status = 'used_up'
      else if ((coupon.minOrderAmount || 0) > 0) status = 'needs_min_order'

      return {
        ...coupon,
        userCouponStatus: status,
        userUsageCount: usedCount,
        userUsageLimit: perUserLimit,
        isTargeted
      }
    })
  }

  async toggleCoupon(couponId: ObjectId) {
    const coupon = await databaseService.coupons.findOne({ _id: couponId })
    if (!coupon) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy mã giảm giá.', status: HTTP_STATUS.NOT_FOUND })
    }
    const nextIsActive = !coupon.isActive
    await databaseService.coupons.updateOne(
      { _id: couponId },
      { $set: { isActive: nextIsActive, updatedAt: new Date() } }
    )
    await cacheService.invalidate('coupons:*')
    if (nextIsActive) {
      this.pushCouponNotification({ ...coupon, isActive: nextIsActive, updatedAt: new Date() })
    }
    return { isActive: nextIsActive }
  }
}

const couponService = new CouponService()
export default couponService
