export const COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS = {
  CREATED: 'community:video-event:created',
  UPDATED: 'community:video-event:updated',
  CANCELLED: 'community:video-event:cancelled',
  LIVE: 'community:video-event:live',
  ENDED: 'community:video-event:ended',
  REGISTERED: 'community:video-event:registered',
  REGISTRATION_UPDATED: 'community:video-event:registration:updated',
  ATTENDEE_JOINED: 'community:video-event:attendee:joined',
  ATTENDEE_LEFT: 'community:video-event:attendee:left',
  JOIN_ROOM: 'community:video-event:join',
  LEAVE_ROOM: 'community:video-event:leave'
} as const
