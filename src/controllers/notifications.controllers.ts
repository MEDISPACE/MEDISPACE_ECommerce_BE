import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import { TokenPayload } from '~/models/requests/User.request'
import HTTP_STATUS from '~/constants/httpStatus'

// Get user's notifications
export const getNotificationsController = async (req: Request<ParamsDictionary, unknown, unknown>, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload

  // For now, return mock notifications
  // In a real implementation, you would fetch from database
  const mockNotifications = [
    {
      id: '1',
      userId,
      type: 'order' as const,
      title: 'Đơn hàng đã được giao',
      message: 'Đơn hàng #12345 của bạn đã được giao thành công. Cảm ơn bạn đã mua sắm!',
      isRead: false,
      actionUrl: '/account/orders/12345',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
    },
    {
      id: '2',
      userId,
      type: 'prescription' as const,
      title: 'Đơn thuốc đã sẵn sàng',
      message: 'Đơn thuốc của bạn đã được chuẩn bị xong. Vui lòng đến quầy để nhận.',
      isRead: true,
      actionUrl: '/prescription/123',
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // 1 day ago
    },
    {
      id: '3',
      userId,
      type: 'promotion' as const,
      title: 'Giảm giá 20% cho lần mua tiếp theo',
      message: 'Cảm ơn bạn đã tin tưởng MediSpace. Nhận ưu đãi 20% cho đơn hàng tiếp theo!',
      isRead: false,
      actionUrl: '/products',
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days ago
    },
    {
      id: '4',
      userId,
      type: 'reminder' as const,
      title: 'Nhắc nhở uống thuốc',
      message: 'Đã đến giờ uống thuốc Amoxicillin. Uống 2 viên sau bữa ăn.',
      isRead: false,
      createdAt: new Date().toISOString()
    }
  ]

  return res.status(HTTP_STATUS.OK).json({
    message: 'Get notifications successfully',
    result: mockNotifications
  })
}
