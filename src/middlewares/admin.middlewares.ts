import { Request, Response, NextFunction } from 'express'
import { TokenPayload } from '~/models/requests/User.request'
import { UserRole } from '~/constants/enum'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'

/**
 * Middleware to check if user has Admin role
 * Must be used after accessTokenValidator
 */
export const adminRequired = (req: Request, res: Response, next: NextFunction) => {
    const { role } = req.decoded_authorization as TokenPayload

    if (role !== UserRole.Admin) {
        throw new ErrorWithStatus({
            message: 'Admin access required. You do not have permission to access this resource.',
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
            message: 'Admin or Pharmacist access required. You do not have permission to access this resource.',
            status: HTTP_STATUS.FORBIDDEN
        })
    }

    next()
}
