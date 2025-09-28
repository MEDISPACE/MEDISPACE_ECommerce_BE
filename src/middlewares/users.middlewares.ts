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
import { UserStatus } from '~/constants/enum'
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
        const decoded_forgot_password_token = await verifyToken({
          token: value,
          secretOrPublicKey: process.env.JWT_SECRET_FORGOT_PASSWORD_TOKEN as string
        })
        const { user_id } = decoded_forgot_password_token
        const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })
        if (!user) {
          throw new ErrorWithStatus({
            message: USERS_MESSAGES.USER_NOT_FOUND,
            status: HTTP_STATUS.NOT_FOUND
          })
        }
        if (user.forgotPasswordToken !== value) {
          console.log('User forgot password token in DB:', user.forgotPasswordToken)
          console.log('Provided forgot password token:', value)
          console.log('Forgot password token is invalid')
          throw new ErrorWithStatus({
            message: USERS_MESSAGES.INVALID_FORGOT_PASSWORD_TOKEN,
            status: HTTP_STATUS.UNAUTHORIZED
          })
        }
        req.decoded_forgot_password_token = decoded_forgot_password_token
      } catch (error) {
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
const userIdSchema: ParamSchema = {
  custom: {
    options: async (value: string, { req }) => {
      if (!ObjectId.isValid(value)) {
        throw new ErrorWithStatus({
          message: USERS_MESSAGES.INVALID_USER_ID,
          status: HTTP_STATUS.NOT_FOUND
        })
      }
      const { user_id } = req.decoded_authorization as TokenPayload
      if (value === user_id) {
        throw new ErrorWithStatus({
          message: USERS_MESSAGES.CANNOT_FOLLOW_OR_UNFOLLOW_YOURSELF,
          status: HTTP_STATUS.FORBIDDEN
        })
      }
      const followed_user = await databaseService.users.findOne({ _id: new ObjectId(value) })
      if (!followed_user) {
        throw new ErrorWithStatus({
          message: USERS_MESSAGES.USER_NOT_FOUND,
          status: HTTP_STATUS.NOT_FOUND
        })
      }
      return true
    }
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
      confirm_password: confirmPasswordSchema,
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
            req.user = user
            return true
          }
        }
      },
      password: passwordSchema
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
            const access_token = value.split(' ')[1]
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
              ;(req as Request).decoded_authorization = decoded_authorization
            } catch (error) {
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
      refresh_token: {
        trim: true,
        custom: {
          options: async (value: string, { req }) => {
            if (!value) {
              throw new ErrorWithStatus({
                message: USERS_MESSAGES.REFRESH_TOKEN_IS_REQUIRED,
                status: HTTP_STATUS.UNAUTHORIZED
              })
            }
            try {
              const [decoded_refresh_token, refresh_token] = await Promise.all([
                verifyToken({ token: value, secretOrPublicKey: process.env.JWT_SECRET_REFRESH_TOKEN as string }),
                databaseService.refreshTokens.findOne({ token: value })
              ])
              if (refresh_token === null) {
                throw new ErrorWithStatus({
                  message: USERS_MESSAGES.USED_REFRESH_TOKEN_OR_NOT_EXISTS,
                  status: HTTP_STATUS.UNAUTHORIZED
                })
              }
              ;(req as Request).decoded_refresh_token = decoded_refresh_token
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
    ['body']
  )
)
export const emailVerifyTokenValidator = validate(
  checkSchema(
    {
      email_verify_token: {
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
              const decoded_email_verify_token = await verifyToken({
                token: value,
                secretOrPublicKey: process.env.JWT_SECRET_EMAIL_VERIFY_TOKEN as string
              })
              ;(req as Request).decoded_email_verify_token = decoded_email_verify_token
            } catch (error) {
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
            if (!user) {
              throw new Error(USERS_MESSAGES.EMAIL_NOT_FOUND)
            }
            req.user = user
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
      forgot_password_token: forgotPasswordTokenSchema
    },
    ['body']
  )
)