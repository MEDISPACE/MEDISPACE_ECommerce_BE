import { Request, Response, NextFunction } from 'express'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'
import { omit } from 'lodash'

export const defaultErrorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {

  // Kiểm tra nếu là ErrorWithStatus (cả class và object thường)
  if (err instanceof ErrorWithStatus) {
    return res.status(err.status).json(omit(err, ['status']))
  }
  Object.getOwnPropertyNames(err).forEach((key) => {
    Object.defineProperty(err, key, { enumerable: true })
  })
  // Default error
  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    message: err.message,
    errorInfo: err
  })
}
