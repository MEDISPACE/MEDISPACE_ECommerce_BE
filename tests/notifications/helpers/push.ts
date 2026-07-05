import { vi } from 'vitest'

export interface MockPushPayload {
  token: string
  title: string
  body: string
  data?: Record<string, unknown>
}

export function createMockPushProvider() {
  const sent: MockPushPayload[] = []
  const expiredTokens = new Set<string>()
  const failures: Error[] = []

  return {
    sent,
    expiredTokens,
    send: vi.fn(async (payload: MockPushPayload) => {
      if (expiredTokens.has(payload.token)) return { skipped: true, reason: 'expired-token' }
      const failure = failures.shift()
      if (failure) throw failure
      sent.push(payload)
      return { messageId: `push-${sent.length}`, skipped: false }
    }),
    expireToken(token: string) {
      expiredTokens.add(token)
    },
    failNext(error = new Error('mock push provider failure')) {
      failures.push(error)
    },
    reset() {
      sent.length = 0
      expiredTokens.clear()
      failures.length = 0
      this.send.mockClear()
    }
  }
}
