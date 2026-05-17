import { ObjectId } from 'mongodb'
import { UserGender, UserRole, UserStatus } from '~/constants/enum'
import { Address, MedicalProfile } from '../requests/User.request'

interface UserType {
  _id?: ObjectId
  email: string
  password: string
  role: UserRole
  status: UserStatus
  created_by?: ObjectId

  firstName: string
  lastName: string
  phoneNumber?: string
  dateOfBirth?: Date
  gender?: UserGender
  avatar?: string

  addresses?: Address[]

  medicalProfile?: MedicalProfile

  lisenseNumber?: string
  isOnline?: boolean
  onlineCount?: number

  emailVerifyToken?: string
  forgotPasswordToken?: string

  createdAt?: Date
  updatedAt?: Date
  wishlist?: ObjectId[]
}
export default class User {
  _id?: ObjectId
  email: string
  password: string
  role: UserRole
  status: UserStatus
  created_by?: ObjectId

  firstName: string
  lastName: string
  phoneNumber?: string
  dateOfBirth?: Date
  gender?: UserGender
  avatar?: string

  addresses?: Address[]

  medicalProfile?: MedicalProfile

  lisenseNumber?: string
  isOnline?: boolean
  onlineCount?: number

  emailVerifyToken?: string
  forgotPasswordToken?: string

  createdAt?: Date
  updatedAt?: Date
  wishlist: ObjectId[]

  constructor(user: UserType) {
    const date = new Date()
    this._id = user._id
    this.email = user.email
    this.password = user.password
    this.role = user.role
    this.status = user.status || UserStatus.Unverified
    this.created_by = user.created_by || this._id || new ObjectId()

    this.firstName = user.firstName || ''
    this.lastName = user.lastName || ''
    this.phoneNumber = user.phoneNumber || ''
    this.dateOfBirth = user.dateOfBirth || new Date()
    this.gender = user.gender || 1
    this.avatar = user.avatar || ''
    this.addresses = user.addresses || []
    this.medicalProfile = user.medicalProfile || {}
    this.lisenseNumber = user.lisenseNumber || ''
    this.isOnline = user.isOnline || false
    this.onlineCount = user.onlineCount || 0

    this.emailVerifyToken = user.emailVerifyToken || ''
    this.forgotPasswordToken = user.forgotPasswordToken || ''

    this.createdAt = user.createdAt || date
    this.updatedAt = user.updatedAt || date
    this.wishlist = user.wishlist || []
  }
}
