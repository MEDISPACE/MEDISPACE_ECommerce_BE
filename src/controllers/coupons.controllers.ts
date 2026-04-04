import { Request, Response } from 'express'
import { ObjectId } from 'mongodb'
import couponService from '~/services/coupons.services'
import HTTP_STATUS from '~/constants/httpStatus'

// Helper: get userId and sessionId from request
const getUserAndSession = (req: Request) => {
  let userId: ObjectId | undefined = undefined
  if (req.decoded_authorization?.userId) {
    userId = new ObjectId(req.decoded_authorization.userId)
  }
  const sessionId = req.cookies?.sessionId || (req.headers['x-session-id'] as string)
  return { userId, sessionId }
}

// POST /coupons/validate — Preview discount (không áp dụng vào cart)
export const validateCouponController = async (req: Request, res: Response) => {
  const { userId } = getUserAndSession(req)
  const { code, cartSubtotal, hasPrescriptionItems } = req.body

  if (!userId) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      message: 'Vui lòng đăng nhập để sử dụng mã giảm giá.'
    })
  }

  const result = await couponService.validateCoupon(
    code,
    userId,
    cartSubtotal || 0,
    hasPrescriptionItems || false
  )

  return res.status(HTTP_STATUS.OK).json({ message: result.message, result })
}

// POST /coupons/apply — Áp dụng coupon vào cart
export const applyCouponController = async (req: Request, res: Response) => {
  const { userId, sessionId } = getUserAndSession(req)
  const { code } = req.body

  if (!userId) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      message: 'Vui lòng đăng nhập để sử dụng mã giảm giá.'
    })
  }

  if (!code) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: 'Vui lòng nhập mã giảm giá.' })
  }

  const result = await couponService.applyCouponToCart(code, userId, sessionId)

  return res.status(HTTP_STATUS.OK).json({
    message: 'Áp dụng mã giảm giá thành công!',
    result
  })
}

// DELETE /coupons/remove — Xoá coupon khỏi cart
export const removeCouponController = async (req: Request, res: Response) => {
  const { userId, sessionId } = getUserAndSession(req)
  const { code } = req.body

  if (!code) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: 'Vui lòng nhập mã cần xoá.' })
  }

  const result = await couponService.removeCouponFromCart(code, userId!, sessionId)

  return res.status(HTTP_STATUS.OK).json({
    message: 'Đã xoá mã giảm giá.',
    result
  })
}

// GET /coupons/public — Danh sách coupon public (user xem)
export const getPublicCouponsController = async (req: Request, res: Response) => {
  const coupons = await couponService.getPublicCoupons()
  return res.status(HTTP_STATUS.OK).json({
    message: 'Lấy danh sách mã giảm giá thành công.',
    result: coupons
  })
}

// ===== ADMIN =====

// GET /coupons — Admin: Lấy danh sách tất cả coupon
export const getAdminCouponsController = async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 20
  const filter = {
    isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
    type: req.query.type as string,
    search: req.query.search as string
  }

  const result = await couponService.getCoupons(page, limit, filter)
  return res.status(HTTP_STATUS.OK).json({ message: 'Lấy danh sách coupon thành công.', result })
}

// GET /coupons/:couponId — Admin: Lấy chi tiết coupon
export const getAdminCouponByIdController = async (req: Request, res: Response) => {
  const couponId = req.params.couponId as string
  const coupon = await couponService.getCouponById(new ObjectId(couponId))
  return res.status(HTTP_STATUS.OK).json({ message: 'Lấy thông tin coupon thành công.', result: coupon })
}

// POST /coupons — Admin: Tạo coupon mới
export const createCouponController = async (req: Request, res: Response) => {
  const adminId = new ObjectId(req.decoded_authorization!.userId)
  const result = await couponService.createCoupon(req.body, adminId)
  return res.status(HTTP_STATUS.CREATED).json({ message: 'Tạo mã giảm giá thành công.', result })
}

// PUT /coupons/:couponId — Admin: Cập nhật coupon
export const updateCouponController = async (req: Request, res: Response) => {
  const couponId = req.params.couponId as string
  const result = await couponService.updateCoupon(new ObjectId(couponId), req.body)
  return res.status(HTTP_STATUS.OK).json({ message: 'Cập nhật mã giảm giá thành công.', result })
}

// DELETE /coupons/:couponId — Admin: Xoá coupon
export const deleteCouponController = async (req: Request, res: Response) => {
  const couponId = req.params.couponId as string
  const result = await couponService.deleteCoupon(new ObjectId(couponId))
  return res.status(HTTP_STATUS.OK).json(result)
}
