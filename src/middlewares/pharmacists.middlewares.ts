import { NextFunction, Request, Response } from 'express'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'
import databaseService from '~/services/database.services'
import { UserRole } from '~/constants/enum'
import { TokenPayload } from '~/models/requests/User.request'
import { ObjectId } from 'mongodb'
import User from '~/models/schemas/User.schema'
import { checkSchema, ParamSchema } from 'express-validator'
import { validate } from '~/utils/validation'
import { USERS_MESSAGES, PHARMACIST_MESSAGES } from '~/constants/message'
import { hashPassword } from '~/utils/crypto'

// Extend Request interface để thêm pharmacist property
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      pharmacist?: User
    }
  }
}

/**
 * Middleware xác thực người dùng là Pharmacist
 * Kiểm tra role và trạng thái user
 */
export const authenticatePharmacist = (req: Request, res: Response, next: NextFunction) => {
  const { role } = req.decoded_authorization as TokenPayload

  if (role !== UserRole.Pharmacist) {
    return next(
      new ErrorWithStatus({
        message: PHARMACIST_MESSAGES.ONLY_PHARMACIST_ACCESS,
        status: HTTP_STATUS.FORBIDDEN
      })
    )
  }
  next()
}

// Password schema for pharmacist
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

/**
 * Middleware validate update password cho Pharmacist
 */
export const updatePasswordValidator = validate(
  checkSchema(
    {
      oldPassword: {
        ...passwordSchema,
        custom: {
          options: async (value: string, { req }) => {
            const { userId } = req.decoded_authorization as TokenPayload
            const pharmacist = await databaseService.users.findOne({
              _id: new ObjectId(userId),
              role: UserRole.Pharmacist,
              password: hashPassword(value)
            })
            if (!pharmacist) {
              throw new Error(PHARMACIST_MESSAGES.OLD_PASSWORD_INCORRECT)
            }
            return true
          }
        }
      },
      newPassword: passwordSchema
    },
    ['body']
  )
)

/**
 * Middleware kiểm tra giấy phép hành nghề của Pharmacist
 * Kiểm tra lisenseNumber và trạng thái online
 */
export const checkLicense = async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = req.decoded_authorization as TokenPayload

  try {
    // Lấy thông tin pharmacist từ database
    const pharmacist = await databaseService.users.findOne({
      _id: new ObjectId(userId),
      role: UserRole.Pharmacist
    })

    // Kiểm tra pharmacist có tồn tại không
    if (!pharmacist) {
      return next(
        new ErrorWithStatus({
          message: PHARMACIST_MESSAGES.PHARMACIST_NOT_FOUND,
          status: HTTP_STATUS.NOT_FOUND
        })
      )
    }

    // Kiểm tra giấy phép hành nghề
    if (!pharmacist.lisenseNumber) {
      return next(
        new ErrorWithStatus({
          message: PHARMACIST_MESSAGES.LICENSE_REQUIRED,
          status: HTTP_STATUS.FORBIDDEN
        })
      )
    }

    // Kiểm tra trạng thái online (có thể pharmacist cần online để tư vấn)
    if (pharmacist.isOnline === false) {
      return next(
        new ErrorWithStatus({
          message: PHARMACIST_MESSAGES.PHARMACIST_NOT_ONLINE,
          status: HTTP_STATUS.FORBIDDEN
        })
      )
    }

    // Lưu thông tin pharmacist vào request để controller sử dụng
    req.pharmacist = pharmacist

    next()
  } catch (error) {
    return next(
      new ErrorWithStatus({
        message: PHARMACIST_MESSAGES.CHECK_LICENSE_FAILED,
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR
      })
    )
  }
}
