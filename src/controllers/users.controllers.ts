import { CookieOptions, Request, Response } from 'express'
import usersService from '~/services/users.services'
import { NextFunction, ParamsDictionary } from 'express-serve-static-core'
import {
  ChangePasswordReqBody,
  ForgotPasswordReqBody,
  LoginReqBody,
  LogoutReqBody,
  RefreshTokenReqBody,
  RegisterReqBody,
  ResetPasswordReqBody,
  TokenPayload,
  UpdateMeReqBody,
  VerifyEmailReqBody,
  VerifyForgotPasswordTokenReqBody
} from '~/models/requests/User.request'
import { ObjectId } from 'mongodb'
import User from '~/models/schemas/User.schema'
import { USERS_MESSAGES } from '~/constants/message'
import databaseService from '~/services/database.services'
import HTTP_STATUS from '~/constants/httpStatus'
import { UserStatus } from '~/constants/enum'
import { pick } from 'lodash'
import { config } from 'dotenv'
import { ErrorWithStatus } from '~/models/Error'
config()

const isProduction = process.env.NODE_ENV === 'production'

const getRefreshTokenCookieOptions = (maxAge?: number): CookieOptions => {
  const options: CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/'
  }

  if (maxAge !== undefined) {
    options.maxAge = maxAge
  }

  if (process.env.REFRESH_TOKEN_COOKIE_DOMAIN) {
    options.domain = process.env.REFRESH_TOKEN_COOKIE_DOMAIN
  }

  return options
}

export const registerController = async (
  req: Request<ParamsDictionary, unknown, RegisterReqBody>,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = await usersService.register(req.body)
    return res.json({ message: USERS_MESSAGES.REGISTER_SUCCESS, userId })
  } catch (error) {
    next(error)
  }
}
export const loginController = async (req: Request<ParamsDictionary, unknown, LoginReqBody>, res: Response) => {
  const user = req.user as User
  const userId = user._id as ObjectId
  const { rememberMe = false } = req.body
  const result = await usersService.login({
    userId: userId.toString(),
    userVerify: user.status,
    userRole: user.role,
    rememberMe
  })

  // Set refresh token as httpOnly cookie
  const refreshTokenExpiresIn = rememberMe ? 90 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000 // milliseconds
  res.cookie('refreshToken', result.refreshToken, getRefreshTokenCookieOptions(refreshTokenExpiresIn))

  // Return only access token in response
  return res.json({
    message: USERS_MESSAGES.LOGIN_SUCCESS,
    result: {
      accessToken: result.accessToken
    }
  })
}

export const oauthController = async (req: Request, res: Response) => {
  const { code } = req.query as { code: string }
  const clientRedirectUri = process.env.CLIENT_REDIRECT_URI as string
  let result

  try {
    result = await usersService.oauth(code)
  } catch (error) {
    const errorCode = error instanceof ErrorWithStatus && error.message === USERS_MESSAGES.USER_BANNED ? 'banned' : 'oauth_failed'
    return res.redirect(`${clientRedirectUri}?error=${encodeURIComponent(errorCode)}`)
  }

  res.cookie('refreshToken', result.refreshToken, getRefreshTokenCookieOptions(30 * 24 * 60 * 60 * 1000))

  return res.redirect(`${clientRedirectUri}?accessToken=${encodeURIComponent(result.accessToken)}`)
}

export const logoutController = async (req: Request<ParamsDictionary, unknown, LogoutReqBody>, res: Response) => {
  // Refresh token is now obtained from cookie in middleware, not from body
  const result = await usersService.logout(req.refreshToken as string)

  // Clear refresh token cookie
  res.clearCookie('refreshToken', getRefreshTokenCookieOptions())

  return res.json(result)
}
export const verifyEmailController = async (
  req: Request<ParamsDictionary, unknown, VerifyEmailReqBody>,
  res: Response
) => {
  const { userId } = req.decodedEmailVerifyToken as TokenPayload
  const user = await databaseService.users.findOne({
    _id: new ObjectId(userId)
  })
  //Neu khong tim thay user thi bao loi User not found
  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      message: USERS_MESSAGES.USER_NOT_FOUND
    })
  }
  //Da verify roi thi khong bao loi, tra ve status OK voi message da verify roi
  if (user.emailVerifyToken === '') {
    return res.json({
      message: USERS_MESSAGES.EMAIL_ALREADY_VERIFIED_BEFORE
    })
  }
  const result = await usersService.verifyEmail(userId)
  return res.json({
    message: USERS_MESSAGES.EMAIL_VERIFY_SUCCESS,
    result
  })
}
export const resendVerifyEmailController = async (req: Request, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const user = await databaseService.users.findOne({ _id: new ObjectId(userId) })
  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      message: USERS_MESSAGES.USER_NOT_FOUND
    })
  }
  if (user.status === UserStatus.Verified) {
    return res.json({
      message: USERS_MESSAGES.EMAIL_ALREADY_VERIFIED_BEFORE
    })
  }
  const result = await usersService.resendVerifyEmail(userId)
  return res.json({ result })
}
export const refreshTokenController = async (
  req: Request<ParamsDictionary, unknown, RefreshTokenReqBody>,
  res: Response
) => {
  // Refresh token is now obtained from cookie in middleware, not from body
  const { userId, verify, role } = req.decodedRefreshToken as TokenPayload
  const refreshTokenExpiresIn = req.decodedRefreshToken?.exp && req.decodedRefreshToken?.iat
    ? req.decodedRefreshToken.exp - req.decodedRefreshToken.iat > 31 * 24 * 60 * 60
      ? '90d'
      : '30d'
    : '30d'
  const result = await usersService.refreshToken({
    userId,
    verify,
    role: role!,
    refreshToken: req.refreshToken as string,
    expiresIn: refreshTokenExpiresIn
  })

  // Set new refresh token as httpOnly cookie
  res.cookie(
    'refreshToken',
    result.refreshToken,
    getRefreshTokenCookieOptions(refreshTokenExpiresIn === '90d' ? 90 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000)
  )

  // Return only access token in response
  return res.json({
    message: USERS_MESSAGES.REFRESH_TOKEN_SUCCESS,
    result: {
      accessToken: result.accessToken
    }
  })
}
export const forgotPasswordController = async (
  req: Request<ParamsDictionary, unknown, ForgotPasswordReqBody>,
  res: Response
) => {
  if (!req.user) {
    return res.json({
      message: USERS_MESSAGES.FORGOT_PASSWORD_EMAIL_SENT
    })
  }
  const { _id, status } = req.user as User
  const result = await usersService.forgotPassword({ userId: (_id as ObjectId).toString(), status })

  return res.json(result)
}
export const verifyForgotPasswordTokenController = async (
  req: Request<ParamsDictionary, unknown, VerifyForgotPasswordTokenReqBody>,
  res: Response
) => {
  return res.json({
    message: USERS_MESSAGES.VERIFY_FORGOT_PASSWORD_SUCCESS
  })
}
export const resetPasswordController = async (
  req: Request<ParamsDictionary, unknown, ResetPasswordReqBody>,
  res: Response
) => {
  const { userId } = req.decodedForgotPasswordToken as TokenPayload
  const { password } = req.body
  const result = await usersService.resetPassword(userId, password)
  return res.json(result)
}
export const changePasswordController = async (
  req: Request<ParamsDictionary, unknown, ChangePasswordReqBody>,
  res: Response
) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const { currentPassword, password } = req.body
  const result = await usersService.changePassword(userId, currentPassword, password)
  return res.json(result)
}
export const getMeController = async (req: Request, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const user = await usersService.getMe(userId)
  return res.json({
    message: USERS_MESSAGES.GET_ME_SUCCESS,
    user
  })
}
export const updateMeController = async (req: Request<ParamsDictionary, unknown, UpdateMeReqBody>, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const body = pick(req.body, [
    'firstName',
    'lastName',
    'phoneNumber',
    'dateOfBirth',
    'gender',
    'avatar',
    'address',
    'lisenseNumber'
  ])
  const user = await usersService.updateMe(userId, body)
  return res.json({
    message: USERS_MESSAGES.UPDATE_PROFILE_SUCCESS,
    user
  })
}

export const getWishlistController = async (req: Request, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const result = await usersService.getWishlist(userId)
  return res.json({
    message: USERS_MESSAGES.GET_WISHLIST_SUCCESS,
    result
  })
}

export const addToWishlistController = async (req: Request, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const { productId } = req.body
  const result = await usersService.addToWishlist(userId, productId)
  return res.json(result)
}

export const removeFromWishlistController = async (req: Request, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const { productId } = req.params
  const result = await usersService.removeFromWishlist(userId, productId)
  return res.json(result)
}
