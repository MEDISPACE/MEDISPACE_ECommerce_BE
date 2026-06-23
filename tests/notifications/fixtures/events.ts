import { ObjectId } from 'mongodb'
import { FIXED_NOW, notificationTestUserIds } from './users'

export interface CommunityVideoEventFixture {
  _id: ObjectId
  title: string
  slug: string
  status: 'draft' | 'scheduled' | 'live' | 'cancelled' | 'ended'
  scheduledStartAt: Date
  scheduledEndAt: Date
  roomId: ObjectId
  speakerId: ObjectId
  reminder15mJobId?: string
  reminders: { fifteenMinutesSentAt?: Date }
  createdAt: Date
  updatedAt: Date
}

export interface CommunityVideoEventRegistrationFixture {
  _id: ObjectId
  eventId: ObjectId
  userId: ObjectId
  status: 'registered' | 'cancelled' | 'attended'
  reminder15mSentAt?: Date
  createdAt: Date
  updatedAt: Date
}

export const eventTestIds = {
  heartCare: new ObjectId('667000000000000000000001'),
  diabetesCare: new ObjectId('667000000000000000000002'),
  room: new ObjectId('667000000000000000000101'),
  registrationCustomer: new ObjectId('667000000000000000000201'),
  registrationMultiDevice: new ObjectId('667000000000000000000202')
} as const

export function makeCommunityVideoEventFixture(
  overrides: Partial<CommunityVideoEventFixture> = {}
): CommunityVideoEventFixture {
  return {
    _id: eventTestIds.heartCare,
    title: 'Chăm sóc sức khỏe tim mạch',
    slug: 'cham-soc-suc-khoe-tim-mach',
    status: 'scheduled',
    scheduledStartAt: new Date('2026-06-22T09:00:00.000Z'),
    scheduledEndAt: new Date('2026-06-22T10:00:00.000Z'),
    roomId: eventTestIds.room,
    speakerId: notificationTestUserIds.pharmacist,
    reminder15mJobId: 'send-event-reminder:667000000000000000000001',
    reminders: {},
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides
  }
}

export function makeEventRegistrationFixture(
  overrides: Partial<CommunityVideoEventRegistrationFixture> = {}
): CommunityVideoEventRegistrationFixture {
  return {
    _id: eventTestIds.registrationCustomer,
    eventId: eventTestIds.heartCare,
    userId: notificationTestUserIds.customer,
    status: 'registered',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides
  }
}

export const eventFixtures = {
  heartCare: makeCommunityVideoEventFixture(),
  diabetesCare: makeCommunityVideoEventFixture({
    _id: eventTestIds.diabetesCare,
    title: 'Kiểm soát đường huyết tại nhà',
    slug: 'kiem-soat-duong-huyet-tai-nha'
  })
} as const

export const eventRegistrationFixtures = {
  customer: makeEventRegistrationFixture(),
  multiDeviceCustomer: makeEventRegistrationFixture({
    _id: eventTestIds.registrationMultiDevice,
    userId: notificationTestUserIds.multiDeviceCustomer
  })
} as const

export function makeEventSeed(overrides: Partial<CommunityVideoEventFixture>[] = []): CommunityVideoEventFixture[] {
  if (overrides.length === 0) return Object.values(eventFixtures).map((event) => makeCommunityVideoEventFixture(event))
  return overrides.map((override) => makeCommunityVideoEventFixture(override))
}
