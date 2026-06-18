import { AccessToken } from 'livekit-server-sdk'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'

class LiveKitService {
  private readonly allowedTtls = new Set(['30m', '1h', '2h', '4h'])

  private isPlaceholder(value: string) {
    const normalized = value.trim().toLowerCase()
    return normalized.includes('replace-with-livekit') || normalized.includes('your-livekit-server.com')
  }

  private isValidWsUrl(value: string) {
    try {
      const url = new URL(value)
      return ['ws:', 'wss:'].includes(url.protocol) && !this.isPlaceholder(value)
    } catch {
      return false
    }
  }

  isConfigured() {
    const apiKey = process.env.LIVEKIT_API_KEY?.trim() || ''
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim() || ''
    const wsUrl = process.env.LIVEKIT_WS_URL?.trim() || ''
    return Boolean(
      apiKey &&
        apiSecret &&
        wsUrl &&
        !this.isPlaceholder(apiKey) &&
        !this.isPlaceholder(apiSecret) &&
        this.isValidWsUrl(wsUrl)
    )
  }

  getWsUrl() {
    return process.env.LIVEKIT_WS_URL?.trim() || ''
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
