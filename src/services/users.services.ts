import User from '~/models/schemas/User.schema'
import databaseService from './database.services'
import { RegisterReqBody, UpdateMeReqBody } from '~/models/requests/User.request'
import { hashPassword } from '~/utils/crypto'
import { TokenType, UserRole, UserStatus } from '~/constants/enum'
import { signToken } from '~/utils/jwt'
import RefreshToken from '~/models/schemas/RefreshToken.schema'
import { ObjectId } from 'mongodb'
import { USERS_MESSAGES, PRODUCTS_MESSAGES } from '~/constants/message'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'
import axios from 'axios'
import emailService from './email.services'
import recommendationsService from './recommendations.services'
import notificationService from './notifications.services'
import { getIO } from '~/sockets/chat.socket'

class UsersService {
  private getRefreshTokenExpiresAt(expiresIn: '30d' | '90d' = '30d') {
    const days = expiresIn === '90d' ? 90 : 30
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  }

  private signAccessToken({ userId, verify, role }: { userId: string; verify: UserStatus; role: UserRole }) {
    return signToken({
      payload: {
        userId,
        tokenType: TokenType.AccessToken,
        verify,
        role
      },
      privateKey: process.env.JWT_SECRET_ACCESS_TOKEN as string,
      options: { expiresIn: '15m' }
    })
  }
  private signRefreshToken({
    userId,
    verify,
    role,
    expiresIn = '30d'
  }: {
    userId: string
    verify: UserStatus
    role: UserRole
    expiresIn?: string
  }) {
    return signToken({
      payload: {
        userId,
        tokenType: TokenType.RefreshToken,
        verify,
        role
      },
      privateKey: process.env.JWT_SECRET_REFRESH_TOKEN as string,
      options: { expiresIn: expiresIn as '30d' | '90d' }
    })
  }
  private signAccessAndRefreshToken({ userId, verify, role }: { userId: string; verify: UserStatus; role: UserRole }) {
    return Promise.all([
      this.signAccessToken({ userId, verify, role }),
      this.signRefreshToken({ userId, verify, role })
    ])
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
        verify: status
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

    try {
      await emailService.sendVerifyRegisterEmail(payload.email, emailVerifyToken)
    } catch {
      await databaseService.users.deleteOne({ _id: userId })
      throw new ErrorWithStatus({
        message: 'Không thể gửi email xác thực. Vui lòng kiểm tra cấu hình email và thử lại.',
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR
      })
    }

    return userId.toString()
  }
  async refreshToken({
    userId,
    verify,
    role,
    refreshToken,
    expiresIn = '30d'
  }: {
    userId: string
    verify: UserStatus
    role: UserRole
    refreshToken: string
    expiresIn?: '30d' | '90d'
  }) {
    const oldRefreshToken = await databaseService.refreshTokens.findOneAndDelete({ token: refreshToken })
    if (!oldRefreshToken) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.USED_REFRESH_TOKEN_OR_NOT_EXISTS,
        status: HTTP_STATUS.UNAUTHORIZED
      })
    }

    const [newAccessToken, newRefreshToken] = await Promise.all([
      this.signAccessToken({ userId, verify, role }),
      this.signRefreshToken({ userId, verify, role, expiresIn })
    ])

    await databaseService.refreshTokens.insertOne(
      new RefreshToken({
        userId: new ObjectId(userId),
        token: newRefreshToken as string,
        expiresAt: this.getRefreshTokenExpiresAt(expiresIn)
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
    userRole,
    rememberMe = false
  }: {
    userId: string
    userVerify: UserStatus
    userRole: UserRole
    rememberMe?: boolean
  }) {
    const refreshTokenExpiresIn = rememberMe ? '90d' : '30d'
    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken({ userId, verify: userVerify, role: userRole }),
      this.signRefreshToken({ userId, verify: userVerify, role: userRole, expiresIn: refreshTokenExpiresIn })
    ])
    await databaseService.refreshTokens.insertOne(
      new RefreshToken({
        userId: new ObjectId(userId),
        token: refreshToken,
        expiresAt: this.getRefreshTokenExpiresAt(refreshTokenExpiresIn)
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
    if (!userInfo.verified_email) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.GMAIL_NOT_VERIFIED,
        status: HTTP_STATUS.UNAUTHORIZED
      })
    }

    const user = await databaseService.users.findOne({ email: userInfo.email })
    if (user) {
      if (user.status === UserStatus.Banned) {
        throw new ErrorWithStatus({
          message: USERS_MESSAGES.USER_BANNED,
          status: HTTP_STATUS.FORBIDDEN
        })
      }

      const [accessToken, refreshToken] = await this.signAccessAndRefreshToken({
        userId: user._id.toString(),
        verify: user.status,
        role: user.role
      })
      await databaseService.refreshTokens.insertOne(
        new RefreshToken({
          userId: user._id,
          token: refreshToken,
          expiresAt: this.getRefreshTokenExpiresAt('30d')
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
      const userId = new ObjectId()
      const [accessToken, refreshToken] = await this.signAccessAndRefreshToken({
        userId: userId.toString(),
        verify: UserStatus.Verified,
        role: UserRole.Customer
      })

      await databaseService.users.insertOne(
        new User({
          _id: userId,
          firstName,
          lastName,
          email: userInfo.email,
          password: hashPassword(randomPassword),
          role: UserRole.Customer,
          status: UserStatus.Verified,
          emailVerifyToken: '',
          forgotPasswordToken: '',
          phoneNumber: '',
          gender: 0
        })
      )
      await databaseService.refreshTokens.insertOne(
        new RefreshToken({
          userId,
          token: refreshToken,
          expiresAt: this.getRefreshTokenExpiresAt('30d')
        })
      )
      return { accessToken, refreshToken, newUser: true, verify: UserStatus.Verified }
    }
  }

  async logout(refreshToken: string) {
    await databaseService.refreshTokens.deleteOne({ token: refreshToken })
    return {
      message: USERS_MESSAGES.LOGOUT_SUCCESS
    }
  }
  async verifyEmail(userId: string) {
    await databaseService.users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: { emailVerifyToken: '', status: UserStatus.Verified },
        $currentDate: { updated_at: true }
      }
    )
    void recommendationsService.recordRealtimeEvent(userId)
    let io
    try { io = getIO() } catch { io = undefined }
    Promise.resolve((notificationService as any).notifySecurityAlert?.(
        new ObjectId(userId),
        'Chào mừng bạn đến với MediSpace',
        'Tài khoản của bạn đã được xác thực. Bạn có thể bắt đầu theo dõi đơn hàng, đơn thuốc và các thông báo quan trọng tại đây.',
        `user:${userId}:verified`,
        io
      )).catch(() => {})
    return {
      status: UserStatus.Verified
    }
  }
  async resendVerifyEmail(userId: string) {
    const user = await databaseService.users.findOne({ _id: new ObjectId(userId) })
    if (!user) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.USER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    const emailVerifyToken = await this.signEmailVerifyToken({ userId, verify: UserStatus.Unverified })
    await databaseService.users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { emailVerifyToken }, $currentDate: { updated_at: true } }
    )
    void recommendationsService.recordRealtimeEvent(userId)

    // Send verify email
    await emailService.sendVerifyRegisterEmail(user.email, emailVerifyToken)

    return {
      message: USERS_MESSAGES.RESEND_EMAIL_VERIFY_SUCCESS
    }
  }
  async forgotPassword({ userId, status }: { userId: string; status: UserStatus }) {
    const user = await databaseService.users.findOne({ _id: new ObjectId(userId) })
    if (!user) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.USER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    const forgotPasswordToken = await this.signForgotPasswordToken({ userId, status })
    await databaseService.users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { forgotPasswordToken }, $currentDate: { updated_at: true } }
    )

    // Send forgot password email
    await emailService.sendForgotPasswordEmail(user.email, forgotPasswordToken)

    return {
      message: USERS_MESSAGES.FORGOT_PASSWORD_EMAIL_SENT
    }
  }
  async resetPassword(userId: string, newPassword: string) {
    await Promise.all([
      databaseService.users.updateOne(
        { _id: new ObjectId(userId) },
        {
          $set: { password: hashPassword(newPassword), forgotPasswordToken: '', forcePasswordChange: false },
          $currentDate: { updated_at: true }
        }
      ),
      databaseService.refreshTokens.deleteMany({ userId: new ObjectId(userId) })
    ])
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
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    // Get user and verify current password
    const user = await databaseService.users.findOne({ _id: new ObjectId(userId) })

    if (!user) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.USER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    // Verify current password
    const hashedCurrentPassword = hashPassword(currentPassword)
    if (user.password !== hashedCurrentPassword) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.OLD_PASSWORD_NOT_MATCH,
        status: HTTP_STATUS.UNAUTHORIZED
      })
    }

    // Update to new password
    await Promise.all([
      databaseService.users.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { password: hashPassword(newPassword), forcePasswordChange: false }, $currentDate: { updated_at: true } }
      ),
      databaseService.refreshTokens.deleteMany({ userId: new ObjectId(userId) })
    ])
    let io
    try { io = getIO() } catch { io = undefined }
    Promise.resolve((notificationService as any).notifySecurityAlert?.(
        new ObjectId(userId),
        'Mật khẩu đã được thay đổi',
        'Mật khẩu tài khoản MediSpace của bạn vừa được cập nhật. Nếu không phải bạn thực hiện, vui lòng liên hệ hỗ trợ ngay.',
        `user:${userId}:password-changed:${Date.now()}`,
        io
      )).catch(() => {})
    return {
      message: USERS_MESSAGES.CHANGE_PASSWORD_SUCCESS
    }
  }

  async getWishlist(userId: string) {
    const user = await databaseService.users
      .aggregate([
        { $match: { _id: new ObjectId(userId) } },
        {
          $lookup: {
            from: process.env.DB_PRODUCTS_COLLECTION || 'products',
            localField: 'wishlist',
            foreignField: '_id',
            as: 'wishlistProducts'
          }
        },
        {
          $project: {
            wishlistProducts: 1
          }
        }
      ])
      .toArray()

    if (!user.length) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.USER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    return user[0].wishlistProducts || []
  }

  async addToWishlist(userId: string, productId: string) {
    // Check if product exists first
    const product = await databaseService.products.findOne({ _id: new ObjectId(productId) })
    if (!product) {
      throw new ErrorWithStatus({
        message: PRODUCTS_MESSAGES.PRODUCT_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    await databaseService.users.updateOne(
      { _id: new ObjectId(userId) },
      { $addToSet: { wishlist: new ObjectId(productId) } }
    )

    return { message: USERS_MESSAGES.ADD_TO_WISHLIST_SUCCESS }
  }

  async removeFromWishlist(userId: string, productId: string) {
    await databaseService.users.updateOne(
      { _id: new ObjectId(userId) },
      { $pull: { wishlist: new ObjectId(productId) } }
    )

    return { message: USERS_MESSAGES.REMOVE_FROM_WISHLIST_SUCCESS }
  }
}
const usersService = new UsersService()
export default usersService
