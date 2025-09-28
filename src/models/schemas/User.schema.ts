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

  address?: Address

  medicalProfile?: MedicalProfile

  lisenseNumber?: string
  isOnline?: boolean

  emailVerifyToken?: string
  forgotPasswordToken?: string

  createdAt?: Date
  updatedAt?: Date
}
export default class User {
  _id?: ObjectId
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

  address: Address

  medicalProfile: MedicalProfile

  lisenseNumber: string
  isOnline: boolean

  emailVerifyToken: string
  forgotPasswordToken: string

  createdAt: Date
  updatedAt: Date

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
    this.address = user.address || { address: '', ward: '', city: '', isDefault: true }
    this.medicalProfile = user.medicalProfile || {}
    this.lisenseNumber = user.lisenseNumber || ''
    this.isOnline = user.isOnline || false

    this.emailVerifyToken = user.emailVerifyToken || ''
    this.forgotPasswordToken = user.forgotPasswordToken || ''

    this.createdAt = user.createdAt || date
    this.updatedAt = user.updatedAt || date
  }
}
