import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const makeId = () => new ObjectId().toString()
const USER_ID = makeId()
const ADMIN_ID = makeId()

// ─── Mock databaseService ─────────────────────────────────────────────────────
const mockFindOne = vi.fn()
const mockInsertOne = vi.fn()
const mockUpdateOne = vi.fn()
const mockFindOneAndUpdate = vi.fn()
const mockDeleteOne = vi.fn()
const mockFind = vi.fn()
const mockProductsFind = vi.fn()
const mockCategoriesFind = vi.fn()
const mockCountDocuments = vi.fn()

const makeCollection = (overrides = {}) => ({
  findOne: mockFindOne,
  insertOne: mockInsertOne,
  updateOne: mockUpdateOne,
  findOneAndUpdate: mockFindOneAndUpdate,
  deleteOne: mockDeleteOne,
  find: mockFind,
  countDocuments: mockCountDocuments,
  ...overrides
})

vi.mock('~/services/database.services', () => {
  const coupons = makeCollection()
  const couponRedemptions = makeCollection()
  const carts = makeCollection()
  const products = makeCollection({ find: mockProductsFind })
  const categories = makeCollection({ find: mockCategoriesFind })

  return {
    default: {
      coupons,
      couponRedemptions,
      carts,
      products,
      categories
    }
  }
})

vi.mock('~/services/cache.services', () => ({
  default: {
    getOrSet: vi.fn((_key: string, fn: () => unknown) => fn()),
    invalidate: vi.fn(),
    invalidatePattern: vi.fn(),
    del: vi.fn()
  }
}))

// Lazy import sau mock
const { default: couponService } = await import('~/services/coupons.services')

// ─── Factories ────────────────────────────────────────────────────────────────
const makeCoupon = (overrides = {}) => ({
  _id: new ObjectId(),
  code: 'SAVE10',
  name: 'Giảm 10%',
  type: 'percentage',
  value: 10,
  maxDiscountAmount: 50000,
  minOrderAmount: 100000,
  excludePrescriptionItems: false,
  totalUsageLimit: 100,
  currentUsageCount: 0,
  perUserLimit: 1,
  isPublic: true,
  isActive: true,
  startDate: new Date(Date.now() - 86400000), // Hôm qua
  endDate: new Date(Date.now() + 86400000),   // Ngày mai
  ...overrides
})

describe('CouponService', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('validateCoupon()', () => {
    it('Lỗi nếu không nhập mã', async () => {
      mockFindOne.mockResolvedValueOnce(null)
      await expect(couponService.validateCoupon('', new ObjectId(USER_ID), 200000, false)).resolves.toEqual(
        expect.objectContaining({ isValid: false, message: 'Mã giảm giá không tồn tại hoặc đã bị vô hiệu hóa.' })
      )
    })

    it('Lỗi nếu mã không tồn tại hoặc không public', async () => {
      mockFindOne.mockResolvedValueOnce(null)
      const result = await couponService.validateCoupon('FAKE', new ObjectId(USER_ID), 200000, false)
      expect(result.isValid).toBe(false)
      expect(result.message).toBe('Mã giảm giá không tồn tại hoặc đã bị vô hiệu hóa.')
    })

    it('Lỗi nếu mã chưa bắt đầu', async () => {
      const coupon = makeCoupon({ startDate: new Date(Date.now() + 86400000) })
      mockFindOne.mockResolvedValueOnce(coupon)
      const result = await couponService.validateCoupon(coupon.code, new ObjectId(USER_ID), 200000, false)
      expect(result.isValid).toBe(false)
      expect(result.message).toBe('Mã giảm giá đã hết hạn hoặc chưa đến thời gian áp dụng.')
    })

    it('Lỗi nếu mã đã hết hạn', async () => {
      const coupon = makeCoupon({ 
         startDate: new Date(Date.now() - 86400000 * 5),
         endDate: new Date(Date.now() - 86400000 * 2) 
      })
      mockFindOne.mockResolvedValueOnce(coupon)
      const result = await couponService.validateCoupon(coupon.code, new ObjectId(USER_ID), 200000, false)
      expect(result.isValid).toBe(false)
      expect(result.message).toMatch(/Mã giảm giá đã hết hạn/)
    })

    it('Lỗi nếu quá giới hạn lượt sử dụng tổng', async () => {
      const coupon = makeCoupon({ totalUsageLimit: 10, currentUsageCount: 10 })
      mockFindOne.mockResolvedValueOnce(coupon)
      const result = await couponService.validateCoupon(coupon.code, new ObjectId(USER_ID), 200000, false)
      expect(result.isValid).toBe(false)
      expect(result.message).toBe('Mã giảm giá đã hết lượt sử dụng.')
    })

    it('Lỗi nếu đơn hàng không đạt giá trị tối thiểu', async () => {
      const coupon = makeCoupon({ minOrderAmount: 500000 })
      mockFindOne.mockResolvedValueOnce(coupon)
      const result = await couponService.validateCoupon(coupon.code, new ObjectId(USER_ID), 200000, false)
      expect(result.isValid).toBe(false)
      expect(result.message).toBe('Đơn hàng tối thiểu 500.000đ để áp dụng mã này.')
    })

    it('Lỗi nếu chứa thuốc kê đơn mà mã loại trừ', async () => {
      const coupon = makeCoupon({ excludePrescriptionItems: true })
      mockFindOne.mockResolvedValueOnce(coupon)
      const result = await couponService.validateCoupon(coupon.code, new ObjectId(USER_ID), 200000, true)
      expect(result.isValid).toBe(false)
      expect(result.message).toBe('Mã giảm giá không áp dụng cho đơn hàng có thuốc kê đơn.')
    })

    it('Tính chính xác mức % giảm (có limit maxDiscountAmount)', async () => {
      const coupon = makeCoupon({ type: 'percentage', value: 10, maxDiscountAmount: 30000 })
      mockFindOne.mockResolvedValueOnce(coupon)
      const result = await couponService.validateCoupon(coupon.code, new ObjectId(USER_ID), 500000, false)
      expect(result.isValid).toBe(true)
      // 10% của 500k là 50k -> bị cap ở 30k
      expect(result.discountAmount).toBe(30000)
      expect(mockCountDocuments).not.toHaveBeenCalled()
    })

    it('Tính chính xác cho fixed_amount', async () => {
      const coupon = makeCoupon({ type: 'fixed_amount', value: 25000 })
      mockFindOne.mockResolvedValueOnce(coupon)
      const result = await couponService.validateCoupon(coupon.code, new ObjectId(USER_ID), 500000, false)
      expect(result.isValid).toBe(true)
      expect(result.discountAmount).toBe(25000)
    })

    it('Cho phép free_shipping (discountAmount = 0)', async () => {
      const coupon = makeCoupon({ type: 'free_shipping', value: 0 })
      mockFindOne.mockResolvedValueOnce(coupon)
      const result = await couponService.validateCoupon(coupon.code, new ObjectId(USER_ID), 200000, false)
      expect(result.isValid).toBe(true)
      expect(result.discountAmount).toBe(0)
      expect(result.discountType).toBe('free_shipping')
    })

    it('Dùng userUsageCounts làm source of truth cho perUserLimit', async () => {
      const coupon = makeCoupon({
        perUserLimit: 1,
        userUsageCounts: { [USER_ID]: 1 }
      })
      mockFindOne.mockResolvedValueOnce(coupon)

      const result = await couponService.validateCoupon(coupon.code, new ObjectId(USER_ID), 500000, false)

      expect(result.isValid).toBe(false)
      expect(result.message).toContain('đã đạt giới hạn')
      expect(mockCountDocuments).not.toHaveBeenCalled()
    })

    it('Không từ chối coupon vì orphaned redemption nếu userUsageCounts đã rollback', async () => {
      const coupon = makeCoupon({
        perUserLimit: 1,
        userUsageCounts: { [USER_ID]: 0 }
      })
      mockFindOne.mockResolvedValueOnce(coupon)
      mockCountDocuments.mockResolvedValueOnce(99)

      const result = await couponService.validateCoupon(coupon.code, new ObjectId(USER_ID), 500000, false)

      expect(result.isValid).toBe(true)
      expect(mockCountDocuments).not.toHaveBeenCalled()
    })

    it('Chỉ tính discount trên sản phẩm thuộc product target', async () => {
      const eligibleProductId = new ObjectId()
      const otherProductId = new ObjectId()
      const coupon = makeCoupon({
        applicableProductIds: [eligibleProductId],
        minOrderAmount: 100000,
        value: 10,
        maxDiscountAmount: 50000
      })
      mockFindOne.mockResolvedValueOnce(coupon)

      const result = await couponService.validateCoupon(coupon.code, new ObjectId(USER_ID), 300000, false, [
        { productId: eligibleProductId, totalPrice: 120000 },
        { productId: otherProductId, totalPrice: 180000 }
      ])

      expect(result.isValid).toBe(true)
      expect(result.eligibleSubtotal).toBe(120000)
      expect(result.discountAmount).toBe(12000)
    })

    it('Áp dụng category target cho cả danh mục con và snapshot expanded category ids', async () => {
      const parentCategoryId = new ObjectId()
      const childCategoryId = new ObjectId()
      const productId = new ObjectId()
      const coupon = makeCoupon({
        applicableCategoryIds: [parentCategoryId],
        minOrderAmount: 100000,
        value: 10,
        maxDiscountAmount: 50000
      })
      mockFindOne.mockResolvedValueOnce(coupon)
      mockCategoriesFind
        .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValueOnce([{ _id: parentCategoryId, path: '/vitamin' }]) })
        .mockReturnValueOnce({
          toArray: vi.fn().mockResolvedValueOnce([
            { _id: parentCategoryId },
            { _id: childCategoryId }
          ])
        })
      mockProductsFind.mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValueOnce([{ _id: productId, categoryId: childCategoryId }])
      })

      const result = await couponService.validateCoupon(coupon.code, new ObjectId(USER_ID), 200000, false, [
        { productId, totalPrice: 200000 }
      ])

      expect(result.isValid).toBe(true)
      expect(result.eligibleSubtotal).toBe(200000)
      expect(result.discountAmount).toBe(20000)
      expect(result.applicableCategoryIds?.map((id) => id.toString())).toEqual(
        expect.arrayContaining([parentCategoryId.toString(), childCategoryId.toString()])
      )
    })
  })

  describe('applyCouponToCart()', () => {
    it('Chỉ xét thuốc kê đơn trong các item được chọn khi apply coupon vào cart', async () => {
      const userId = new ObjectId(USER_ID)
      const prescriptionProductId = new ObjectId()
      const nonPrescriptionProductId = new ObjectId()
      const cart = {
        _id: new ObjectId(),
        userId,
        subtotal: 250000,
        requiresPrescription: true,
        appliedCoupons: [],
        loyaltyDiscount: 0,
        taxAmount: 0,
        shippingFee: 30000,
        items: [
          {
            productId: prescriptionProductId,
            unit: 'box',
            totalPrice: 150000,
            prescriptionRequired: true
          },
          {
            productId: nonPrescriptionProductId,
            unit: 'box',
            totalPrice: 100000,
            prescriptionRequired: false
          }
        ]
      }
      const coupon = makeCoupon({
        excludePrescriptionItems: true,
        minOrderAmount: 100000,
        value: 10
      })
      mockFindOne
        .mockResolvedValueOnce(cart)
        .mockResolvedValueOnce(coupon)
      mockUpdateOne.mockResolvedValueOnce({ modifiedCount: 1 })

      const result = await couponService.applyCouponToCart(
        coupon.code,
        userId,
        undefined,
        100000,
        [{ productId: nonPrescriptionProductId.toString(), unit: 'box' }]
      )

      expect(result.addedCoupon.discountAmount).toBe(10000)
      expect(mockUpdateOne).toHaveBeenCalledWith(
        { _id: cart._id },
        expect.objectContaining({
          $set: expect.objectContaining({
            discountAmount: 10000
          })
        })
      )
    })
  })

  describe('recordCouponRedemption()', () => {
    it('Tạo redemption record và tăng currentUsageCount', async () => {
      const coupon = makeCoupon()
      mockFindOneAndUpdate.mockResolvedValueOnce(coupon)
      mockInsertOne.mockResolvedValueOnce({ insertedId: new ObjectId() })

      await couponService.recordCouponRedemption(
        coupon.code,
        new ObjectId(USER_ID),
        new ObjectId(),
        25000
      )

      expect(mockInsertOne).toHaveBeenCalledTimes(1)
      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ code: coupon.code }),
        expect.objectContaining({
          $inc: expect.objectContaining({ currentUsageCount: 1 })
        }),
        { returnDocument: 'after' }
      )
    })

    it('Không tăng usage nếu redemption của order đã tồn tại', async () => {
      const coupon = makeCoupon()
      mockFindOne.mockResolvedValueOnce({ couponCode: coupon.code })

      await couponService.recordCouponRedemption(
        coupon.code,
        new ObjectId(USER_ID),
        new ObjectId(),
        25000
      )

      expect(mockFindOneAndUpdate).not.toHaveBeenCalled()
      expect(mockInsertOne).not.toHaveBeenCalled()
    })

    it('Throw nếu coupon vừa hết lượt khi reserve', async () => {
      const coupon = makeCoupon()
      mockFindOne.mockResolvedValueOnce(null)
      mockFindOneAndUpdate.mockResolvedValueOnce(null)

      await expect(couponService.recordCouponRedemption(
        coupon.code,
        new ObjectId(USER_ID),
        new ObjectId(),
        25000
      )).rejects.toThrow('vừa hết lượt')
    })

    it('Rollback usage counter nếu insert redemption bị duplicate do retry', async () => {
      const coupon = makeCoupon()
      mockFindOne.mockResolvedValueOnce(null)
      mockFindOneAndUpdate.mockResolvedValueOnce(coupon)
      mockInsertOne.mockRejectedValueOnce({ code: 11000 })

      await couponService.recordCouponRedemption(
        coupon.code,
        new ObjectId(USER_ID),
        new ObjectId(),
        25000
      )

      expect(mockUpdateOne).toHaveBeenCalledWith(
        { _id: coupon._id },
        expect.any(Array)
      )
    })
  })

  describe('releaseCouponRedemptionsForOrder()', () => {
    it('Hoàn lượt dùng và xóa redemption của order', async () => {
      const coupon = makeCoupon()
      const orderId = new ObjectId()
      const toArray = vi.fn().mockResolvedValueOnce([
        {
          _id: new ObjectId(),
          couponId: coupon._id,
          couponCode: coupon.code,
          orderId,
          userId: new ObjectId(USER_ID)
        }
      ])
      const mockDeleteMany = vi.fn().mockResolvedValueOnce({ deletedCount: 1 })
      mockFind.mockReturnValueOnce({ toArray })

      // Patch collection method present only in this test.
      const databaseService = (await import('~/services/database.services')).default as any
      databaseService.couponRedemptions.deleteMany = mockDeleteMany

      const result = await couponService.releaseCouponRedemptionsForOrder(orderId)

      expect(mockUpdateOne).toHaveBeenCalledWith(
        { _id: coupon._id },
        expect.any(Array)
      )
      expect(mockDeleteMany).toHaveBeenCalledWith({ orderId })
      expect(result).toEqual({ releasedCount: 1 })
    })
  })
})
