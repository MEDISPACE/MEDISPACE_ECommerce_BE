import User from './models/schemas/User.schema'
import { TokenPayload } from './models/requests/User.request'

declare module 'express-serve-static-core' {
  interface Request {
    user?: User
    decoded_authorization?: TokenPayload
    decodedRefreshToken?: TokenPayload
    decodedEmailVerifyToken?: TokenPayload
    decodedForgotPasswordToken?: TokenPayload
  }
}
