import { ObjectId } from 'mongodb'
import { UserRole } from '~/constants/enum'

export type CommunityVideoEventAuthContext = {
  userId?: ObjectId
  role?: UserRole
}

export type CommunityVideoEventAccessShape = {
  hostIds?: ObjectId[]
  roomId: ObjectId
}

export function isCommunityVideoEventAdmin(context?: CommunityVideoEventAuthContext) {
  return context?.role === UserRole.Admin
}

export function isCommunityVideoEventHost(event: Pick<CommunityVideoEventAccessShape, 'hostIds'>, userId?: ObjectId) {
  if (!userId) return false
  return Array.isArray(event.hostIds) && event.hostIds.some((hostId: ObjectId) => hostId?.equals?.(userId))
}
