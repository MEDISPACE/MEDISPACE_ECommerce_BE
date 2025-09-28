import { ObjectId } from 'mongodb'

interface RefreshTokenType {
  _id?: ObjectId
  userId: ObjectId
  token: string
  create_at?: Date
}
export default class RefreshToken {
  _id?: ObjectId
  userId: ObjectId
  token: string
  create_at: Date
  constructor({ _id, userId, token, create_at }: RefreshTokenType) {
    this._id = _id
    this.userId = userId
    this.token = token
    this.create_at = create_at || new Date()
  }
}
