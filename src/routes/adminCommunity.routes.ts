import { Router } from 'express'
import {
  archiveRoomController,
  createAdminRoomController,
  inviteRoomMemberController,
  listAdminRoomsController,
  listRoomMembersController,
  unarchiveRoomController,
  updateAdminRoomController,
  updateRoomMemberController
} from '~/controllers/adminCommunity.controllers'
import { adminRequired } from '~/middlewares/admin.middlewares'
import {
  createRoomValidator,
  inviteMemberValidator,
  memberActionValidator,
  paginationValidator,
  roomIdValidator,
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

export default adminCommunityRouter
