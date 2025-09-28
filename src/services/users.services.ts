import User from '~/models/schemas/User.schema'
import databaseService from './database.services'
import { RegisterReqBody, UpdateMeReqBody } from '~/models/requests/User.request'
import { hashPassword } from '~/utils/crypto'
import { TokenType, UserRole, UserStatus } from '~/constants/enum'
import { signToken } from '~/utils/jwt'
import RefreshToken from '~/models/schemas/RefreshToken.schema'
import { ObjectId } from 'mongodb'
import { USERS_MESSAGES } from '~/constants/message'
import { verify } from 'crypto'
import { create } from 'lodash'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'
import axios from 'axios'

class UsersService {
  private signAccessToken({ user_id, verify }: { user_id: string; verify: UserStatus }) {
    return signToken({
      payload: {
        user_id,
        token_type: TokenType.AccessToken,
        verify
      },
      privateKey: process.env.JWT_SECRET_ACCESS_TOKEN as string,
      options: { expiresIn: '15m' }
    })
  }
  private signRefreshToken({ user_id, verify }: { user_id: string; verify: UserStatus }) {
    return signToken({
      payload: {
        user_id,
        token_type: TokenType.RefreshToken,
        verify
      },
      privateKey: process.env.JWT_SECRET_REFRESH_TOKEN as string,
      options: { expiresIn: '100d' }
    })
  }
  private signAccessAndRefreshToken({ user_id, verify }: { user_id: string; verify: UserStatus }) {
    return Promise.all([this.signAccessToken({ user_id, verify }), this.signRefreshToken({ user_id, verify })])
  }
  private signEmailVerifyToken({ user_id, verify }: { user_id: string; verify: UserStatus }) {
    return signToken({
      payload: {
        user_id,
        token_type: TokenType.EmailVerifyToken,
        verify
      },
      privateKey: process.env.JWT_SECRET_EMAIL_VERIFY_TOKEN as string,
      options: { expiresIn: '7d' }
    })
  }
  private signForgotPasswordToken({ user_id, status }: { user_id: string; status: UserStatus }) {
    return signToken({
      payload: {
        user_id,
        token_type: TokenType.ForgotPasswordToken,
        status
      },
      privateKey: process.env.JWT_SECRET_FORGOT_PASSWORD_TOKEN as string,
      options: { expiresIn: '7d' }
    })
  }
  // private async getOauthGoogleToken(code: string) {
  //   const body = {
  //     code,
  //     client_id: process.env.GOOGLE_CLIENT_ID,
  //     client_secret: process.env.GOOGLE_CLIENT_SECRET,
  //     redirect_uri: process.env.GOOGLE_REDIRECT_URI,
  //     grant_type: 'authorization_code'
  //   }
  //   const { data } = await axios.post('https://oauth2.googleapis.com/token', body, {
  //     headers: {
  //       'Content-Type': 'application/x-www-form-urlencoded'
  //     }
  //   })
  //   return data as { id_token: string; access_token: string }
  // }
  // private async getGoogleUserInfo(access_token: string, id_token: string) {
  //   const { data } = await axios.get(
  //     `https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${access_token}`,
  //     {
  //       headers: {
  //         Authorization: `Bearer ${id_token}`
  //       }
  //     }
  //   )
  //   return data as {
  //     id: string
  //     email: string
  //     verified_email: boolean
  //     name: string
  //     given_name: string
  //     family_name: string
  //     picture: string
  //     locale: string
  //   }
  // }
  async register(payload: RegisterReqBody) {
    const user_id = new ObjectId()
    const emailVerifyToken = await this.signEmailVerifyToken({
      user_id: user_id.toString(),
      verify: UserStatus.Unverified
    })
    await databaseService.users.insertOne(
      new User({
        ...payload,
        _id: user_id,
        emailVerifyToken,
        password: hashPassword(payload.password),
        role: UserRole.Customer,
        status: UserStatus.Unverified
      })
    )
    const [access_token, refresh_token] = await this.signAccessAndRefreshToken({
      user_id: user_id.toString(),
      verify: UserStatus.Unverified
    })
    await databaseService.refreshTokens.insertOne(
      new RefreshToken({
        user_id: new ObjectId(user_id),
        token: refresh_token
      })
    )
    return { access_token, refresh_token }
  }
  async refreshToken({
    user_id,
    verify,
    refresh_token
  }: {
    user_id: string
    verify: UserStatus
    refresh_token: string
  }) {
    const [new_access_token, new_refresh_token] = await Promise.all([
      this.signAccessToken({ user_id, verify }),
      this.signRefreshToken({ user_id, verify }),
      databaseService.refreshTokens.deleteOne({ token: refresh_token })
    ])
    await databaseService.refreshTokens.insertOne(
      new RefreshToken({
        user_id: new ObjectId(user_id),
        token: new_refresh_token as string
      })
    )
    return { access_token: new_access_token, refresh_token: new_refresh_token }
  }
  async checkEmailExists(email: string) {
    const user = await databaseService.users.findOne({ email })
    return !!user
  }
  async login({ user_id, user_verify }: { user_id: string; user_verify: UserStatus }) {
    const [access_token, refresh_token] = await this.signAccessAndRefreshToken({
      user_id,
      verify: user_verify
    })
    await databaseService.refreshTokens.insertOne(
      new RefreshToken({
        user_id: new ObjectId(user_id),
        token: refresh_token
      })
    )
    return { access_token, refresh_token }
  }
  // async oauth(code: string) {
  //   // Gọi Google API để lấy thông tin user
  //   // Nếu email chưa tồn tại trong database thì tạo mới user
  //   // Nếu email đã tồn tại trong database thì bỏ qua bước tạo mới user
  //   // Trả về access token và refresh token cho client
  //   const { id_token, access_token } = await this.getOauthGoogleToken(code)
  //   const userInfo = await this.getGoogleUserInfo(access_token, id_token)
  //   if (!userInfo.verified_email) {
  //     throw new ErrorWithStatus({
  //       message: USERS_MESSAGES.GMAIL_NOT_VERIFIED,
  //       status: HTTP_STATUS.UNAUTHORIZED
  //     })
  //   }
  //   const user = await databaseService.users.findOne({ email: userInfo.email })
  //   if (user) {
  //     const [access_token, refresh_token] = await this.signAccessAndRefreshToken({
  //       user_id: user._id.toString(),
  //       verify: user.verify
  //     })
  //     await databaseService.refreshTokens.insertOne(
  //       new RefreshToken({
  //         user_id: user._id,
  //         token: refresh_token
  //       })
  //     )
  //     return {
  //       access_token,
  //       refresh_token,
  //       newUser: 0,
  //       verify: user.verify
  //     }
  //   } else {
  //     const randomPassword = Math.random().toString(36).slice(-8)
  //     const data = await this.register({
  //       name: userInfo.name,
  //       email: userInfo.email,
  //       password: randomPassword,
  //       confirm_password: randomPassword,
  //       date_of_birth: new Date().toISOString()
  //     })
  //     return { ...data, newUser: true }
  //   }
  // }
  async logout(refresh_token: string) {
    await databaseService.refreshTokens.deleteOne({ token: refresh_token })
    return {
      message: USERS_MESSAGES.LOGOUT_SUCCESS
    }
  }
  async verifyEmail(user_id: string) {
    const [token] = await Promise.all([
      this.signAccessAndRefreshToken({ user_id, verify: UserStatus.Verified }),
      databaseService.users.updateOne(
        { _id: new ObjectId(user_id) },
        {
          $set: { emailVerifyToken: '', status: UserStatus.Verified },
          $currentDate: { updated_at: true }
        }
      )
    ])
    const [access_token, refresh_token] = token
    return {
      access_token,
      refresh_token,
      newUser: 1,
      status: UserStatus.Unverified
    }
  }
  async resendVerifyEmail(user_id: string) {
    const emailVerifyToken = await this.signEmailVerifyToken({ user_id, verify: UserStatus.Unverified })
    await databaseService.users.updateOne(
      { _id: new ObjectId(user_id) },
      { $set: { emailVerifyToken }, $currentDate: { updated_at: true } }
    )
    return {
      message: USERS_MESSAGES.RESEND_EMAIL_VERIFY_SUCCESS
    }
  }
  async forgotPassword({ user_id, status }: { user_id: string; status: UserStatus }) {
    const forgot_password_token = await this.signForgotPasswordToken({ user_id, status })
    await databaseService.users.updateOne(
      { _id: new ObjectId(user_id) },
      { $set: { forgot_password_token }, $currentDate: { updated_at: true } }
    )
    return {
      message: USERS_MESSAGES.FORGOT_PASSWORD_EMAIL_SENT
    }
  }
  // async resetPassword(user_id: string, new_password: string) {
  //   await databaseService.users.updateOne(
  //     { _id: new ObjectId(user_id) },
  //     { $set: { password: hashPassword(new_password), forgot_password_token: '' }, $currentDate: { updated_at: true } }
  //   )
  //   return {
  //     message: USERS_MESSAGES.RESET_PASSWORD_SUCCESS
  //   }
  // }
  // async getMe(user_id: string) {
  //   const user = await databaseService.users.findOne(
  //     { _id: new ObjectId(user_id) },
  //     { projection: { password: 0, email_verify_token: 0, forgot_password_token: 0 } }
  //   )
  //   if (!user) {
  //     throw new ErrorWithStatus({
  //       message: USERS_MESSAGES.USER_NOT_FOUND,
  //       status: HTTP_STATUS.NOT_FOUND
  //     })
  //   }
  //   return user
  // }
  // async updateMe(user_id: string, payload: UpdateMeReqBody) {
  //   const _payload = payload.date_of_birth ? { ...payload, date_of_birth: new Date(payload.date_of_birth) } : payload
  //   const user = await databaseService.users.findOneAndUpdate(
  //     { _id: new ObjectId(user_id) },
  //     { $set: { ...(_payload as UpdateMeReqBody & { date_of_birth?: Date }) }, $currentDate: { updated_at: true } },
  //     { returnDocument: 'after' }
  //   )
  //   return user
  // }
  // async getProfile(username: string) {
  //   const user = await databaseService.users.findOne(
  //     { username },
  //     {
  //       projection: {
  //         password: 0,
  //         email_verify_token: 0,
  //         forgot_password_token: 0,
  //         verify: 0,
  //         created_at: 0,
  //         updated_at: 0
  //       }
  //     }
  //   )
  //   if (!user) {
  //     throw new ErrorWithStatus({
  //       message: USERS_MESSAGES.USER_NOT_FOUND,
  //       status: HTTP_STATUS.NOT_FOUND
  //     })
  //   }
  //   return user
  // }
  // async changePassword(user_id: string, new_password: string) {
  //   await databaseService.users.updateOne(
  //     { _id: new ObjectId(user_id) },
  //     { $set: { password: hashPassword(new_password) }, $currentDate: { updated_at: true } }
  //   )
  //   return {
  //     message: USERS_MESSAGES.RESET_PASSWORD_SUCCESS
  //   }
  // }
}
const usersService = new UsersService()
export default usersService
