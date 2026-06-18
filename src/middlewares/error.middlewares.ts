import { Request, Response, NextFunction } from 'express'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'
import { omit } from 'lodash'

export const defaultErrorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  // Kiểm tra nếu là ErrorWithStatus (cả class và object thường)
  if (err instanceof ErrorWithStatus) {
    return res.status(err.status).json(omit(err, ['status']))
  }
  console.error('[UnhandledError]', {
    method: req.method,
    path: req.originalUrl,
    message: err.message,
    stack: err.stack
  })

  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message
  })
}
