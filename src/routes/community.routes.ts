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
  createRoomValidator,
  createAppealValidator,
  messageIdValidator,
  paginationValidator,
  reportMessageValidator,
  roomIdValidator,
  sendMessageValidator
} from '~/middlewares/community.middlewares'
import { adminRequired } from '~/middlewares/admin.middlewares'
import { accessTokenValidator, verifiedUserValidator } from '~/middlewares/users.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const communityRouter = Router()

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
