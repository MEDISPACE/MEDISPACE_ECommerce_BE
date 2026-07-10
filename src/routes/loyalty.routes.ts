import { Router } from 'express'
import {
  getAccountController,
  getTransactionsController,
  previewRedeemController,
  getAdminLoyaltyStatsController,
  getAdminLoyaltyAccountsController,
  adjustAdminLoyaltyPointsController,
  getAdminLoyaltyProgramConfigController,
  saveAdminLoyaltyProgramConfigController
} from '~/controllers/loyalty.controllers'
import { accessTokenValidator, verifiedUserValidator } from '~/middlewares/users.middlewares'
import { adminRequired } from '~/middlewares/admin.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const loyaltyRouter = Router()

/**
 * GET /loyalty/account
 * Thông tin loyalty (điểm, hạng, tiến trình)
 */
loyaltyRouter.get(
  '/account',
  accessTokenValidator,
  verifiedUserValidator,
  wrapRequestHandler(getAccountController)
)

/**
 * GET /loyalty/transactions
 * Lịch sử giao dịch điểm (earn, redeem, expire, revoke)
 */
loyaltyRouter.get(
  '/transactions',
  accessTokenValidator,
  verifiedUserValidator,
  wrapRequestHandler(getTransactionsController)
)

/**
 * POST /loyalty/preview-redeem
 * Preview số tiền giảm tối đa khi đổi điểm
 * Body: { orderSubtotal: number }
 */
loyaltyRouter.post(
  '/preview-redeem',
  accessTokenValidator,
  verifiedUserValidator,
  wrapRequestHandler(previewRedeemController)
)

/**
 * GET /loyalty/admin/stats
 * Admin: Thống kê toàn hệ thống loyalty
 */
loyaltyRouter.get(
  '/admin/stats',
  accessTokenValidator,
  verifiedUserValidator,
  adminRequired,
  wrapRequestHandler(getAdminLoyaltyStatsController)
)

/**
 * GET /loyalty/admin/accounts
 * Admin: Danh sách tất cả tài khoản loyalty
 * Query: { page, limit, tier, search }
 */
loyaltyRouter.get(
  '/admin/accounts',
  accessTokenValidator,
  verifiedUserValidator,
  adminRequired,
  wrapRequestHandler(getAdminLoyaltyAccountsController)
)

/**
 * POST /loyalty/admin/accounts/:userId/adjust-points
 * Admin: Cộng/trừ điểm thủ công có audit transaction
 * Body: { action: 'add' | 'subtract', points: number, reason: string }
 */
loyaltyRouter.post(
  '/admin/accounts/:userId/adjust-points',
  accessTokenValidator,
  verifiedUserValidator,
  adminRequired,
  wrapRequestHandler(adjustAdminLoyaltyPointsController)
)

loyaltyRouter.get(
  '/admin/program-config',
  accessTokenValidator,
  verifiedUserValidator,
  adminRequired,
  wrapRequestHandler(getAdminLoyaltyProgramConfigController)
)

loyaltyRouter.put(
  '/admin/program-config',
  accessTokenValidator,
  verifiedUserValidator,
  adminRequired,
  wrapRequestHandler(saveAdminLoyaltyProgramConfigController)
)

export default loyaltyRouter
