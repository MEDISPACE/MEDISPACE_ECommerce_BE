import express from 'express'
import { validationResult, ValidationChain } from 'express-validator'
import { RunnableValidationChains } from 'express-validator/lib/middlewares/schema'
import HTTP_STATUS from '~/constants/httpStatus'
import { EntityError } from '~/models/Error'

export const validate = (validation: RunnableValidationChains<ValidationChain>) => {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    await validation.run(req)
    const errors = validationResult(req)
    // Nếu không có lỗi thì tiếp tục
    if (errors.isEmpty()) {
      return next()
    }
    const errorsObject = errors.mapped()
    const entityErrors = new EntityError({ errors: {} })
    // Kiểm tra có lỗi nào có thuộc tính status không
    for (const key in errorsObject) {
      const { msg } = errorsObject[key]
      // Kiểm tra nếu msg có thuộc tính status (từ serialized ErrorWithStatus)
      if (msg && typeof msg === 'object' && 'status' in msg && msg.status !== HTTP_STATUS.UNPROCESSABLE_ENTITY) {
        return next(msg)
      }
      entityErrors.errors[key] = errorsObject[key]
    }
    next(entityErrors)
  }
}
