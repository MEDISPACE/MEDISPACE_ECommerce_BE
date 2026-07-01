import type { ObjectId } from 'mongodb'
import { pharmacistIds } from '../fixtures/pharmacists'

export interface TestTokenPayload {
  userId: string
  role: number
  expired?: boolean
}

export function makeTestToken(payload: TestTokenPayload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

export function authHeader(payload: TestTokenPayload) {
  return { Authorization: `Bearer ${makeTestToken(payload)}` }
}

export function pharmacistAuth(id: ObjectId = pharmacistIds.licensedOnline) {
  return authHeader({ userId: id.toString(), role: 1 })
}

export function customerAuth(id: ObjectId = pharmacistIds.customerRole) {
  return authHeader({ userId: id.toString(), role: 0 })
}

export function expiredAuth(id: ObjectId = pharmacistIds.licensedOnline) {
  return authHeader({ userId: id.toString(), role: 1, expired: true })
}

export function parseTestToken(header?: string) {
  if (!header?.startsWith('Bearer ')) return null
  try {
    return JSON.parse(Buffer.from(header.slice('Bearer '.length), 'base64url').toString('utf8')) as TestTokenPayload
  } catch {
    return null
  }
}
