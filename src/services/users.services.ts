import User from '~/models/schemas/User.schema'
import databaseService from './database.services'
import { RegisterReqBody, UpdateMeReqBody } from '~/models/requests/User.request'
import { hashPassword } from '~/utils/crypto'
import { TokenType, UserRole, UserStatus } from '~/constants/enum'
import { signToken } from '~/utils/jwt'
import RefreshToken from '~/models/schemas/RefreshToken.schema'
import { ObjectId } from 'mongodb'
import { USERS_MESSAGES } from '~/constants/message'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'
import axios from 'axios'

class UsersService {
  private signAccessToken({ userId, verify }: { userId: string; verify: UserStatus }) {
    return signToken({
      payload: {
        userId,
        tokenType: TokenType.AccessToken,
        verify
      },
      privateKey: process.env.JWT_SECRET_ACCESS_TOKEN as string,
      options: { expiresIn: '15m' }
    })
  }
  private signRefreshToken({
    userId,
    verify,
    expiresIn = '30d'
  }: {
    userId: string
    verify: UserStatus
    expiresIn?: string | number
  }) {
    return signToken({
      payload: {
        userId,
        tokenType: TokenType.RefreshToken,
        verify
      },
      privateKey: process.env.JWT_SECRET_REFRESH_TOKEN as string,
      options: { expiresIn: expiresIn as '30d' | '90d' }
    })
  }
  private signAccessAndRefreshToken({ userId, verify }: { userId: string; verify: UserStatus }) {
    return Promise.all([this.signAccessToken({ userId, verify }), this.signRefreshToken({ userId, verify })])
  }
  private signEmailVerifyToken({ userId, verify }: { userId: string; verify: UserStatus }) {
    return signToken({
      payload: {
        userId,
        tokenType: TokenType.EmailVerifyToken,
        verify
      },
      privateKey: process.env.JWT_SECRET_EMAIL_VERIFY_TOKEN as string,
      options: { expiresIn: '7d' }
    })
  }
  private signForgotPasswordToken({ userId, status }: { userId: string; status: UserStatus }) {
    return signToken({
      payload: {
        userId,
        tokenType: TokenType.ForgotPasswordToken,
        status
      },
      privateKey: process.env.JWT_SECRET_FORGOT_PASSWORD_TOKEN as string,
      options: { expiresIn: '7d' }
    })
  }

  async register(payload: RegisterReqBody) {
    const userId = new ObjectId()
    const emailVerifyToken = await this.signEmailVerifyToken({
      userId: userId.toString(),
      verify: UserStatus.Unverified
    })
    await databaseService.users.insertOne(
      new User({
        ...payload,
        _id: userId,
        emailVerifyToken,
        password: hashPassword(payload.password),
        role: UserRole.Customer,
        status: UserStatus.Unverified
      })
    )
    const [accessToken, refreshToken] = await this.signAccessAndRefreshToken({
      userId: userId.toString(),
      verify: UserStatus.Unverified
    })
    await databaseService.refreshTokens.insertOne(
      new RefreshToken({
        userId: new ObjectId(userId),
        token: refreshToken
      })
    )
    return { accessToken, refreshToken }
  }
  async refreshToken({ userId, verify, refreshToken }: { userId: string; verify: UserStatus; refreshToken: string }) {
    const [newAccessToken, newRefreshToken] = await Promise.all([
      this.signAccessToken({ userId, verify }),
      this.signRefreshToken({ userId, verify })
    ])
    await databaseService.refreshTokens.deleteOne({ token: refreshToken })
    await databaseService.refreshTokens.insertOne(
      new RefreshToken({
        userId: new ObjectId(userId),
        token: newRefreshToken as string
      })
    )
    return { accessToken: newAccessToken, refreshToken: newRefreshToken }
  }
  async checkEmailExists(email: string) {
    const user = await databaseService.users.findOne({ email })
    return !!user
  }

  private async getOauthGoogleToken(code: string) {
    const body = {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    }
    const { data } = await axios.post('https://oauth2.googleapis.com/token', body, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return data as { id_token: string; access_token: string }
  }

  private async getGoogleUserInfo(access_token: string, id_token: string) {
    const { data } = await axios.get(
      `https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${access_token}`,
      {
        headers: {
          Authorization: `Bearer ${id_token}`
        }
      }
    )
    return data as {
      id: string
      email: string
      verified_email: boolean
      name: string
      given_name: string
      family_name: string
      picture: string
      locale: string
    }
  }

  async login({
    userId,
    userVerify,
    rememberMe = false
  }: {
    userId: string
    userVerify: UserStatus
    rememberMe?: boolean
  }) {
    const refreshTokenExpiresIn = rememberMe ? '90d' : '30d'
    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken({ userId, verify: userVerify }),
      this.signRefreshToken({ userId, verify: userVerify, expiresIn: refreshTokenExpiresIn })
    ])
    await databaseService.refreshTokens.insertOne(
      new RefreshToken({
        userId: new ObjectId(userId),
        token: refreshToken
      })
    )
    return { accessToken, refreshToken }
  }
  async oauth(code: string) {
    // Gọi Google API để lấy thông tin user
    // Nếu email chưa tồn tại trong database thì tạo mới user
    // Nếu email đã tồn tại trong database thì bỏ qua bước tạo mới user
    // Trả về access token và refresh token cho client
    const { id_token, access_token } = await this.getOauthGoogleToken(code)
    const userInfo = await this.getGoogleUserInfo(access_token, id_token)
    // console.log(userInfo)
    if (!userInfo.verified_email) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.GMAIL_NOT_VERIFIED,
        status: HTTP_STATUS.UNAUTHORIZED
      })
    }

    const user = await databaseService.users.findOne({ email: userInfo.email })
    if (user) {
      const [accessToken, refreshToken] = await this.signAccessAndRefreshToken({
        userId: user._id.toString(),
        verify: user.status
      })
      await databaseService.refreshTokens.insertOne(
        new RefreshToken({
          userId: user._id,
          token: refreshToken
        })
      )
      return {
        accessToken,
        refreshToken,
        newUser: 0,
        verify: user.status
      }
    } else {
      const randomPassword = Math.random().toString(36).slice(-8)
      const nameParts = userInfo.name.split(' ')
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''
      const data = await this.register({
        firstName,
        lastName,
        email: userInfo.email,
        password: randomPassword,
        confirm_password: randomPassword,
        phoneNumber: '',
        gender: 0
      })
      return { ...data, newUser: true, verify: UserStatus.Unverified }
    }
  }

  async logout(refreshToken: string) {
    await databaseService.refreshTokens.deleteOne({ token: refreshToken })
    return {
      message: USERS_MESSAGES.LOGOUT_SUCCESS
    }
  }
  async verifyEmail(userId: string) {
    const [token] = await Promise.all([
      this.signAccessAndRefreshToken({ userId, verify: UserStatus.Verified }),
      databaseService.users.updateOne(
        { _id: new ObjectId(userId) },
        {
          $set: { emailVerifyToken: '', status: UserStatus.Verified },
          $currentDate: { updated_at: true }
        }
      )
    ])
    const [accessToken, refreshToken] = token
    return {
      accessToken,
      refreshToken,
      newUser: 1,
      status: UserStatus.Unverified
    }
  }
  async resendVerifyEmail(userId: string) {
    const emailVerifyToken = await this.signEmailVerifyToken({ userId, verify: UserStatus.Unverified })
    await databaseService.users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { emailVerifyToken }, $currentDate: { updated_at: true } }
    )
    return {
      message: USERS_MESSAGES.RESEND_EMAIL_VERIFY_SUCCESS
    }
  }
  async forgotPassword({ userId, status }: { userId: string; status: UserStatus }) {
    const forgotPasswordToken = await this.signForgotPasswordToken({ userId, status })
    await databaseService.users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { forgotPasswordToken }, $currentDate: { updated_at: true } }
    )
    return {
      message: USERS_MESSAGES.FORGOT_PASSWORD_EMAIL_SENT
    }
  }
  async resetPassword(userId: string, newPassword: string) {
    await databaseService.users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { password: hashPassword(newPassword), forgotPasswordToken: '' }, $currentDate: { updated_at: true } }
    )
    return {
      message: USERS_MESSAGES.RESET_PASSWORD_SUCCESS
    }
  }
  async getMe(userId: string) {
    const user = await databaseService.users.findOne(
      { _id: new ObjectId(userId) },
      { projection: { password: 0, emailVerifyToken: 0, forgotPasswordToken: 0 } }
    )
    if (!user) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.USER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }
    return user
  }
  async updateMe(userId: string, payload: UpdateMeReqBody) {
    const _payload = payload.dateOfBirth ? { ...payload, dateOfBirth: new Date(payload.dateOfBirth) } : payload
    const user = await databaseService.users.findOneAndUpdate(
      { _id: new ObjectId(userId) },
      { $set: { ...(_payload as UpdateMeReqBody & { dateOfBirth?: Date }) }, $currentDate: { updated_at: true } },
      { returnDocument: 'after' }
    )
    return user
  }
  async getProfile(username: string) {
    const user = await databaseService.users.findOne(
      { username },
      {
        projection: {
          password: 0,
          emailVerifyToken: 0,
          forgotPasswordToken: 0,
          verify: 0,
          created_at: 0,
          updated_at: 0
        }
      }
    )
    if (!user) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.USER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }
    return user
  }
  async changePassword(userId: string, newPassword: string) {
    await databaseService.users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { password: hashPassword(newPassword) }, $currentDate: { updated_at: true } }
    )
    return {
      message: USERS_MESSAGES.RESET_PASSWORD_SUCCESS
    }
  }
}
const usersService = new UsersService()
export default usersService
