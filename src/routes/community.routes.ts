import { Router } from 'express'
import {
  createRoomController,
  createThreadController,
  createAppealController,
  createThreadReplyController,
  deleteMessageController,
  getThreadController,
  joinRequestController,
  joinRoomController,
  leaveRoomController,
  listThreadRepliesController,
  listThreadsController,
  listMessagesController,
  listMyRoomsController,
  listRoomsController,
  markRoomReadController,
  reactToMessageController,
  reportMessageController,
  sendMessageController,
  updateMessageController
} from '~/controllers/community.controllers'
import {
  cancelVideoEventRegistrationController,
  getVideoEventDetailController,
  getLiveKitDiagnosticsController,
  joinVideoEventController,
  listMyVideoEventsController,
  listVideoEventsController,
  registerVideoEventController
} from '~/controllers/communityVideoEvents.controllers'
import {
  communityActionRateLimit,
  createRoomValidator,
  createThreadReplyValidator,
  createThreadValidator,
  createAppealValidator,
  eventIdValidator,
  messageIdValidator,
  paginationValidator,
  reactToMessageValidator,
  reportMessageValidator,
  roomIdValidator,
  sendMessageValidator,
  threadIdValidator,
  updateMessageValidator
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
  '/video-events/livekit/diagnostics',
  accessTokenValidator,
  verifiedUserValidator,
  wrapRequestHandler(getLiveKitDiagnosticsController)
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

communityRouter.get(
  '/rooms/:roomId/threads',
  optionalAccessTokenValidator,
  roomIdValidator,
  paginationValidator,
  wrapRequestHandler(listThreadsController)
)

communityRouter.post(
  '/rooms/:roomId/threads',
  accessTokenValidator,
  verifiedUserValidator,
  roomIdValidator,
  communityActionRateLimit('thread'),
  createThreadValidator,
  wrapRequestHandler(createThreadController)
)

communityRouter.get(
  '/threads/:threadId',
  optionalAccessTokenValidator,
  threadIdValidator,
  wrapRequestHandler(getThreadController)
)

communityRouter.get(
  '/threads/:threadId/replies',
  optionalAccessTokenValidator,
  threadIdValidator,
  paginationValidator,
  wrapRequestHandler(listThreadRepliesController)
)

communityRouter.post(
  '/threads/:threadId/replies',
  accessTokenValidator,
  verifiedUserValidator,
  threadIdValidator,
  communityActionRateLimit('reply'),
  createThreadReplyValidator,
  wrapRequestHandler(createThreadReplyController)
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
  communityActionRateLimit('report'),
  reportMessageValidator,
  wrapRequestHandler(reportMessageController)
)

communityRouter.post(
  '/messages/:messageId/reaction',
  accessTokenValidator,
  verifiedUserValidator,
  messageIdValidator,
  communityActionRateLimit('reaction'),
  reactToMessageValidator,
  wrapRequestHandler(reactToMessageController)
)

communityRouter.patch(
  '/messages/:messageId',
  accessTokenValidator,
  verifiedUserValidator,
  messageIdValidator,
  updateMessageValidator,
  wrapRequestHandler(updateMessageController)
)

communityRouter.delete(
  '/messages/:messageId',
  accessTokenValidator,
  verifiedUserValidator,
  messageIdValidator,
  wrapRequestHandler(deleteMessageController)
)

export default communityRouter
