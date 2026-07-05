import { Router } from 'express'
import {
  getNotificationsController,
  getUnreadCountController,
  getNotificationPreferencesController,
  updateNotificationPreferencesController,
  markAllAsReadController,
  markAsReadController,
  deleteNotificationController,
} from '~/controllers/notifications.controllers'
import { accessTokenValidator, verifiedUserValidator } from '~/middlewares/users.middlewares'
import { notificationIdValidator, getNotificationsValidator } from '~/middlewares/notifications.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const notificationsRouter = Router()

// All notification routes require authentication
const auth = [accessTokenValidator, verifiedUserValidator]

/**
 * GET /notifications?page=1&limit=20&filter=all|unread|order|prescription|promotion|system|reminder
 * Get paginated notifications for the authenticated user
 */
notificationsRouter.get('/', ...auth, getNotificationsValidator, wrapRequestHandler(getNotificationsController))

/**
 * GET /notifications/unread-count
 * Get count of unread notifications (for bell badge)
 */
notificationsRouter.get('/unread-count', ...auth, wrapRequestHandler(getUnreadCountController))

/**
 * GET /notifications/preferences
 * Get notification channel/type preferences for the authenticated user
 */
notificationsRouter.get('/preferences', ...auth, wrapRequestHandler(getNotificationPreferencesController))

/**
 * PATCH /notifications/preferences
 * Update notification channel/type preferences for the authenticated user
 */
notificationsRouter.patch('/preferences', ...auth, wrapRequestHandler(updateNotificationPreferencesController))

/**
 * PATCH /notifications/read-all
 * Mark all notifications as read
 */
notificationsRouter.patch('/read-all', ...auth, wrapRequestHandler(markAllAsReadController))

/**
 * PATCH /notifications/:id/read
 * Mark a single notification as read
 */
notificationsRouter.patch('/:id/read', ...auth, notificationIdValidator, wrapRequestHandler(markAsReadController))

/**
 * DELETE /notifications/:id
 * Delete a single notification permanently
 */
notificationsRouter.delete('/:id', ...auth, notificationIdValidator, wrapRequestHandler(deleteNotificationController))

export default notificationsRouter
