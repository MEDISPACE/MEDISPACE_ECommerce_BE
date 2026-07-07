import { Request, Response } from 'express'
import { ObjectId } from 'mongodb'
import { TokenPayload } from '~/models/requests/User.request'
import communityService from '~/services/community.services'
import communityVideoEventsService from '~/services/communityVideoEvents.services'
import liveKitService from '~/services/livekit.services'

function authContext(req: Request) {
  const decoded = req.decoded_authorization as TokenPayload | undefined
  return decoded ? { userId: new ObjectId(decoded.userId), role: decoded.role } : undefined
}

function paramString(value: string | string[] | undefined) {
  const param = Array.isArray(value) ? value[0] : value
  if (!param) throw new Error('Missing route parameter')
  return param
}

export const listVideoEventsController = async (req: Request, res: Response) => {
  const ctx = authContext(req)
  const { roomId, status, search, upcomingOnly } = req.query as Record<string, any>
  const result = await communityVideoEventsService.listEvents({
    viewer: ctx,
    roomId: typeof roomId === 'string' && ObjectId.isValid(roomId) ? new ObjectId(roomId) : undefined,
    status: ['draft', 'scheduled', 'live', 'ended', 'cancelled'].includes(status) ? status : undefined,
    search: typeof search === 'string' ? search : undefined,
    upcomingOnly: upcomingOnly === 'true',
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20)
  })
  return res.status(200).json({ message: 'OK', data: result })
}

export const listMyVideoEventsController = async (req: Request, res: Response) => {
  const { userId, role } = req.decoded_authorization as TokenPayload
  const status = (req.query as any).status
  const result = await communityVideoEventsService.listMyEvents(new ObjectId(userId), role, {
    status: ['draft', 'scheduled', 'live', 'ended', 'cancelled'].includes(status) ? status : undefined,
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20)
  })
  return res.status(200).json({ message: 'OK', data: result })
}

export const getVideoEventDetailController = async (req: Request, res: Response) => {
  const event = await communityVideoEventsService.getEventDetail(new ObjectId(paramString(req.params.eventId)), authContext(req))
  return res.status(200).json({ message: 'OK', data: event })
}

export const getLiveKitDiagnosticsController = async (_req: Request, res: Response) => {
  const result = await liveKitService.checkReachability()
  return res.status(200).json({ message: 'OK', data: result })
}

export const registerVideoEventController = async (req: Request, res: Response) => {
  const { userId, role } = req.decoded_authorization as TokenPayload
  const registration = await communityVideoEventsService.registerForEvent(new ObjectId(paramString(req.params.eventId)), new ObjectId(userId), role)
  return res.status(201).json({ message: 'Đăng ký hội thảo thành công', data: registration })
}

export const cancelVideoEventRegistrationController = async (req: Request, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const registration = await communityVideoEventsService.cancelRegistration(new ObjectId(paramString(req.params.eventId)), new ObjectId(userId))
  return res.status(200).json({ message: 'Đã hủy đăng ký hội thảo', data: registration })
}

export const joinVideoEventController = async (req: Request, res: Response) => {
  const { userId, role } = req.decoded_authorization as TokenPayload
  const payload = await communityVideoEventsService.joinEvent(new ObjectId(paramString(req.params.eventId)), new ObjectId(userId), role)
  return res.status(200).json({ message: 'OK', data: payload })
}

export const listVideoEventMessagesController = async (req: Request, res: Response) => {
  const { userId, role } = req.decoded_authorization as TokenPayload
  const eventId = new ObjectId(paramString(req.params.eventId))
  const event = await communityVideoEventsService.getEventDetail(eventId, authContext(req))
  const result = await communityService.listMessages({
    roomId: event.roomId,
    videoEventId: eventId,
    userId: new ObjectId(userId),
    role,
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
    q: typeof req.query.q === 'string' ? req.query.q.trim() : undefined
  })
  return res.status(200).json({ message: 'OK', data: result })
}

export const sendVideoEventMessageController = async (req: Request, res: Response) => {
  const { userId, role } = req.decoded_authorization as TokenPayload
  const eventId = new ObjectId(paramString(req.params.eventId))
  const { content } = req.body
  const result = await communityService.sendVideoEventChatMessage({
    eventId,
    userId: new ObjectId(userId),
    role,
    content
  })
  return res.status(201).json({ message: 'Gửi tin nhắn cuộc họp thành công', data: result })
}

export const createAdminVideoEventController = async (req: Request, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const {
    roomId,
    title,
    description,
    agenda,
    status,
    scheduledStartAt,
    scheduledEndAt,
    hostIds,
    speakerProfiles,
    registrationRequired,
    capacity,
    provider,
    providerMeetingId,
    meetingUrl,
    materials,
    tags
  } = req.body
  const event = await communityVideoEventsService.createEvent({
    roomId: new ObjectId(roomId),
    title,
    description,
    agenda,
    status,
    scheduledStartAt,
    scheduledEndAt,
    hostIds: Array.isArray(hostIds) ? hostIds.map((id: string) => new ObjectId(id)) : [],
    speakerProfiles,
    registrationRequired,
    capacity,
    provider,
    providerMeetingId,
    meetingUrl,
    materials,
    tags,
    createdBy: new ObjectId(userId)
  })
  return res.status(201).json({ message: 'Tạo hội thảo thành công', data: event })
}

export const updateAdminVideoEventController = async (req: Request, res: Response) => {
  const {
    title,
    description,
    agenda,
    status,
    scheduledStartAt,
    scheduledEndAt,
    hostIds,
    speakerProfiles,
    registrationRequired,
    capacity,
    provider,
    providerMeetingId,
    meetingUrl,
    materials,
    tags
  } = req.body
  const event = await communityVideoEventsService.updateEvent(
    new ObjectId(paramString(req.params.eventId)),
    {
      title,
      description,
      agenda,
      status,
      scheduledStartAt,
      scheduledEndAt,
      hostIds,
      speakerProfiles,
      registrationRequired,
      capacity,
      provider,
      providerMeetingId,
      meetingUrl,
      materials,
      tags
    },
    authContext(req) || {}
  )
  return res.status(200).json({ message: 'Cập nhật hội thảo thành công', data: event })
}

export const cancelAdminVideoEventController = async (req: Request, res: Response) => {
  const event = await communityVideoEventsService.cancelEvent(new ObjectId(paramString(req.params.eventId)), authContext(req) || {})
  return res.status(200).json({ message: 'Đã hủy hội thảo', data: event })
}

export const listAdminVideoEventRegistrationsController = async (req: Request, res: Response) => {
  const status = (req.query as any).status
  const result = await communityVideoEventsService.listRegistrations(new ObjectId(paramString(req.params.eventId)), authContext(req) || {}, {
    status: ['registered', 'cancelled', 'attended', 'no_show', 'removed'].includes(status) ? status : undefined,
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20)
  })
  return res.status(200).json({ message: 'OK', data: result })
}

export const updateAdminVideoEventRegistrationController = async (req: Request, res: Response) => {
  const registration = await communityVideoEventsService.updateRegistration(
    new ObjectId(paramString(req.params.eventId)),
    new ObjectId(paramString(req.params.userId)),
    authContext(req) || {},
    req.body
  )
  return res.status(200).json({ message: 'Cập nhật đăng ký thành công', data: registration })
}

export const listAdminVideoEventParticipantsController = async (req: Request, res: Response) => {
  const result = await communityVideoEventsService.listLiveParticipants(new ObjectId(paramString(req.params.eventId)), authContext(req) || {})
  return res.status(200).json({ message: 'OK', data: result })
}

export const muteAdminVideoEventParticipantController = async (req: Request, res: Response) => {
  const result = await communityVideoEventsService.muteLiveParticipantAudio(
    new ObjectId(paramString(req.params.eventId)),
    new ObjectId(paramString(req.params.userId)),
    authContext(req) || {}
  )
  return res.status(200).json({ message: 'Đã tắt micro người tham gia', data: result })
}

export const kickAdminVideoEventParticipantController = async (req: Request, res: Response) => {
  const result = await communityVideoEventsService.kickLiveParticipant(
    new ObjectId(paramString(req.params.eventId)),
    new ObjectId(paramString(req.params.userId)),
    authContext(req) || {}
  )
  return res.status(200).json({ message: 'Đã mời người tham gia khỏi phòng họp', data: result })
}
