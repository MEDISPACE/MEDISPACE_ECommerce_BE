import { EventEmitter } from 'events'
import { vi } from 'vitest'

export interface SocketEmission {
  room: string
  event: string
  payload: Record<string, unknown>
}

export function createMockSocketServer() {
  const emitter = new EventEmitter()
  const emissions: SocketEmission[] = []
  const joinedRooms = new Map<string, Set<string>>()

  return {
    emissions,
    join(socketId: string, room: string) {
      const rooms = joinedRooms.get(socketId) || new Set<string>()
      rooms.add(room)
      joinedRooms.set(socketId, rooms)
    },
    leave(socketId: string, room: string) {
      joinedRooms.get(socketId)?.delete(room)
    },
    roomsFor(socketId: string) {
      return Array.from(joinedRooms.get(socketId) || [])
    },
    to: vi.fn((room: string) => ({
      emit: vi.fn((event: string, payload: Record<string, unknown>) => {
        emissions.push({ room, event, payload })
        emitter.emit(`${room}:${event}`, payload)
      })
    })),
    waitFor(room: string, event = 'notification:new') {
      return new Promise<Record<string, unknown>>((resolve) => {
        emitter.once(`${room}:${event}`, resolve)
      })
    },
    reset() {
      emissions.length = 0
      joinedRooms.clear()
      this.to.mockClear()
      emitter.removeAllListeners()
    }
  }
}
