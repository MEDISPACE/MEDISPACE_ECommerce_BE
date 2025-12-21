import { JwtPayload } from 'jsonwebtoken'
import { TokenType, UserStatus } from '~/constants/enum'

export interface Address {
  id?: string
  name: string
  phone: string
  province: string
  district: string
  ward: string
  address: string
  type: 'home' | 'office' | 'other'
  isDefault: boolean
  provinceId?: number
  districtId?: number
  wardCode?: string
}

export interface MedicalProfile {
  bloodType?: string
  height?: number
  weight?: number
  allergies?: string[]
  chronicConditions?: string[]
}

export interface LoginReqBody {
  email: string
  password: string
  rememberMe?: boolean
}
export interface RegisterReqBody {
  firstName: string
  lastName: string
  email: string
  password: string
  confirm_password: string
  phoneNumber: string
  gender: number
}
export interface TokenPayload extends JwtPayload {
  userId: string
  tokenType: TokenType
  verify: UserStatus
}
export interface LogoutReqBody {
  refreshToken: string
}
export interface RefreshTokenReqBody {
  refreshToken: string
}
export interface VerifyEmailReqBody {
  emailVerifyToken: string
}
export interface ForgotPasswordReqBody {
  email: string
}
export interface VerifyForgotPasswordTokenReqBody {
  forgotPasswordToken: string
}
export interface ResetPasswordReqBody {
  forgotPasswordToken: string
  password: string
  confirm_password: string
}
export interface UpdateMeReqBody {
  firstName?: string
  lastName?: string
  phoneNumber?: string
  dateOfBirth?: string
  gender?: number
  avatar?: string
  addresses?: Address[]
  lisenseNumber?: string
}
export interface ChangePasswordReqBody {
  currentPassword: string
  password: string
  confirmPassword: string
}
