import { AccessToken, RoomServiceClient, TrackSource, type ParticipantInfo, type TrackInfo } from 'livekit-server-sdk'
import http from 'http'
import https from 'https'
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
  audioPublishAllowed: boolean
  cameraPublishAllowed: boolean
  screenSharePublishAllowed: boolean
  tracks: LiveKitParticipantTrack[]
}

class LiveKitService {
  private readonly allowedTtls = new Set(['30m', '1h', '2h', '4h'])
  private readonly publishableSources = [
    TrackSource.MICROPHONE,
    TrackSource.CAMERA,
    TrackSource.SCREEN_SHARE,
    TrackSource.SCREEN_SHARE_AUDIO
  ]

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

  async checkReachability(timeoutMs = 5000) {
    const wsUrl = this.getWsUrl()
    const httpUrl = this.getHttpUrl()
    if (!this.isConfigured() || !httpUrl) {
      return {
        configured: false,
        reachable: false,
        wsUrl,
        reason: 'LiveKit chưa được cấu hình đủ LIVEKIT_API_KEY, LIVEKIT_API_SECRET hoặc LIVEKIT_WS_URL.'
      }
    }

    return new Promise<{ configured: boolean; reachable: boolean; wsUrl: string; httpUrl: string; reason?: string; statusCode?: number }>((resolve) => {
      const url = new URL(httpUrl)
      const client = url.protocol === 'https:' ? https : http
      const request = client.request(
        url,
        {
          method: 'HEAD',
          timeout: timeoutMs,
          headers: { Connection: 'close' }
        },
        (response) => {
          response.resume()
          resolve({ configured: true, reachable: true, wsUrl, httpUrl, statusCode: response.statusCode })
        }
      )

      request.on('timeout', () => {
        request.destroy()
        resolve({ configured: true, reachable: false, wsUrl, httpUrl, reason: `Không kết nối được LiveKit trong ${timeoutMs}ms.` })
      })
      request.on('error', (error) => {
        resolve({ configured: true, reachable: false, wsUrl, httpUrl, reason: error.message })
      })
      request.end()
    })
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

  private normalizePublishSources(sources?: TrackSource[]) {
    return (sources || []).filter((source) => this.publishableSources.includes(source))
  }

  private toParticipantSummary(participant: ParticipantInfo): LiveKitParticipantSummary {
    const joinedAt = Number(participant.joinedAt || 0) > 0 ? new Date(Number(participant.joinedAt) * 1000).toISOString() : undefined
    const canPublishSources = participant.permission?.canPublishSources || []
    const canPublish = participant.permission?.canPublish !== false
    const canPublishSource = (source: TrackSource) => canPublish && (canPublishSources.length === 0 || canPublishSources.includes(source))
    return {
      identity: participant.identity,
      name: participant.name,
      metadata: this.parseMetadata(participant.metadata),
      joinedAt,
      audioPublishAllowed: canPublishSource(TrackSource.MICROPHONE),
      cameraPublishAllowed: canPublishSource(TrackSource.CAMERA),
      screenSharePublishAllowed: canPublishSource(TrackSource.SCREEN_SHARE),
      tracks: (participant.tracks || []).map((track: TrackInfo) => ({
        sid: track.sid,
        name: track.name,
        source: this.sourceLabel(track.source),
        muted: track.muted
      }))
    }
  }

  private async mutePublishedSources(client: RoomServiceClient, room: string, userId: string, participant: ParticipantInfo, sources: TrackSource[]) {
    const disabled = new Set(sources)
    const tracks = (participant.tracks || []).filter((track) => disabled.has(track.source))
    const mutedTracks = await Promise.all(
      tracks.map((track) => client.mutePublishedTrack(room, userId, track.sid, true).catch(() => null))
    )
    return mutedTracks.filter(Boolean) as TrackInfo[]
  }

  private async disablePublishSources(eventId: string, userId: string, disabledSources: TrackSource[]) {
    const client = this.getRoomClient()
    const room = this.getRoomName(eventId)
    const participant = await client.getParticipant(room, userId)
    const currentSources = this.normalizePublishSources(participant.permission?.canPublishSources)
    const currentAllowed = participant.permission?.canPublish === false
      ? []
      : currentSources.length > 0
        ? currentSources
        : this.publishableSources
    const disabled = new Set(disabledSources)
    const canPublishSources = currentAllowed.filter((source) => !disabled.has(source))
    const currentPermission = participant.permission
    const updatedParticipant = await client.updateParticipant(room, userId, {
      permission: {
        canPublish: canPublishSources.length > 0,
        canPublishSources,
        canSubscribe: currentPermission?.canSubscribe !== false,
        canPublishData: currentPermission?.canPublishData !== false,
        canUpdateMetadata: Boolean(currentPermission?.canUpdateMetadata),
        canSubscribeMetrics: Boolean(currentPermission?.canSubscribeMetrics),
        canManageAgentSession: Boolean(currentPermission?.canManageAgentSession),
        hidden: Boolean(currentPermission?.hidden),
        recorder: Boolean(currentPermission?.recorder),
        agent: Boolean(currentPermission?.agent)
      }
    })
    const mutedTracks = await this.mutePublishedSources(client, room, userId, participant, disabledSources)
    return { participant: updatedParticipant, canPublishSources, mutedTracks }
  }

  private async enablePublishSources(eventId: string, userId: string, enabledSources: TrackSource[]) {
    const client = this.getRoomClient()
    const room = this.getRoomName(eventId)
    const participant = await client.getParticipant(room, userId)
    const currentSources = this.normalizePublishSources(participant.permission?.canPublishSources)
    const currentAllowed = participant.permission?.canPublish === false
      ? []
      : currentSources.length > 0
        ? currentSources
        : this.publishableSources
    const canPublishSources = Array.from(new Set([...currentAllowed, ...enabledSources]))
      .filter((source) => this.publishableSources.includes(source))
    const currentPermission = participant.permission
    const updatedParticipant = await client.updateParticipant(room, userId, {
      permission: {
        canPublish: canPublishSources.length > 0,
        canPublishSources,
        canSubscribe: currentPermission?.canSubscribe !== false,
        canPublishData: currentPermission?.canPublishData !== false,
        canUpdateMetadata: Boolean(currentPermission?.canUpdateMetadata),
        canSubscribeMetrics: Boolean(currentPermission?.canSubscribeMetrics),
        canManageAgentSession: Boolean(currentPermission?.canManageAgentSession),
        hidden: Boolean(currentPermission?.hidden),
        recorder: Boolean(currentPermission?.recorder),
        agent: Boolean(currentPermission?.agent)
      }
    })
    return { participant: updatedParticipant, canPublishSources }
  }

  async listParticipants(eventId: string) {
    const participants = await this.getRoomClient().listParticipants(this.getRoomName(eventId))
    return participants.map((participant) => this.toParticipantSummary(participant))
  }

  async muteParticipantAudio(eventId: string, userId: string) {
    const result = await this.disablePublishSources(eventId, userId, [TrackSource.MICROPHONE])
    const mutedTrack = result.mutedTracks.find((track) => track.source === TrackSource.MICROPHONE)
    return {
      eventId,
      userId,
      action: 'muted' as const,
      audioPublishAllowed: false,
      track: mutedTrack
        ? {
            sid: mutedTrack.sid,
            name: mutedTrack.name,
            source: this.sourceLabel(mutedTrack.source),
            muted: mutedTrack.muted
          }
        : undefined
    }
  }

  async disableParticipantCamera(eventId: string, userId: string) {
    const result = await this.disablePublishSources(eventId, userId, [TrackSource.CAMERA])
    return { eventId, userId, action: 'camera-disabled' as const, cameraPublishAllowed: false, tracks: result.mutedTracks }
  }

  async disableParticipantScreenShare(eventId: string, userId: string) {
    const result = await this.disablePublishSources(eventId, userId, [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO])
    return { eventId, userId, action: 'screen-share-disabled' as const, screenSharePublishAllowed: false, tracks: result.mutedTracks }
  }

  async enableParticipantAudio(eventId: string, userId: string) {
    await this.enablePublishSources(eventId, userId, [TrackSource.MICROPHONE])
    return { eventId, userId, action: 'audio-enabled' as const, audioPublishAllowed: true }
  }

  async enableParticipantCamera(eventId: string, userId: string) {
    await this.enablePublishSources(eventId, userId, [TrackSource.CAMERA])
    return { eventId, userId, action: 'camera-enabled' as const, cameraPublishAllowed: true }
  }

  async enableParticipantScreenShare(eventId: string, userId: string) {
    await this.enablePublishSources(eventId, userId, [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO])
    return { eventId, userId, action: 'screen-share-enabled' as const, screenSharePublishAllowed: true }
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
