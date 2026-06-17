import { Router } from 'express'
import {
  createRoomController,
  createAppealController,
  joinRequestController,
  joinRoomController,
  leaveRoomController,
  listMessagesController,
  listMyRoomsController,
  listRoomsController,
  markRoomReadController,
  reportMessageController,
  sendMessageController
} from '~/controllers/community.controllers'
import {
  cancelVideoEventRegistrationController,
  getVideoEventDetailController,
  joinVideoEventController,
  listMyVideoEventsController,
  listVideoEventQuestionsController,
  listVideoEventsController,
  registerVideoEventController,
  submitVideoEventQuestionController
} from '~/controllers/communityVideoEvents.controllers'
import {
  createRoomValidator,
  createAppealValidator,
  eventIdValidator,
  messageIdValidator,
  paginationValidator,
  reportMessageValidator,
  roomIdValidator,
  sendMessageValidator,
  submitVideoQuestionValidator
} from '~/middlewares/community.middlewares'
import { adminRequired } from '~/middlewares/admin.middlewares'
import { accessTokenValidator, optionalAccessTokenValidator, verifiedUserValidator } from '~/middlewares/users.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const communityRouter = Router()

communityRouter.get('/video-events', optionalAccessTokenValidator, paginationValidator, wrapRequestHandler(listVideoEventsController))
communityRouter.get(
  '/video-events/my',
  accessTokenValidator,
  verifiedUserValidator,
  paginationValidator,
  wrapRequestHandler(listMyVideoEventsController)
)
communityRouter.get(
  '/video-events/:eventId',
  accessTokenValidator,
  verifiedUserValidator,
  eventIdValidator,
  wrapRequestHandler(getVideoEventDetailController)
)
communityRouter.post(
  '/video-events/:eventId/register',
  accessTokenValidator,
  verifiedUserValidator,
  eventIdValidator,
  wrapRequestHandler(registerVideoEventController)
)
communityRouter.post(
  '/video-events/:eventId/cancel-registration',
  accessTokenValidator,
  verifiedUserValidator,
  eventIdValidator,
  wrapRequestHandler(cancelVideoEventRegistrationController)
)
communityRouter.post(
  '/video-events/:eventId/join',
  accessTokenValidator,
  verifiedUserValidator,
  eventIdValidator,
  wrapRequestHandler(joinVideoEventController)
)
communityRouter.get(
  '/video-events/:eventId/questions',
  accessTokenValidator,
  verifiedUserValidator,
  eventIdValidator,
  paginationValidator,
  wrapRequestHandler(listVideoEventQuestionsController)
)
communityRouter.post(
  '/video-events/:eventId/questions',
  accessTokenValidator,
  verifiedUserValidator,
  eventIdValidator,
  submitVideoQuestionValidator,
  wrapRequestHandler(submitVideoEventQuestionController)
)

// Public list of rooms (optionally filter by visibility)
communityRouter.get('/rooms', wrapRequestHandler(listRoomsController))

// Rooms visible to current user, including private rooms where they are active/invited
communityRouter.get('/rooms/my', accessTokenValidator, verifiedUserValidator, wrapRequestHandler(listMyRoomsController))

// Admin-only create room
communityRouter.post(
  '/rooms',
  accessTokenValidator,
  verifiedUserValidator,
  adminRequired,
  createRoomValidator,
  wrapRequestHandler(createRoomController)
)

// Join room
communityRouter.post(
  '/rooms/:roomId/join',
  accessTokenValidator,
  verifiedUserValidator,
  roomIdValidator,
  wrapRequestHandler(joinRoomController)
)

communityRouter.post(
  '/rooms/:roomId/join-request',
  accessTokenValidator,
  verifiedUserValidator,
  roomIdValidator,
  wrapRequestHandler(joinRequestController)
)

communityRouter.post(
  '/rooms/:roomId/leave',
  accessTokenValidator,
  verifiedUserValidator,
  roomIdValidator,
  wrapRequestHandler(leaveRoomController)
)

communityRouter.post(
  '/rooms/:roomId/read',
  accessTokenValidator,
  verifiedUserValidator,
  roomIdValidator,
  wrapRequestHandler(markRoomReadController)
)

communityRouter.post(
  '/rooms/:roomId/appeals',
  accessTokenValidator,
  verifiedUserValidator,
  roomIdValidator,
  createAppealValidator,
  wrapRequestHandler(createAppealController)
)

// List messages (only visible)
communityRouter.get(
  '/rooms/:roomId/messages',
  accessTokenValidator,
  verifiedUserValidator,
  roomIdValidator,
  paginationValidator,
  wrapRequestHandler(listMessagesController)
)

// Send message (auto-hide if severity HIGH)
communityRouter.post(
  '/rooms/:roomId/messages',
  accessTokenValidator,
  verifiedUserValidator,
  roomIdValidator,
  sendMessageValidator,
  wrapRequestHandler(sendMessageController)
)

// Report message
communityRouter.post(
  '/messages/:messageId/report',
  accessTokenValidator,
  verifiedUserValidator,
  messageIdValidator,
  reportMessageValidator,
  wrapRequestHandler(reportMessageController)
)

export default communityRouter
