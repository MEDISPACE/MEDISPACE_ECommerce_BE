import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import { ObjectId } from 'mongodb'
import { TokenPayload } from '~/models/requests/User.request'
import HTTP_STATUS from '~/constants/httpStatus'
import notificationService from '~/services/notifications.services'

// GET /notifications?page=1&limit=20&filter=all
export const getNotificationsController = async (req: Request<ParamsDictionary, unknown, unknown>, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 20
  const filter = (req.query.filter as string) || 'all'

  const result = await notificationService.getByUserId(
    new ObjectId(userId),
    page,
    limit,
    filter as 'all' | 'unread' | 'order' | 'prescription' | 'promotion' | 'system' | 'reminder' | 'review'
  )

  return res.status(HTTP_STATUS.OK).json({
    message: 'Get notifications successfully',
    result: result.notifications,
    pagination: result.pagination,
  })
}

// GET /notifications/unread-count
export const getUnreadCountController = async (req: Request<ParamsDictionary, unknown, unknown>, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const count = await notificationService.getUnreadCount(new ObjectId(userId))

  return res.status(HTTP_STATUS.OK).json({
    message: 'Get unread count successfully',
    result: { count },
  })
}

// GET /notifications/preferences
export const getNotificationPreferencesController = async (
  req: Request<ParamsDictionary, unknown, unknown>,
  res: Response
) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const preferences = await notificationService.getPreferences(new ObjectId(userId))

  return res.status(HTTP_STATUS.OK).json({
    message: 'Get notification preferences successfully',
    result: preferences,
  })
}

// PATCH /notifications/preferences
export const updateNotificationPreferencesController = async (
  req: Request<ParamsDictionary, unknown, unknown>,
  res: Response
) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const preferences = await notificationService.updatePreferences(new ObjectId(userId), req.body as Parameters<typeof notificationService.updatePreferences>[1])

  return res.status(HTTP_STATUS.OK).json({
    message: 'Notification preferences updated',
    result: preferences,
  })
}

// PATCH /notifications/read-all
export const markAllAsReadController = async (req: Request<ParamsDictionary, unknown, unknown>, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  await notificationService.markAllAsRead(new ObjectId(userId))

  return res.status(HTTP_STATUS.OK).json({
    message: 'All notifications marked as read',
  })
}

// PATCH /notifications/:id/read
export const markAsReadController = async (req: Request<ParamsDictionary, unknown, unknown>, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const notificationId = new ObjectId(String(req.params.id))

  await notificationService.markAsRead(notificationId, new ObjectId(userId))

  return res.status(HTTP_STATUS.OK).json({
    message: 'Notification marked as read',
  })
}

// DELETE /notifications/:id
export const deleteNotificationController = async (req: Request<ParamsDictionary, unknown, unknown>, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const notificationId = new ObjectId(String(req.params.id))

  await notificationService.deleteNotification(notificationId, new ObjectId(userId))

  return res.status(HTTP_STATUS.OK).json({
    message: 'Notification deleted',
  })
}
