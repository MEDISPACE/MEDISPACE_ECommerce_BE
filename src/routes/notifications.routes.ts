import { Router } from 'express'
import { getNotificationsController } from '~/controllers/notifications.controllers'
import { accessTokenValidator, verifiedUserValidator } from '~/middlewares/users.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const notificationsRouter = Router()

/**
 * Description: Get user's notifications
 * Path: /
 * Method: GET
 * Header: { Authorization: Bearer <access_token> }
 */
notificationsRouter.get(
  '/',
  accessTokenValidator,
  verifiedUserValidator,
  wrapRequestHandler(getNotificationsController)
)

export default notificationsRouter
