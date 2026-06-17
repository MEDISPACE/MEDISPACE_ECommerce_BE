import { AccessToken } from 'livekit-server-sdk'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'

class LiveKitService {
  private readonly allowedTtls = new Set(['30m', '1h', '2h', '4h'])

  isConfigured() {
    return Boolean(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.LIVEKIT_WS_URL)
  }

  getWsUrl() {
    return process.env.LIVEKIT_WS_URL || ''
  }

  async createJoinToken(params: { eventId: string; userId: string; isHost: boolean; ttl?: string }) {
    if (!this.isConfigured()) {
      throw new ErrorWithStatus({ message: 'LiveKit chưa được cấu hình.', status: HTTP_STATUS.BAD_REQUEST })
    }

    const ttl = params.ttl && this.allowedTtls.has(params.ttl) ? params.ttl : '2h'

    const token = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity: params.userId,
      ttl
    })

    token.addGrant({
      roomJoin: true,
      room: `medispace-event-${params.eventId}`,
      canPublish: params.isHost,
      canSubscribe: true,
      canPublishData: params.isHost
    })

    const jwt = await token.toJwt()
    console.info('[LiveKit] join token generated', { eventId: params.eventId, userId: params.userId, isHost: params.isHost, ttl })
    return jwt
  }
}

const liveKitService = new LiveKitService()
export default liveKitService
