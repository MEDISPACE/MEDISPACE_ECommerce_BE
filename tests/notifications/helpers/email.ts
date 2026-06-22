import { vi } from 'vitest'

export interface MockEmailMessage {
  to: string
  subject: string
  html: string
  text?: string
  headers?: Record<string, string>
}

export function createMockEmailProvider() {
  const sent: MockEmailMessage[] = []
  const failures: Error[] = []

  return {
    sent,
    send: vi.fn(async (message: MockEmailMessage) => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to)) {
        return { skipped: true, reason: 'invalid-email' }
      }
      const failure = failures.shift()
      if (failure) throw failure
      sent.push(message)
      return { messageId: `email-${sent.length}`, skipped: false }
    }),
    failNext(error = new Error('mock email provider failure')) {
      failures.push(error)
    },
    reset() {
      sent.length = 0
      failures.length = 0
      this.send.mockClear()
    }
  }
}
