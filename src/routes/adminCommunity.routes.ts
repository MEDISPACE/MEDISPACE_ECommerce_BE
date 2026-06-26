import { Router } from 'express'
import {
  archiveRoomController,
  createAdminRoomController,
  inviteRoomMemberController,
  listAdminThreadsController,
  listAdminRoomsController,
  listRoomMembersController,
  unarchiveRoomController,
  updateAdminRoomController,
  updateAdminThreadController,
  updateRoomMemberController
} from '~/controllers/adminCommunity.controllers'
import {
  cancelAdminVideoEventController,
  createAdminVideoEventController,
  endAdminVideoEventController,
  getVideoEventDetailController,
  kickAdminVideoEventParticipantController,
  listAdminVideoEventParticipantsController,
  listAdminVideoEventRegistrationsController,
  listVideoEventsController,
  muteAdminVideoEventParticipantController,
  startAdminVideoEventController,
  updateAdminVideoEventController,
  updateAdminVideoEventRegistrationController
} from '~/controllers/communityVideoEvents.controllers'
import { adminRequired } from '~/middlewares/admin.middlewares'
import {
  createRoomValidator,
  createVideoEventValidator,
  eventIdValidator,
  inviteMemberValidator,
  memberActionValidator,
  paginationValidator,
  roomIdValidator,
  threadIdValidator,
  updateThreadValidator,
  updateVideoEventValidator,
  updateVideoRegistrationValidator,
  updateRoomValidator,
  userIdParamValidator
} from '~/middlewares/community.middlewares'
import { accessTokenValidator, verifiedUserValidator } from '~/middlewares/users.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const adminCommunityRouter = Router()

adminCommunityRouter.use(accessTokenValidator, verifiedUserValidator, adminRequired)

adminCommunityRouter.get('/rooms', wrapRequestHandler(listAdminRoomsController))
adminCommunityRouter.post('/rooms', createRoomValidator, wrapRequestHandler(createAdminRoomController))
adminCommunityRouter.patch('/rooms/:roomId', roomIdValidator, updateRoomValidator, wrapRequestHandler(updateAdminRoomController))
adminCommunityRouter.patch('/rooms/:roomId/archive', roomIdValidator, wrapRequestHandler(archiveRoomController))
adminCommunityRouter.patch('/rooms/:roomId/unarchive', roomIdValidator, wrapRequestHandler(unarchiveRoomController))
adminCommunityRouter.get('/rooms/:roomId/members', roomIdValidator, paginationValidator, wrapRequestHandler(listRoomMembersController))
adminCommunityRouter.patch(
  '/rooms/:roomId/members/:userId',
  roomIdValidator,
  userIdParamValidator,
  memberActionValidator,
  wrapRequestHandler(updateRoomMemberController)
)
adminCommunityRouter.post(
  '/rooms/:roomId/invite',
  roomIdValidator,
  inviteMemberValidator,
  wrapRequestHandler(inviteRoomMemberController)
)

adminCommunityRouter.get('/rooms/:roomId/threads', roomIdValidator, paginationValidator, wrapRequestHandler(listAdminThreadsController))
adminCommunityRouter.patch(
  '/threads/:threadId',
  threadIdValidator,
  updateThreadValidator,
  wrapRequestHandler(updateAdminThreadController)
)

adminCommunityRouter.get('/video-events', paginationValidator, wrapRequestHandler(listVideoEventsController))
adminCommunityRouter.post('/video-events', createVideoEventValidator, wrapRequestHandler(createAdminVideoEventController))
adminCommunityRouter.get('/video-events/:eventId', eventIdValidator, wrapRequestHandler(getVideoEventDetailController))
adminCommunityRouter.patch(
  '/video-events/:eventId',
  eventIdValidator,
  updateVideoEventValidator,
  wrapRequestHandler(updateAdminVideoEventController)
)
adminCommunityRouter.post('/video-events/:eventId/start', eventIdValidator, wrapRequestHandler(startAdminVideoEventController))
adminCommunityRouter.post('/video-events/:eventId/end', eventIdValidator, wrapRequestHandler(endAdminVideoEventController))
adminCommunityRouter.post('/video-events/:eventId/cancel', eventIdValidator, wrapRequestHandler(cancelAdminVideoEventController))
adminCommunityRouter.get(
  '/video-events/:eventId/participants',
  eventIdValidator,
  wrapRequestHandler(listAdminVideoEventParticipantsController)
)
adminCommunityRouter.post(
  '/video-events/:eventId/participants/:userId/mute',
  eventIdValidator,
  userIdParamValidator,
  wrapRequestHandler(muteAdminVideoEventParticipantController)
)
adminCommunityRouter.post(
  '/video-events/:eventId/participants/:userId/kick',
  eventIdValidator,
  userIdParamValidator,
  wrapRequestHandler(kickAdminVideoEventParticipantController)
)
adminCommunityRouter.get(
  '/video-events/:eventId/registrations',
  eventIdValidator,
  paginationValidator,
  wrapRequestHandler(listAdminVideoEventRegistrationsController)
)
adminCommunityRouter.patch(
  '/video-events/:eventId/registrations/:userId',
  eventIdValidator,
  userIdParamValidator,
  updateVideoRegistrationValidator,
  wrapRequestHandler(updateAdminVideoEventRegistrationController)
)

export default adminCommunityRouter
