import { config } from 'dotenv'
import jwt, { SignOptions } from 'jsonwebtoken'
import { TokenPayload } from '~/models/requests/User.request'
config()
export const signToken = ({
  payload,
  privateKey,
  options = {
    algorithm: 'HS256'
  }
}: {
  payload: string | Buffer | object
  privateKey: string
  options?: SignOptions & { expiresIn?: string | number }
}) => {
  return new Promise<string>((resolve) => {
    jwt.sign(payload, privateKey, options, (error, token) => {
      if (error) {
        throw new Error('Token signing failed')
      }
      resolve(token as string)
    })
  })
}
export const verifyToken = ({ token, secretOrPublicKey }: { token: string; secretOrPublicKey: string }) => {
  return new Promise<TokenPayload>((resolve, reject) => {
    jwt.verify(token, secretOrPublicKey, (error, decoded) => {
      if (error) {
        return reject(error)
      }
      resolve(decoded as TokenPayload)
    })
  })
}
