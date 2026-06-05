import { checkSchema, ParamSchema } from 'express-validator'
import { JsonWebTokenError } from 'jsonwebtoken'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'
import databaseService from '~/services/database.services'
import usersService from '~/services/users.services'
import { verifyToken } from '~/utils/jwt'
import { validate } from '~/utils/validation'
import { NextFunction, Request, Response } from 'express'
import { ObjectId } from 'mongodb'
import { TokenType, UserStatus } from '~/constants/enum'
import { TokenPayload } from '~/models/requests/User.request'
import { USERS_MESSAGES } from '~/constants/message'
import { hashPassword } from '~/utils/crypto'
// import { USERNAME_REGEX } from '~/constants/regex'

const passwordSchema: ParamSchema = {
  in: ['body'],
  isString: {
    errorMessage: USERS_MESSAGES.PASSWORD_MUST_BE_STRING
  },
  isLength: {
    options: { min: 6, max: 50 },
    errorMessage: USERS_MESSAGES.PASSWORD_LENGTH_MUST_BE_FROM_6_TO_50
  },
  notEmpty: {
    errorMessage: USERS_MESSAGES.PASSWORD_IS_REQUIRED
  },
  isStrongPassword: {
    errorMessage: USERS_MESSAGES.PASSWORD_TOO_WEAK,
    options: {
      minLength: 6,
      minUppercase: 1,
      minLowercase: 1,
      minNumbers: 1,
      minSymbols: 1
    }
  }
}
const passwordOnlySchema: ParamSchema = {
  in: ['body'],
  isString: {
    errorMessage: USERS_MESSAGES.PASSWORD_MUST_BE_STRING
  },
  notEmpty: {
    errorMessage: USERS_MESSAGES.PASSWORD_IS_REQUIRED
  }
}
const confirmPasswordSchema: ParamSchema = {
  in: ['body'],
  isString: {
    errorMessage: USERS_MESSAGES.CONFIRM_PASSWORD_MUST_BE_STRING
  },
  isLength: {
    options: { min: 6, max: 50 },
    errorMessage: USERS_MESSAGES.CONFIRM_PASSWORD_LENGTH_MUST_BE_FROM_6_TO_50
  },
  notEmpty: {
    errorMessage: USERS_MESSAGES.CONFIRM_PASSWORD_IS_REQUIRED
  },
  custom: {
    options: (value, { req }) => {
      if (value !== req.body.password) {
        throw new Error(USERS_MESSAGES.CONFIRM_PASSWORD_DO_NOT_MATCH)
      }
      return true
    }
  }
}
const forgotPasswordTokenSchema: ParamSchema = {
  trim: true,
  custom: {
    options: async (value: string, { req }) => {
      if (!value) {
        throw new ErrorWithStatus({
          message: USERS_MESSAGES.FORGOT_PASSWORD_TOKEN_IS_REQUIRED,
          status: HTTP_STATUS.UNAUTHORIZED
        })
      }
      try {
        const decodedForgotPasswordToken = await verifyToken({
          token: value,
          secretOrPublicKey: process.env.JWT_SECRET_FORGOT_PASSWORD_TOKEN as string
        })
        if (decodedForgotPasswordToken.tokenType !== TokenType.ForgotPasswordToken) {
          throw new ErrorWithStatus({
            message: USERS_MESSAGES.INVALID_FORGOT_PASSWORD_TOKEN,
            status: HTTP_STATUS.UNAUTHORIZED
          })
        }
        const { userId } = decodedForgotPasswordToken
        const user = await databaseService.users.findOne({ _id: new ObjectId(userId) })
        if (!user) {
          throw new ErrorWithStatus({
            message: USERS_MESSAGES.USER_NOT_FOUND,
            status: HTTP_STATUS.NOT_FOUND
          })
        }
        if (user.forgotPasswordToken !== value) {
          throw new ErrorWithStatus({
            message: USERS_MESSAGES.INVALID_FORGOT_PASSWORD_TOKEN,
            status: HTTP_STATUS.UNAUTHORIZED
          })
        }
        req.decodedForgotPasswordToken = decodedForgotPasswordToken
      } catch (error) {
        if (error instanceof ErrorWithStatus) {
          throw error
        }
        throw new ErrorWithStatus({
          message: USERS_MESSAGES.INVALID_FORGOT_PASSWORD_TOKEN,
          status: HTTP_STATUS.UNAUTHORIZED
        })
      }
      return true
    }
  }
}
const nameSchema: ParamSchema = {
  in: ['body'],
  isString: {
    errorMessage: USERS_MESSAGES.NAME_MUST_BE_STRING
  },
  notEmpty: {
    errorMessage: USERS_MESSAGES.NAME_IS_REQUIRED
  },
  trim: true,
  isLength: {
    options: { min: 2, max: 100 },
    errorMessage: USERS_MESSAGES.NAME_LENGTH_MUST_BE_FROM_2_TO_100
  }
}
const dateOfBirthSchema: ParamSchema = {
  isISO8601: {
    errorMessage: USERS_MESSAGES.DATE_MUST_BE_ISO8601
  },
  notEmpty: {
    errorMessage: USERS_MESSAGES.DATE_OF_BIRTH_IS_REQUIRED
  },
  custom: {
    options: (value) => {
      const today = new Date()
      const birthDate = new Date(value)
      if (birthDate >= today) {
        throw new Error(USERS_MESSAGES.DATE_OF_BIRTH_MUST_BE_IN_THE_PAST)
      }
      return true
    }
  }
}
const imageUrlSchema: ParamSchema = {
  optional: true,
  isString: {
    errorMessage: USERS_MESSAGES.IMAGE_URL_MUST_BE_STRING
  },
  trim: true,
  isLength: {
    options: { min: 1, max: 400 },
    errorMessage: USERS_MESSAGES.IMAGE_URL_MUST_BE_AT_MOST_400_CHARACTERS_LONG
  }
}
export const registerValidator = validate(
  checkSchema(
    {
      firstName: nameSchema,
      lastName: nameSchema,
      email: {
        in: ['body'],
        isEmail: {
          errorMessage: USERS_MESSAGES.INVALID_EMAIL
        },
        notEmpty: {
          errorMessage: USERS_MESSAGES.EMAIL_IS_REQUIRED
        },
        trim: true,
        custom: {
          options: async (value) => {
            const exists = await usersService.checkEmailExists(value)
            if (exists) {
              throw new Error(USERS_MESSAGES.EMAIL_ALREADY_EXISTS)
            }
            return true
          }
        }
      },
      password: passwordSchema,
      confirm_password: confirmPasswordSchema
    },
    ['body']
  )
)

export const loginValidator = validate(
  checkSchema(
    {
      email: {
        in: ['body'],
        isEmail: {
          errorMessage: USERS_MESSAGES.INVALID_EMAIL
        },
        custom: {
          options: async (value, { req }) => {
            const user = await databaseService.users.findOne({
              email: value,
              password: hashPassword(req.body.password)
            })
            if (!user) {
              throw new Error(USERS_MESSAGES.EMAIL_OR_PASSWORD_IS_NOT_CORRECT)
            }
            if (user.status === UserStatus.Banned) {
              throw new ErrorWithStatus({
                message: USERS_MESSAGES.USER_BANNED,
                status: HTTP_STATUS.FORBIDDEN
              })
            }
            req.user = user
            return true
          }
        }
      },
      password: passwordOnlySchema
    },
    ['body']
  )
)
export const accessTokenValidator = validate(
  checkSchema(
    {
      Authorization: {
        trim: true,
        custom: {
          options: async (value: string, { req }) => {
            const access_token = value?.split(' ')[1]
            if (!access_token) {
              throw new ErrorWithStatus({
                message: USERS_MESSAGES.ACCESS_TOKEN_IS_REQUIRED,
                status: HTTP_STATUS.UNAUTHORIZED
              })
            }
            try {
              const decoded_authorization = await verifyToken({
                token: access_token,
                secretOrPublicKey: process.env.JWT_SECRET_ACCESS_TOKEN as string
              })
              if (decoded_authorization.tokenType !== TokenType.AccessToken) {
                throw new Error()
              }
              const user = await databaseService.users.findOne(
                { _id: new ObjectId(decoded_authorization.userId) },
                { projection: { role: 1, status: 1 } }
              )
              if (!user) {
                throw new ErrorWithStatus({
                  message: USERS_MESSAGES.USER_NOT_FOUND,
                  status: HTTP_STATUS.UNAUTHORIZED
                })
              }
              if (user.status === UserStatus.Banned) {
                throw new ErrorWithStatus({
                  message: USERS_MESSAGES.USER_BANNED,
                  status: HTTP_STATUS.FORBIDDEN
                })
              }
              decoded_authorization.verify = user.status
              decoded_authorization.role = user.role
              ;(req as Request).decoded_authorization = decoded_authorization
            } catch (error) {
              if (error instanceof ErrorWithStatus) {
                throw error
              }
              throw new ErrorWithStatus({
                message: USERS_MESSAGES.INVALID_ACCESS_TOKEN,
                status: HTTP_STATUS.UNAUTHORIZED
              })
            }
            return true
          }
        }
      }
    },
    ['headers']
  )
)
export const refreshTokenValidator = validate(
  checkSchema(
    {
      refreshToken: {
        trim: true,
        custom: {
          options: async (value: string, { req }) => {
            // Allow refresh token from body or cookie
            const refreshToken = value || req.cookies?.refreshToken

            if (!refreshToken) {
              throw new ErrorWithStatus({
                message: USERS_MESSAGES.REFRESH_TOKEN_IS_REQUIRED,
                status: HTTP_STATUS.UNAUTHORIZED
              })
            }
            try {
              const [decodedRefreshToken, refreshTokenDoc] = await Promise.all([
                verifyToken({ token: refreshToken, secretOrPublicKey: process.env.JWT_SECRET_REFRESH_TOKEN as string }),
                databaseService.refreshTokens.findOne({ token: refreshToken })
              ])
              if (decodedRefreshToken.tokenType !== TokenType.RefreshToken) {
                throw new JsonWebTokenError('Invalid token type')
              }
              if (refreshTokenDoc === null) {
                throw new ErrorWithStatus({
                  message: USERS_MESSAGES.USED_REFRESH_TOKEN_OR_NOT_EXISTS,
                  status: HTTP_STATUS.UNAUTHORIZED
                })
              }
              const user = await databaseService.users.findOne(
                { _id: new ObjectId(decodedRefreshToken.userId) },
                { projection: { role: 1, status: 1 } }
              )
              if (!user) {
                throw new ErrorWithStatus({
                  message: USERS_MESSAGES.USER_NOT_FOUND,
                  status: HTTP_STATUS.UNAUTHORIZED
                })
              }
              if (user.status === UserStatus.Banned) {
                throw new ErrorWithStatus({
                  message: USERS_MESSAGES.USER_BANNED,
                  status: HTTP_STATUS.FORBIDDEN
                })
              }
              decodedRefreshToken.verify = user.status
              decodedRefreshToken.role = user.role
              ;(req as Request).decodedRefreshToken = decodedRefreshToken
              ;(req as Request).refreshToken = refreshToken
            } catch (error) {
              if (error instanceof JsonWebTokenError) {
                throw new ErrorWithStatus({
                  message: USERS_MESSAGES.INVALID_REFRESH_TOKEN,
                  status: HTTP_STATUS.UNAUTHORIZED
                })
              }
              throw error
            }
            return true
          }
        }
      }
    },
    ['body', 'cookies']
  )
)
export const emailVerifyTokenValidator = validate(
  checkSchema(
    {
      emailVerifyToken: {
        trim: true,
        custom: {
          options: async (value: string, { req }) => {
            if (!value) {
              throw new ErrorWithStatus({
                message: USERS_MESSAGES.EMAIL_VERIFY_TOKEN_IS_REQUIRED,
                status: HTTP_STATUS.UNAUTHORIZED
              })
            }
            try {
              const decodedEmailVerifyToken = await verifyToken({
                token: value,
                secretOrPublicKey: process.env.JWT_SECRET_EMAIL_VERIFY_TOKEN as string
              })
              if (decodedEmailVerifyToken.tokenType !== TokenType.EmailVerifyToken) {
                throw new ErrorWithStatus({
                  message: USERS_MESSAGES.INVALID_EMAIL_VERIFY_TOKEN,
                  status: HTTP_STATUS.UNAUTHORIZED
                })
              }
              const { userId } = decodedEmailVerifyToken
              const user = await databaseService.users.findOne({ _id: new ObjectId(userId) })
              if (!user) {
                throw new ErrorWithStatus({
                  message: USERS_MESSAGES.USER_NOT_FOUND,
                  status: HTTP_STATUS.NOT_FOUND
                })
              }
              if (user.emailVerifyToken !== value) {
                throw new ErrorWithStatus({
                  message: USERS_MESSAGES.INVALID_EMAIL_VERIFY_TOKEN,
                  status: HTTP_STATUS.UNAUTHORIZED
                })
              }
              ;(req as Request).decodedEmailVerifyToken = decodedEmailVerifyToken
            } catch (error) {
              if (error instanceof ErrorWithStatus) {
                throw error
              }
              throw new ErrorWithStatus({
                message: USERS_MESSAGES.INVALID_EMAIL_VERIFY_TOKEN,
                status: HTTP_STATUS.UNAUTHORIZED
              })
            }
            return true
          }
        }
      }
    },
    ['body']
  )
)
export const forgotPasswordValidator = validate(
  checkSchema(
    {
      email: {
        in: ['body'],
        isEmail: {
          errorMessage: USERS_MESSAGES.INVALID_EMAIL
        },
        trim: true,
        custom: {
          options: async (value, { req }) => {
            const user = await databaseService.users.findOne({ email: value })
            if (user) {
              req.user = user
            }
            return true
          }
        }
      }
    },
    ['body']
  )
)
export const verifyForgotPasswordTokenValidator = validate(
  checkSchema(
    {
      forgotPasswordToken: forgotPasswordTokenSchema
    },
    ['body']
  )
)
export const resetPasswordValidator = validate(
  checkSchema(
    {
      password: passwordSchema,
      confirmPassword: confirmPasswordSchema,
      forgotPasswordToken: forgotPasswordTokenSchema
    },
    ['body']
  )
)
export const verifiedUserValidator = (req: Request, res: Response, next: NextFunction) => {
  // accessTokenValidator refreshes verify/role from DB before this middleware runs.
  const { verify } = req.decoded_authorization as TokenPayload
  if (verify === UserStatus.Unverified) {
    return next(
      new ErrorWithStatus({
        message: USERS_MESSAGES.USER_NOT_VERIFIED,
        status: HTTP_STATUS.FORBIDDEN
      })
    )
  }
  next()
}
export const changePasswordValidator = validate(
  checkSchema(
    {
      currentPassword: {
        ...passwordOnlySchema,
        custom: {
          options: async (value: string, { req }) => {
            const { userId } = req.decoded_authorization as TokenPayload
            const user = await databaseService.users.findOne({
              _id: new ObjectId(userId),
              password: hashPassword(value)
            })
            if (!user) {
              throw new Error(USERS_MESSAGES.CURRENT_PASSWORD_IS_INCORRECT)
            }
            return true
          }
        }
      },
      password: passwordSchema,
      confirmPassword: confirmPasswordSchema
    },
    ['body']
  )
)
export const updateMeValidator = validate(
  checkSchema(
    {
      firstName: {
        ...nameSchema,
        optional: true,
        notEmpty: undefined
      },
      lastName: {
        ...nameSchema,
        optional: true,
        notEmpty: undefined
      },
      phoneNumber: {
        optional: true,
        isString: {
          errorMessage: USERS_MESSAGES.PHONE_NUMBER_MUST_BE_STRING
        },
        trim: true,
        isLength: {
          options: { min: 10, max: 15 },
          errorMessage: USERS_MESSAGES.PHONE_NUMBER_LENGTH_INVALID
        }
      },
      dateOfBirth: {
        ...dateOfBirthSchema,
        optional: true,
        notEmpty: undefined
      },
      gender: {
        optional: true,
        custom: {
          options: (value) => {
            if (value === undefined || value === null) return true
            const numValue = typeof value === 'string' ? parseInt(value) : value
            if (isNaN(numValue) || ![0, 1].includes(numValue)) {
              throw new Error(USERS_MESSAGES.GENDER_INVALID)
            }
            return true
          }
        },
        customSanitizer: {
          options: (value) => {
            if (value === undefined || value === null) return value
            return typeof value === 'string' ? parseInt(value) : value
          }
        }
      },
      avatar: imageUrlSchema,
      address: {
        optional: true,
        isObject: {
          errorMessage: USERS_MESSAGES.ADDRESS_MUST_BE_OBJECT
        },
        custom: {
          options: (value) => {
            if (value.address && typeof value.address !== 'string') {
              throw new Error(USERS_MESSAGES.ADDRESS_INVALID)
            }
            if (value.ward && typeof value.ward !== 'string') {
              throw new Error(USERS_MESSAGES.WARD_INVALID)
            }
            if (value.city && typeof value.city !== 'string') {
              throw new Error(USERS_MESSAGES.CITY_INVALID)
            }
            if (value.isDefault !== undefined && typeof value.isDefault !== 'boolean') {
              throw new Error(USERS_MESSAGES.IS_DEFAULT_INVALID)
            }
            return true
          }
        }
      },
      lisenseNumber: {
        optional: true,
        isString: {
          errorMessage: USERS_MESSAGES.LISENSE_NUMBER_MUST_BE_STRING
        },
        trim: true,
        isLength: {
          options: { min: 1, max: 50 },
          errorMessage: USERS_MESSAGES.LISENSE_NUMBER_LENGTH_INVALID
        }
      }
    },
    ['body']
  )
)
