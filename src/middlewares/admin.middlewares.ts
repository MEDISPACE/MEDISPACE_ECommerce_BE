import { Request, Response, NextFunction } from 'express'
import { TokenPayload } from '~/models/requests/User.request'
import { UserRole } from '~/constants/enum'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'
import { USERS_MESSAGES } from '~/constants/message'

/**
 * Middleware to check if user has Admin role
 * Must be used after accessTokenValidator
 */
export const adminRequired = (req: Request, res: Response, next: NextFunction) => {
    const { role } = req.decoded_authorization as TokenPayload

    if (role !== UserRole.Admin) {
        throw new ErrorWithStatus({
            message: USERS_MESSAGES.ADMIN_REQUIRED,
            status: HTTP_STATUS.FORBIDDEN
        })
    }

    next()
}

/**
 * Middleware to check if user has Admin or Pharmacist role
 * Must be used after accessTokenValidator
 */
export const adminOrPharmacistRequired = (req: Request, res: Response, next: NextFunction) => {
    const { role } = req.decoded_authorization as TokenPayload

    if (role !== UserRole.Admin && role !== UserRole.Pharmacist) {
        throw new ErrorWithStatus({
            message: USERS_MESSAGES.ADMIN_OR_PHARMACIST_REQUIRED,
            status: HTTP_STATUS.FORBIDDEN
        })
    }

    next()
}
