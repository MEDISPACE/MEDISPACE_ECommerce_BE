import { Request, Response } from 'express'
import { ObjectId } from 'mongodb'
import campaignService from '~/services/campaigns.services'
import HTTP_STATUS from '~/constants/httpStatus'

// ==================== PUBLIC ====================

// GET /campaigns/active — Danh sách campaign đang chạy
export const getActiveCampaignsController = async (req: Request, res: Response) => {
  const campaigns = await campaignService.getActiveCampaigns()
  return res.status(HTTP_STATUS.OK).json({
    message: 'Lấy danh sách chiến dịch thành công.',
    result: campaigns
  })
}

// GET /campaigns/slug/:slug — Chi tiết campaign theo slug
export const getCampaignBySlugController = async (req: Request, res: Response) => {
  const slug = req.params.slug as string
  const campaign = await campaignService.getCampaignBySlug(slug)
  return res.status(HTTP_STATUS.OK).json({
    message: 'Lấy thông tin chiến dịch thành công.',
    result: campaign
  })
}

// ==================== ADMIN ====================

// GET /campaigns — Admin: danh sách
export const getAdminCampaignsController = async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 20
  const filter = {
    status: req.query.status as string,
    search: req.query.search as string
  }

  const result = await campaignService.getCampaigns(page, limit, filter)
  return res.status(HTTP_STATUS.OK).json({ message: 'Lấy danh sách chiến dịch thành công.', result })
}

// GET /campaigns/:campaignId — Admin: chi tiết
export const getAdminCampaignByIdController = async (req: Request, res: Response) => {
  const campaignId = req.params.campaignId as string
  const campaign = await campaignService.getCampaignById(new ObjectId(campaignId))
  return res.status(HTTP_STATUS.OK).json({ message: 'Lấy thông tin chiến dịch thành công.', result: campaign })
}

// POST /campaigns — Admin: tạo campaign
export const createCampaignController = async (req: Request, res: Response) => {
  const adminId = new ObjectId(req.decoded_authorization!.userId)
  const result = await campaignService.createCampaign(req.body, adminId)
  return res.status(HTTP_STATUS.CREATED).json({ message: 'Tạo chiến dịch thành công.', result })
}

// PUT /campaigns/:campaignId — Admin: cập nhật
export const updateCampaignController = async (req: Request, res: Response) => {
  const campaignId = req.params.campaignId as string
  const result = await campaignService.updateCampaign(new ObjectId(campaignId), req.body)
  return res.status(HTTP_STATUS.OK).json({ message: 'Cập nhật chiến dịch thành công.', result })
}

// DELETE /campaigns/:campaignId — Admin: xoá
export const deleteCampaignController = async (req: Request, res: Response) => {
  const campaignId = req.params.campaignId as string
  const result = await campaignService.deleteCampaign(new ObjectId(campaignId))
  return res.status(HTTP_STATUS.OK).json(result)
}

// PATCH /campaigns/:campaignId/toggle — Admin: bật/tắt
export const toggleCampaignController = async (req: Request, res: Response) => {
  const campaignId = req.params.campaignId as string
  const result = await campaignService.toggleCampaign(new ObjectId(campaignId))
  return res.status(HTTP_STATUS.OK).json({ message: 'Cập nhật trạng thái chiến dịch thành công.', result })
}
