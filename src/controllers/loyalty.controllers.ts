import { Request, Response } from 'express'
import { ObjectId } from 'mongodb'
import loyaltyService from '~/services/loyalty.services'
import databaseService from '~/services/database.services'
import HTTP_STATUS from '~/constants/httpStatus'

// GET /loyalty/account — Thông tin loyalty của user
export const getAccountController = async (req: Request, res: Response) => {
  const userId = new ObjectId(req.decoded_authorization!.userId)

  // Xử lý điểm hết hạn trước khi trả về
  await loyaltyService.processExpiredPoints(userId)

  const result = await loyaltyService.getAccountInfo(userId)
  return res.status(HTTP_STATUS.OK).json({
    message: 'Lấy thông tin thành viên thành công.',
    result
  })
}

// GET /loyalty/transactions — Lịch sử giao dịch điểm
export const getTransactionsController = async (req: Request, res: Response) => {
  const userId = new ObjectId(req.decoded_authorization!.userId)
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 20
  const type = req.query.type as string

  const result = await loyaltyService.getTransactions(userId, page, limit, type ? { type } : undefined)
  return res.status(HTTP_STATUS.OK).json({
    message: 'Lấy lịch sử giao dịch thành công.',
    result
  })
}

// POST /loyalty/preview-redeem — Preview đổi điểm
export const previewRedeemController = async (req: Request, res: Response) => {
  const userId = new ObjectId(req.decoded_authorization!.userId)
  const { orderSubtotal } = req.body

  if (!orderSubtotal || orderSubtotal <= 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      message: 'Giá trị đơn hàng không hợp lệ.'
    })
  }

  // Process expired first
  await loyaltyService.processExpiredPoints(userId)

  const account = await loyaltyService.getOrCreateAccount(userId)
  const result = await loyaltyService.previewRedeem(account.pointsBalance, orderSubtotal)

  return res.status(HTTP_STATUS.OK).json({
    message: 'Preview đổi điểm thành công.',
    result
  })
}

// GET /loyalty/admin/stats — Thống kê toàn hệ thống (Admin)
export const getAdminLoyaltyStatsController = async (req: Request, res: Response) => {
  const [accounts, tierBreakdown, redeemStats, earnStats] = await Promise.all([
    databaseService.loyaltyAccounts.countDocuments({}),
    databaseService.loyaltyAccounts.aggregate([
      { $group: { _id: '$tier', count: { $sum: 1 } } }
    ]).toArray(),
    databaseService.loyaltyAccounts.aggregate([
      { $group: { _id: null, totalRedeemed: { $sum: '$totalPointsRedeemed' }, totalBalance: { $sum: '$pointsBalance' } } }
    ]).toArray(),
    databaseService.loyaltyAccounts.aggregate([
      { $group: { _id: null, totalEarned: { $sum: '$totalPointsEarned' } } }
    ]).toArray()
  ])

  const tierMap: Record<string, number> = { member: 0, silver: 0, gold: 0, platinum: 0 }
  tierBreakdown.forEach((t: any) => { if (t._id) tierMap[t._id] = t.count })

  const result = {
    totalAccounts: accounts,
    totalPointsCirculating: redeemStats[0]?.totalBalance || 0,
    totalPointsEverEarned: earnStats[0]?.totalEarned || 0,
    totalPointsRedeemed: redeemStats[0]?.totalRedeemed || 0,
    tierBreakdown: tierMap,
    avgPointsPerUser: accounts > 0 ? Math.round((redeemStats[0]?.totalBalance || 0) / accounts) : 0
  }

  return res.status(HTTP_STATUS.OK).json({ message: 'Thống kê loyalty.', result })
}

// GET /loyalty/admin/accounts — Danh sách tài khoản loyalty (Admin)
export const getAdminLoyaltyAccountsController = async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 20
  const skip = (page - 1) * limit
  const tier = req.query.tier as string
  const search = req.query.search as string

  const matchStage: any = {}
  if (tier && tier !== 'all') matchStage.tier = tier

  const pipeline: any[] = [
    { $match: matchStage },
    {
      $lookup: {
        from: process.env.USERS_COLLECTION || 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'userInfo'
      }
    },
    { $addFields: { userInfo: { $arrayElemAt: ['$userInfo', 0] } } },
    { $addFields: {
      userFullName: { $concat: [{ $ifNull: ['$userInfo.lastName', ''] }, ' ', { $ifNull: ['$userInfo.firstName', ''] }] },
      userEmail: '$userInfo.email'
    }}
  ]

  if (search) {
    pipeline.push({
      $match: {
        $or: [
          { userFullName: { $regex: search, $options: 'i' } },
          { userEmail: { $regex: search, $options: 'i' } }
        ]
      }
    })
  }

  const countPipeline = [...pipeline, { $count: 'total' }]
  pipeline.push({ $sort: { totalPointsEarned: -1 } }, { $skip: skip }, { $limit: limit })
  pipeline.push({ $project: { 'userInfo.password': 0, 'userInfo.refreshTokens': 0 } })

  const [accounts, countResult] = await Promise.all([
    databaseService.loyaltyAccounts.aggregate(pipeline).toArray(),
    databaseService.loyaltyAccounts.aggregate(countPipeline).toArray()
  ])

  const total = countResult[0]?.total || 0

  return res.status(HTTP_STATUS.OK).json({
    message: 'Danh sách tài khoản loyalty.',
    result: {
      accounts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    }
  })
}

// POST /loyalty/admin/accounts/:userId/adjust-points — Admin điều chỉnh điểm thủ công
export const adjustAdminLoyaltyPointsController = async (req: Request, res: Response) => {
  const adminId = new ObjectId(req.decoded_authorization!.userId)
  const userId = new ObjectId(req.params.userId)
  const { action, points, reason } = req.body

  if (!['add', 'subtract'].includes(action)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      message: 'Loại điều chỉnh điểm không hợp lệ.'
    })
  }

  const result = await loyaltyService.adjustPointsByAdmin(
    userId,
    adminId,
    Number(points),
    action,
    reason
  )

  return res.status(HTTP_STATUS.OK).json({
    message: 'Điều chỉnh điểm thành công.',
    result
  })
}

// GET /loyalty/admin/program-config — Admin xem cấu hình loyalty program
export const getAdminLoyaltyProgramConfigController = async (req: Request, res: Response) => {
  const result = await loyaltyService.getAdminProgramConfig()
  return res.status(HTTP_STATUS.OK).json({
    message: 'Cấu hình loyalty program.',
    result
  })
}

// PUT /loyalty/admin/program-config — Admin lưu trực tiếp cấu hình loyalty đang áp dụng
export const saveAdminLoyaltyProgramConfigController = async (req: Request, res: Response) => {
  const adminId = new ObjectId(req.decoded_authorization!.userId)
  const result = await loyaltyService.saveProgramConfig(req.body, adminId)
  return res.status(HTTP_STATUS.OK).json({
    message: 'Đã lưu cấu hình loyalty.',
    result
  })
}
