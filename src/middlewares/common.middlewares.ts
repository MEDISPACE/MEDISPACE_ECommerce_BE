import { Request, Response, NextFunction } from 'express'
import { TokenPayload } from '~/models/requests/User.request'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'
import { UserRole } from '~/constants/enum'
import { USERS_MESSAGES } from '~/constants/message'
import databaseService from '~/services/database.services'
import { ObjectId } from 'mongodb'

/**
 * Common middleware functions
 */

/**
 * Check if user is Admin or Pharmacist
 * Used for operations that require elevated privileges
 */
export const isAdminOrPharmacist = (req: Request, res: Response, next: NextFunction) => {
  const { role } = req.decoded_authorization as TokenPayload

  if (role !== UserRole.Admin && role !== UserRole.Pharmacist) {
    throw new ErrorWithStatus({
      message: USERS_MESSAGES.ADMIN_OR_PHARMACIST_REQUIRED,
      status: HTTP_STATUS.FORBIDDEN
    })
  }

  next()
}

/**
 * Check if user is Admin only
 */
export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  const { role } = req.decoded_authorization as TokenPayload

  if (role !== UserRole.Admin) {
    throw new ErrorWithStatus({
      message: USERS_MESSAGES.ADMIN_REQUIRED,
      status: HTTP_STATUS.FORBIDDEN
    })
  }

  next()
}

export const isAdminOrLicensedPharmacist = async (req: Request, res: Response, next: NextFunction) => {
  const { role, userId } = req.decoded_authorization as TokenPayload

  if (role === UserRole.Admin) return next()

  if (role !== UserRole.Pharmacist || !userId || !ObjectId.isValid(userId)) {
    throw new ErrorWithStatus({
      message: USERS_MESSAGES.ADMIN_OR_PHARMACIST_REQUIRED,
      status: HTTP_STATUS.FORBIDDEN
    })
  }

  const pharmacist = await databaseService.users.findOne({ _id: new ObjectId(userId), role: UserRole.Pharmacist })
  if (!pharmacist?.lisenseNumber) {
    throw new ErrorWithStatus({
      message: USERS_MESSAGES.ADMIN_OR_PHARMACIST_REQUIRED,
      status: HTTP_STATUS.FORBIDDEN
    })
  }

  return next()
}

// Export aliases for consistency with other routers
export const adminValidator = isAdmin
export const pharmacistOrAdminValidator = isAdminOrPharmacist
