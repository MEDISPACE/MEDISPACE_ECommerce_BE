import { JwtPayload } from 'jsonwebtoken'
import { TokenType, UserStatus } from '~/constants/enum'
import { ParamsDictionary } from 'express-serve-static-core'
import User from '../schemas/User.schema'

export interface Address {
  address: string
  ward: string
  city: string
  isDefault: boolean
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
  user_id: string
  token_type: TokenType
  verify: UserStatus
}
export interface LogoutReqBody {
  refresh_token: string
}
export interface RefreshTokenReqBody {
  refresh_token: string
}
export interface VerifyEmailReqBody {
  email_verify_token: string
}
export interface ForgotPasswordReqBody {
  email: string
}
export interface VerifyForgotPasswordTokenReqBody {
  forgot_password_token: string
}
export interface ResetPasswordReqBody {
  forgot_password_token: string
  password: string
  confirm_password: string
}
export interface UpdateMeReqBody {
  name?: string
  date_of_birth?: string
  bio?: string
  location?: string
  website?: string
  avatar?: string
  cover_photo?: string
  username?: string
}
export interface GetProfileReqParams {
  username: string
}
export interface FollowUserReqBody {
  follow_user_id: string
}
export interface UnFollowUserReqParams extends ParamsDictionary {
  user_id: string
}
export interface ChangePasswordReqBody {
  current_password: string
  password: string
  confirm_password: string
}