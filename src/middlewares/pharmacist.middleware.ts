import { Request, Response, NextFunction } from 'express'
import { UserRole } from '~/constants/enum'
import { TokenPayload } from '~/models/requests/User.request'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'

export const pharmacistValidator = (req: Request, res: Response, next: NextFunction) => {
    const { role } = req.decoded_authorization as TokenPayload
    if (role !== UserRole.Pharmacist && role !== UserRole.Admin) {
        return next(
            new ErrorWithStatus({
                message: 'Unauthorized access. Pharmacist or Admin role required.',
                status: HTTP_STATUS.FORBIDDEN
            })
        )
    }
    next()
}
