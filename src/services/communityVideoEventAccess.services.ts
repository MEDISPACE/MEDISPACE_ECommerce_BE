import { ObjectId, type Document, type WithId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { UserRole } from '~/constants/enum'
import { ErrorWithStatus } from '~/models/Error'
import databaseService from '~/services/database.services'
import {
  CommunityVideoEventAccessShape,
  isCommunityVideoEventAdmin,
  isCommunityVideoEventHost
} from '~/utils/communityVideoEventAuth'

type AuthContext = {
  userId?: ObjectId
  role?: UserRole
}

type CommunityVideoEventRealtimeDoc = WithId<Document> & CommunityVideoEventAccessShape & {
  status?: string
}

class CommunityVideoEventAccessService {
  private isAdmin(context?: AuthContext) {
    return isCommunityVideoEventAdmin(context)
  }

  private isHost(event: Pick<CommunityVideoEventAccessShape, 'hostIds'>, userId?: ObjectId) {
    return isCommunityVideoEventHost(event, userId)
  }

  async assertCanSubscribeRealtime(eventId: ObjectId, context: AuthContext) {
    const event = await databaseService.communityVideoEvents.findOne({ _id: eventId }) as CommunityVideoEventRealtimeDoc | null
    if (!event || event.status === 'cancelled' || event.status === 'draft') {
      throw new ErrorWithStatus({ message: 'Không tìm thấy hội thảo.', status: HTTP_STATUS.NOT_FOUND })
    }

    if (this.isAdmin(context) || this.isHost(event, context.userId) || event.visibility === 'public') return event

    const member = context.userId
      ? await databaseService.communityRoomMembers.findOne({ roomId: event.roomId, userId: context.userId })
      : null

    if (!member || !['active', 'invited'].includes(member.status)) {
      throw new ErrorWithStatus({ message: 'Bạn không có quyền theo dõi hội thảo này.', status: HTTP_STATUS.FORBIDDEN })
    }

    return event
  }
}

const communityVideoEventAccessService = new CommunityVideoEventAccessService()
export default communityVideoEventAccessService
