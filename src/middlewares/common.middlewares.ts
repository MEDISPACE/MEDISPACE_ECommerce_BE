import { Request, Response, NextFunction } from 'express'
import { TokenPayload } from '~/models/requests/User.request'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'
import { UserRole } from '~/constants/enum'
import { USERS_MESSAGES } from '~/constants/message'

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
