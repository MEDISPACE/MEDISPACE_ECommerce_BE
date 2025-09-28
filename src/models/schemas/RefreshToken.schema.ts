import { ObjectId } from 'mongodb'

interface RefreshTokenType {
  _id?: ObjectId
  user_id: ObjectId
  token: string
  create_at?: Date
}
export default class RefreshToken {
  _id?: ObjectId
  user_id: ObjectId
  token: string
  create_at: Date
  constructor({ _id, user_id, token, create_at }: RefreshTokenType) {
    this._id = _id
    this.user_id = user_id
    this.token = token
    this.create_at = create_at || new Date()
  }
}
