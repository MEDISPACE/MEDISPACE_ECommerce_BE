import { ObjectId } from 'mongodb'
import { UserGender, UserRole, UserStatus } from '~/constants/enum'
import { hashPassword } from '~/utils/crypto'

export const notificationTestUserIds = {
  customer: new ObjectId('665000000000000000000001'),
  optedOutCustomer: new ObjectId('665000000000000000000002'),
  marketingOptedOutCustomer: new ObjectId('665000000000000000000003'),
  multiDeviceCustomer: new ObjectId('665000000000000000000004'),
  unverifiedCustomer: new ObjectId('665000000000000000000005'),
  bannedCustomer: new ObjectId('665000000000000000000006'),
  pharmacist: new ObjectId('665000000000000000000101'),
  secondPharmacist: new ObjectId('665000000000000000000102'),
  admin: new ObjectId('665000000000000000000201'),
  secondAdmin: new ObjectId('665000000000000000000202')
} as const

export type NotificationPreferenceChannel = 'inApp' | 'email' | 'push' | 'sms'

export type NotificationPreferenceType =
  | 'order'
  | 'payment'
  | 'shipping'
  | 'prescription'
  | 'promotion'
  | 'reminder'
  | 'system'
  | 'review'
  | 'return'
  | 'security'
  | 'community'

export interface NotificationPreferenceFixture {
  channels: Record<NotificationPreferenceChannel, boolean>
  types: Record<NotificationPreferenceType, boolean>
}

export interface DeviceTokenFixture {
  token: string
  provider: 'fcm' | 'apns' | 'onesignal' | 'mock'
  platform: 'web' | 'ios' | 'android'
  isActive: boolean
  lastSeenAt: Date
}

export interface NotificationUserFixture {
  _id: ObjectId
  email: string
  password: string
  role: UserRole
  status: UserStatus
  created_by: ObjectId
  firstName: string
  lastName: string
  phoneNumber: string
  dateOfBirth: Date
  gender: UserGender
  avatar: string
  addresses: Array<{
    _id: ObjectId
    type: 'home' | 'work'
    firstName: string
    lastName: string
    phone: string
    address: string
    ward: string
    district: string
    province: string
    isDefault: boolean
  }>
  medicalProfile: Record<string, unknown>
  lisenseNumber: string
  isOnline: boolean
  onlineCount: number
  emailVerifyToken: string
  forgotPasswordToken: string
  notificationPreferences: NotificationPreferenceFixture
  deviceTokens: DeviceTokenFixture[]
  createdAt: Date
  updatedAt: Date
  wishlist: ObjectId[]
}

export const DEFAULT_TEST_PASSWORD = 'Password@123'
export const DEFAULT_TEST_PASSWORD_HASH = hashPassword(DEFAULT_TEST_PASSWORD)
export const FIXED_NOW = new Date('2026-06-22T08:00:00.000Z')

export const defaultNotificationPreferences: NotificationPreferenceFixture = {
  channels: {
    inApp: true,
    email: true,
    push: false,
    sms: false
  },
  types: {
    order: true,
    payment: true,
    shipping: true,
    prescription: true,
    promotion: true,
    reminder: true,
    system: true,
    review: true,
    return: true,
    security: true,
    community: true
  }
}

export const allNotificationsOffPreferences: NotificationPreferenceFixture = {
  channels: {
    inApp: false,
    email: false,
    push: false,
    sms: false
  },
  types: {
    order: false,
    payment: false,
    shipping: false,
    prescription: false,
    promotion: false,
    reminder: false,
    system: false,
    review: false,
    return: false,
    security: false,
    community: false
  }
}

export const marketingOptOutPreferences: NotificationPreferenceFixture = {
  ...defaultNotificationPreferences,
  types: {
    ...defaultNotificationPreferences.types,
    promotion: false,
    community: false
  }
}

export const emailOffPreferences: NotificationPreferenceFixture = {
  ...defaultNotificationPreferences,
  channels: {
    ...defaultNotificationPreferences.channels,
    email: false
  }
}

export const pushOnPreferences: NotificationPreferenceFixture = {
  ...defaultNotificationPreferences,
  channels: {
    ...defaultNotificationPreferences.channels,
    push: true
  }
}

export function cloneNotificationPreferences(
  preferences: NotificationPreferenceFixture = defaultNotificationPreferences
): NotificationPreferenceFixture {
  return {
    channels: { ...preferences.channels },
    types: { ...preferences.types }
  }
}

export function makeDeviceToken(overrides: Partial<DeviceTokenFixture> = {}): DeviceTokenFixture {
  return {
    token: 'mock-fcm-token-web-001',
    provider: 'mock',
    platform: 'web',
    isActive: true,
    lastSeenAt: FIXED_NOW,
    ...overrides
  }
}

export function makeNotificationUser(
  overrides: Partial<NotificationUserFixture> = {}
): NotificationUserFixture {
  const id = overrides._id || notificationTestUserIds.customer
  const role = overrides.role ?? UserRole.Customer
  const isPharmacist = role === UserRole.Pharmacist

  return {
    _id: id,
    email: `user-${id.toString().slice(-6)}@medispace.test`,
    password: DEFAULT_TEST_PASSWORD_HASH,
    role,
    status: UserStatus.Verified,
    created_by: id,
    firstName: 'An',
    lastName: 'Nguyen',
    phoneNumber: '0900000001',
    dateOfBirth: new Date('1995-01-15T00:00:00.000Z'),
    gender: UserGender.Male,
    avatar: '',
    addresses: [
      {
        _id: new ObjectId('665000000000000000010001'),
        type: 'home',
        firstName: 'An',
        lastName: 'Nguyen',
        phone: '0900000001',
        address: '01 Vo Van Ngan',
        ward: 'Linh Chieu',
        district: 'Thu Duc',
        province: 'Ho Chi Minh',
        isDefault: true
      }
    ],
    medicalProfile: {},
    lisenseNumber: isPharmacist ? `PHAR-${id.toString().slice(-6)}` : '',
    isOnline: false,
    onlineCount: 0,
    emailVerifyToken: '',
    forgotPasswordToken: '',
    notificationPreferences: cloneNotificationPreferences(),
    deviceTokens: [],
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    wishlist: [],
    ...overrides,
    notificationPreferences: cloneNotificationPreferences(
      overrides.notificationPreferences || defaultNotificationPreferences
    ),
    deviceTokens: [...(overrides.deviceTokens || [])],
    addresses: overrides.addresses ? [...overrides.addresses] : [
      {
        _id: new ObjectId('665000000000000000010001'),
        type: 'home',
        firstName: 'An',
        lastName: 'Nguyen',
        phone: '0900000001',
        address: '01 Vo Van Ngan',
        ward: 'Linh Chieu',
        district: 'Thu Duc',
        province: 'Ho Chi Minh',
        isDefault: true
      }
    ]
  }
}

export const notificationUserFixtures = {
  customer: makeNotificationUser({
    _id: notificationTestUserIds.customer,
    email: 'customer.notifications@medispace.test',
    firstName: 'Minh',
    lastName: 'Tran'
  }),
  optedOutCustomer: makeNotificationUser({
    _id: notificationTestUserIds.optedOutCustomer,
    email: 'customer.opted-out@medispace.test',
    notificationPreferences: allNotificationsOffPreferences
  }),
  marketingOptedOutCustomer: makeNotificationUser({
    _id: notificationTestUserIds.marketingOptedOutCustomer,
    email: 'customer.marketing-off@medispace.test',
    notificationPreferences: marketingOptOutPreferences
  }),
  multiDeviceCustomer: makeNotificationUser({
    _id: notificationTestUserIds.multiDeviceCustomer,
    email: 'customer.multi-device@medispace.test',
    notificationPreferences: pushOnPreferences,
    deviceTokens: [
      makeDeviceToken({ token: 'mock-fcm-token-web-001', platform: 'web' }),
      makeDeviceToken({ token: 'mock-fcm-token-ios-001', platform: 'ios' }),
      makeDeviceToken({ token: 'mock-fcm-token-android-001', platform: 'android' })
    ]
  }),
  unverifiedCustomer: makeNotificationUser({
    _id: notificationTestUserIds.unverifiedCustomer,
    email: 'customer.unverified@medispace.test',
    status: UserStatus.Unverified,
    emailVerifyToken: 'mock-email-verify-token'
  }),
  bannedCustomer: makeNotificationUser({
    _id: notificationTestUserIds.bannedCustomer,
    email: 'customer.banned@medispace.test',
    status: UserStatus.Banned
  }),
  pharmacist: makeNotificationUser({
    _id: notificationTestUserIds.pharmacist,
    email: 'pharmacist.notifications@medispace.test',
    firstName: 'Lan',
    lastName: 'Pham',
    role: UserRole.Pharmacist,
    lisenseNumber: 'PHAR-000101'
  }),
  secondPharmacist: makeNotificationUser({
    _id: notificationTestUserIds.secondPharmacist,
    email: 'pharmacist.second@medispace.test',
    firstName: 'Hoa',
    lastName: 'Le',
    role: UserRole.Pharmacist,
    lisenseNumber: 'PHAR-000102'
  }),
  admin: makeNotificationUser({
    _id: notificationTestUserIds.admin,
    email: 'admin.notifications@medispace.test',
    firstName: 'Bao',
    lastName: 'Tran',
    role: UserRole.Admin
  }),
  secondAdmin: makeNotificationUser({
    _id: notificationTestUserIds.secondAdmin,
    email: 'admin.second@medispace.test',
    firstName: 'Nhi',
    lastName: 'Vo',
    role: UserRole.Admin
  })
} as const

export const allNotificationUsers = Object.values(notificationUserFixtures)

export function makeUserSeed(overrides: Partial<NotificationUserFixture>[] = []): NotificationUserFixture[] {
  if (overrides.length === 0) return allNotificationUsers.map((user) => makeNotificationUser(user))
  return overrides.map((override) => makeNotificationUser(override))
}

