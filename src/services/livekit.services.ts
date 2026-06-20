import { AccessToken, RoomServiceClient, TrackSource, type ParticipantInfo, type TrackInfo } from 'livekit-server-sdk'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'

export type LiveKitParticipantTrack = {
  sid: string
  name: string
  source: string
  muted: boolean
}

export type LiveKitParticipantSummary = {
  identity: string
  name: string
  metadata: Record<string, unknown> | null
  joinedAt?: string
  tracks: LiveKitParticipantTrack[]
}

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

  getRoomName(eventId: string) {
    return `medispace-event-${eventId}`
  }

  private getHttpUrl() {
    const wsUrl = this.getWsUrl()
    if (!wsUrl) return ''
    return wsUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:')
  }

  private getRoomClient() {
    if (!this.isConfigured()) {
      throw new ErrorWithStatus({ message: 'LiveKit chưa được cấu hình.', status: HTTP_STATUS.BAD_REQUEST })
    }
    return new RoomServiceClient(this.getHttpUrl(), process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!)
  }

  private parseMetadata(metadata?: string) {
    if (!metadata) return null
    try {
      return JSON.parse(metadata) as Record<string, unknown>
    } catch {
      return null
    }
  }

  private sourceLabel(source: TrackSource) {
    if (source === TrackSource.MICROPHONE) return 'microphone'
    if (source === TrackSource.CAMERA) return 'camera'
    if (source === TrackSource.SCREEN_SHARE) return 'screen_share'
    if (source === TrackSource.SCREEN_SHARE_AUDIO) return 'screen_share_audio'
    return 'unknown'
  }

  private toParticipantSummary(participant: ParticipantInfo): LiveKitParticipantSummary {
    const joinedAt = Number(participant.joinedAt || 0) > 0 ? new Date(Number(participant.joinedAt) * 1000).toISOString() : undefined
    return {
      identity: participant.identity,
      name: participant.name,
      metadata: this.parseMetadata(participant.metadata),
      joinedAt,
      tracks: (participant.tracks || []).map((track: TrackInfo) => ({
        sid: track.sid,
        name: track.name,
        source: this.sourceLabel(track.source),
        muted: track.muted
      }))
    }
  }

  async listParticipants(eventId: string) {
    const participants = await this.getRoomClient().listParticipants(this.getRoomName(eventId))
    return participants.map((participant) => this.toParticipantSummary(participant))
  }

  async muteParticipantAudio(eventId: string, userId: string) {
    const client = this.getRoomClient()
    const room = this.getRoomName(eventId)
    const participant = await client.getParticipant(room, userId)
    const microphoneTrack = (participant.tracks || []).find((track) => track.source === TrackSource.MICROPHONE)
    if (!microphoneTrack) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy micro đang bật của người tham gia.', status: HTTP_STATUS.NOT_FOUND })
    }
    const track = await client.mutePublishedTrack(room, userId, microphoneTrack.sid, true)
    return {
      eventId,
      userId,
      action: 'muted' as const,
      track: {
        sid: track.sid,
        name: track.name,
        source: this.sourceLabel(track.source),
        muted: track.muted
      }
    }
  }

  async removeParticipant(eventId: string, userId: string) {
    await this.getRoomClient().removeParticipant(this.getRoomName(eventId), userId)
    return { eventId, userId, action: 'kicked' as const }
  }

  async createJoinToken(params: { eventId: string; userId: string; displayName?: string; avatar?: string; isHost: boolean; ttl?: string }) {
    if (!this.isConfigured()) {
      throw new ErrorWithStatus({ message: 'LiveKit chưa được cấu hình.', status: HTTP_STATUS.BAD_REQUEST })
    }

    const ttl = params.ttl && this.allowedTtls.has(params.ttl) ? params.ttl : '2h'

    const token = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity: params.userId,
      name: params.displayName?.trim() || params.userId,
      metadata: JSON.stringify({ userId: params.userId, avatar: params.avatar || '', role: params.isHost ? 'host' : 'attendee' }),
      ttl
    })

    token.addGrant({
      roomJoin: true,
      room: this.getRoomName(params.eventId),
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    })

    const jwt = await token.toJwt()
    console.info('[LiveKit] join token generated', { eventId: params.eventId, userId: params.userId, isHost: params.isHost, ttl })
    return jwt
  }
}

const liveKitService = new LiveKitService()
export default liveKitService
