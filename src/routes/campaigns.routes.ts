import { Router } from 'express'
import {
  getActiveCampaignsController,
  getCampaignBySlugController,
  getAdminCampaignsController,
  getAdminCampaignByIdController,
  createCampaignController,
  updateCampaignController,
  deleteCampaignController
} from '~/controllers/campaigns.controllers'
import { accessTokenValidator, verifiedUserValidator } from '~/middlewares/users.middlewares'
import { adminRequired } from '~/middlewares/admin.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const campaignsRouter = Router()

// ==================== PUBLIC ====================

/**
 * GET /campaigns/active
 * Danh sách chiến dịch đang chạy (public)
 */
campaignsRouter.get('/active', wrapRequestHandler(getActiveCampaignsController))

/**
 * GET /campaigns/slug/:slug
 * Chi tiết campaign theo slug
 */
campaignsRouter.get('/slug/:slug', wrapRequestHandler(getCampaignBySlugController))

// ==================== ADMIN ====================

/**
 * GET /campaigns
 * Admin: Danh sách tất cả campaigns
 */
campaignsRouter.get(
  '/',
  accessTokenValidator,
  verifiedUserValidator,
  adminRequired,
  wrapRequestHandler(getAdminCampaignsController)
)

/**
 * GET /campaigns/:campaignId
 * Admin: Chi tiết campaign
 */
campaignsRouter.get(
  '/:campaignId',
  accessTokenValidator,
  verifiedUserValidator,
  adminRequired,
  wrapRequestHandler(getAdminCampaignByIdController)
)

/**
 * POST /campaigns
 * Admin: Tạo campaign
 */
campaignsRouter.post(
  '/',
  accessTokenValidator,
  verifiedUserValidator,
  adminRequired,
  wrapRequestHandler(createCampaignController)
)

/**
 * PUT /campaigns/:campaignId
 * Admin: Cập nhật campaign
 */
campaignsRouter.put(
  '/:campaignId',
  accessTokenValidator,
  verifiedUserValidator,
  adminRequired,
  wrapRequestHandler(updateCampaignController)
)

/**
 * DELETE /campaigns/:campaignId
 * Admin: Xoá campaign
 */
campaignsRouter.delete(
  '/:campaignId',
  accessTokenValidator,
  verifiedUserValidator,
  adminRequired,
  wrapRequestHandler(deleteCampaignController)
)

export default campaignsRouter
