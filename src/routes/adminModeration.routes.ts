import { Router } from 'express'
import {
  getModerationAppealsController,
  getModerationActionsController,
  getModerationQueueController,
  getAiModerationJobsController,
  moderateMessageActionController,
  rerunAiModerationController,
  retryAiModerationJobController,
  resolveModerationAppealController
} from '~/controllers/adminModeration.controllers'
import { adminRequired } from '~/middlewares/admin.middlewares'
import {
  appealIdValidator,
  aiJobIdValidator,
  messageIdValidator,
  moderationActionValidator,
  paginationValidator,
  resolveAppealValidator
} from '~/middlewares/community.middlewares'
import { accessTokenValidator } from '~/middlewares/users.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const adminModerationRouter = Router()

adminModerationRouter.get(
  '/queue',
  accessTokenValidator,
  adminRequired,
  paginationValidator,
  wrapRequestHandler(getModerationQueueController)
)

adminModerationRouter.get(
  '/actions',
  accessTokenValidator,
  adminRequired,
  paginationValidator,
  wrapRequestHandler(getModerationActionsController)
)

adminModerationRouter.get(
  '/appeals',
  accessTokenValidator,
  adminRequired,
  paginationValidator,
  wrapRequestHandler(getModerationAppealsController)
)

adminModerationRouter.get(
  '/ai-jobs',
  accessTokenValidator,
  adminRequired,
  paginationValidator,
  wrapRequestHandler(getAiModerationJobsController)
)

adminModerationRouter.post(
  '/ai-jobs/:jobId/retry',
  accessTokenValidator,
  adminRequired,
  aiJobIdValidator,
  wrapRequestHandler(retryAiModerationJobController)
)

adminModerationRouter.patch(
  '/appeals/:appealId',
  accessTokenValidator,
  adminRequired,
  appealIdValidator,
  resolveAppealValidator,
  wrapRequestHandler(resolveModerationAppealController)
)

adminModerationRouter.patch(
  '/messages/:messageId/action',
  accessTokenValidator,
  adminRequired,
  messageIdValidator,
  moderationActionValidator,
  wrapRequestHandler(moderateMessageActionController)
)

adminModerationRouter.post(
  '/messages/:messageId/ai-review',
  accessTokenValidator,
  adminRequired,
  messageIdValidator,
  wrapRequestHandler(rerunAiModerationController)
)

export default adminModerationRouter
