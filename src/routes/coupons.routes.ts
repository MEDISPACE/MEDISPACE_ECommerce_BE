import { Router } from 'express'
import {
  validateCouponController,
  applyCouponController,
  removeCouponController,
  getPublicCouponsController,
  getAvailableCouponsController,
  getMyCouponsController,
  getAdminCouponsController,
  getAdminCouponByIdController,
  createCouponController,
  updateCouponController,
  deleteCouponController,
  toggleCouponController
} from '~/controllers/coupons.controllers'
import { accessTokenValidator, verifiedUserValidator } from '~/middlewares/users.middlewares'
import { adminRequired } from '~/middlewares/admin.middlewares'
import { optionalAuth } from '~/middlewares/carts.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'
import { couponRateLimit } from '~/middlewares/coupons.middlewares'

const couponsRouter = Router()

// ==================== PUBLIC / USER ====================

/**
 * GET /coupons/public
 * Danh sách mã giảm giá đang chạy (public)
 */
couponsRouter.get('/public', wrapRequestHandler(getPublicCouponsController))

/**
 * GET /coupons/available
 * Danh sách mã public và mã private được gán cho user
 */
couponsRouter.get('/available', accessTokenValidator, wrapRequestHandler(getAvailableCouponsController))

/**
 * GET /coupons/mine
 * Danh sach uu dai public/targeted kem trang thai rieng cua user
 */
couponsRouter.get('/mine', accessTokenValidator, wrapRequestHandler(getMyCouponsController))

/**
 * POST /coupons/validate
 * Preview discount khi user nhập mã (không lưu vào cart)
 * Headers: { Authorization: Bearer <access_token> }
 * Body: { code, cartSubtotal, hasPrescriptionItems? }
 */
couponsRouter.post(
  '/validate',
  accessTokenValidator,
  couponRateLimit,
  wrapRequestHandler(validateCouponController)
)

/**
 * POST /coupons/apply
 * Áp dụng coupon vào cart
 * Headers: { Authorization: Bearer <access_token> }
 * Body: { code }
 */
couponsRouter.post(
  '/apply',
  accessTokenValidator,
  couponRateLimit,
  wrapRequestHandler(applyCouponController)
)

/**
 * DELETE /coupons/remove
 * Xoá coupon khỏi cart
 * Headers: { Authorization: Bearer <access_token> } (optional)
 * Body: { code }
 */
couponsRouter.delete(
  '/remove',
  optionalAuth,
  wrapRequestHandler(removeCouponController)
)

// ==================== ADMIN ====================

/**
 * GET /coupons
 * Admin: Lấy danh sách tất cả coupon
 * Query: { page?, limit?, isActive?, type?, search? }
 */
couponsRouter.get(
  '/',
  accessTokenValidator,
  verifiedUserValidator,
  adminRequired,
  wrapRequestHandler(getAdminCouponsController)
)

/**
 * GET /coupons/:couponId
 * Admin: Chi tiết coupon
 */
couponsRouter.get(
  '/:couponId',
  accessTokenValidator,
  verifiedUserValidator,
  adminRequired,
  wrapRequestHandler(getAdminCouponByIdController)
)

/**
 * POST /coupons
 * Admin: Tạo coupon mới
 * Body: { code, name, type, value, minOrderAmount, startDate, endDate, ... }
 */
couponsRouter.post(
  '/',
  accessTokenValidator,
  verifiedUserValidator,
  adminRequired,
  wrapRequestHandler(createCouponController)
)

/**
 * PUT /coupons/:couponId
 * Admin: Cập nhật coupon
 */
couponsRouter.put(
  '/:couponId',
  accessTokenValidator,
  verifiedUserValidator,
  adminRequired,
  wrapRequestHandler(updateCouponController)
)

/**
 * DELETE /coupons/:couponId
 * Admin: Xoá coupon
 */
couponsRouter.delete(
  '/:couponId',
  accessTokenValidator,
  verifiedUserValidator,
  adminRequired,
  wrapRequestHandler(deleteCouponController)
)

/**
 * PATCH /coupons/:couponId/toggle
 * Admin: Kích hoạt / Hủy kích hoạt coupon
 */
couponsRouter.patch(
  '/:couponId/toggle',
  accessTokenValidator,
  verifiedUserValidator,
  adminRequired,
  wrapRequestHandler(toggleCouponController)
)

export default couponsRouter
