import { Router } from 'express'
import {
  getNotificationsController,
  getUnreadCountController,
  markAllAsReadController,
  markAsReadController,
  deleteNotificationController,
} from '~/controllers/notifications.controllers'
import { accessTokenValidator, verifiedUserValidator } from '~/middlewares/users.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const notificationsRouter = Router()

// All notification routes require authentication
const auth = [accessTokenValidator, verifiedUserValidator]

/**
 * GET /notifications?page=1&limit=20&filter=all|unread|order|prescription|promotion|system|reminder
 * Get paginated notifications for the authenticated user
 */
notificationsRouter.get('/', ...auth, wrapRequestHandler(getNotificationsController))

/**
 * GET /notifications/unread-count
 * Get count of unread notifications (for bell badge)
 */
notificationsRouter.get('/unread-count', ...auth, wrapRequestHandler(getUnreadCountController))

/**
 * PATCH /notifications/read-all
 * Mark all notifications as read
 */
notificationsRouter.patch('/read-all', ...auth, wrapRequestHandler(markAllAsReadController))

/**
 * PATCH /notifications/:id/read
 * Mark a single notification as read
 */
notificationsRouter.patch('/:id/read', ...auth, wrapRequestHandler(markAsReadController))

/**
 * DELETE /notifications/:id
 * Delete a single notification permanently
 */
notificationsRouter.delete('/:id', ...auth, wrapRequestHandler(deleteNotificationController))

export default notificationsRouter
