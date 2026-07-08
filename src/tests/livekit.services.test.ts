import { beforeEach, describe, expect, it, vi } from 'vitest'

const { roomClient, roomServiceClientMock, TrackSource } = vi.hoisted(() => {
  const TrackSource = {
    UNKNOWN: 0,
    CAMERA: 1,
    MICROPHONE: 2,
    SCREEN_SHARE: 3,
    SCREEN_SHARE_AUDIO: 4
  }
  const roomClient = {
    getParticipant: vi.fn(),
    listParticipants: vi.fn(),
    mutePublishedTrack: vi.fn(),
    updateParticipant: vi.fn(),
    removeParticipant: vi.fn()
  }
  return {
    TrackSource,
    roomClient,
    roomServiceClientMock: vi.fn(function () {
      return roomClient
    })
  }
})

vi.mock('livekit-server-sdk', () => ({
  TrackSource,
  RoomServiceClient: roomServiceClientMock,
  AccessToken: vi.fn(() => ({ addGrant: vi.fn(), toJwt: vi.fn().mockResolvedValue('livekit-token') }))
}))

describe('LiveKitService', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.LIVEKIT_API_KEY = 'api-key'
    process.env.LIVEKIT_API_SECRET = 'api-secret'
    process.env.LIVEKIT_WS_URL = 'wss://livekit.test'
  })

  it('keeps previous publish locks when disabling microphone, camera, then screen share', async () => {
    let permission: any = {
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canPublishSources: []
    }
    const tracks = [
      { sid: 'TR_MIC', source: TrackSource.MICROPHONE, name: 'mic', muted: false },
      { sid: 'TR_CAM', source: TrackSource.CAMERA, name: 'cam', muted: false },
      { sid: 'TR_SCREEN', source: TrackSource.SCREEN_SHARE, name: 'screen', muted: false },
      { sid: 'TR_SCREEN_AUDIO', source: TrackSource.SCREEN_SHARE_AUDIO, name: 'screen-audio', muted: false }
    ]

    roomClient.getParticipant.mockImplementation(async () => ({ identity: 'user-1', permission, tracks }))
    roomClient.updateParticipant.mockImplementation(async (_room, _userId, options) => {
      permission = options.permission
      return { identity: 'user-1', permission, tracks }
    })
    roomClient.mutePublishedTrack.mockImplementation(async (_room, _userId, trackSid) => {
      const track = tracks.find((item) => item.sid === trackSid)
      return { ...track, muted: true }
    })

    const { default: liveKitService } = await import('~/services/livekit.services')

    await liveKitService.muteParticipantAudio('event-1', 'user-1')
    await liveKitService.disableParticipantCamera('event-1', 'user-1')
    await liveKitService.disableParticipantScreenShare('event-1', 'user-1')
    await liveKitService.enableParticipantAudio('event-1', 'user-1')

    const permissionUpdates = roomClient.updateParticipant.mock.calls.map((call) => call[2].permission)
    expect(permissionUpdates[0]).toMatchObject({ canPublish: true, canPublishSources: [TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] })
    expect(permissionUpdates[1]).toMatchObject({ canPublish: true, canPublishSources: [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] })
    expect(permissionUpdates[2]).toMatchObject({ canPublish: false, canPublishSources: [] })
    expect(permissionUpdates[3]).toMatchObject({ canPublish: true, canPublishSources: [TrackSource.MICROPHONE] })
    expect(roomClient.mutePublishedTrack).toHaveBeenCalledWith('medispace-event-event-1', 'user-1', 'TR_MIC', true)
    expect(roomClient.mutePublishedTrack).toHaveBeenCalledWith('medispace-event-event-1', 'user-1', 'TR_CAM', true)
    expect(roomClient.mutePublishedTrack).toHaveBeenCalledWith('medispace-event-event-1', 'user-1', 'TR_SCREEN', true)
    expect(roomClient.mutePublishedTrack).toHaveBeenCalledWith('medispace-event-event-1', 'user-1', 'TR_SCREEN_AUDIO', true)
  })
})
