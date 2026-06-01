import { checkSchema } from 'express-validator'
import { ObjectId } from 'mongodb'
import { validate } from '~/utils/validation'

export const roomIdValidator = validate(
  checkSchema(
    {
      roomId: {
        in: ['params'],
        notEmpty: { errorMessage: 'roomId là bắt buộc' },
        custom: {
          options: (value) => {
            if (!ObjectId.isValid(value)) throw new Error('roomId không hợp lệ')
            return true
          }
        }
      }
    },
    ['params']
  )
)

export const messageIdValidator = validate(
  checkSchema(
    {
      messageId: {
        in: ['params'],
        notEmpty: { errorMessage: 'messageId là bắt buộc' },
        custom: {
          options: (value) => {
            if (!ObjectId.isValid(value)) throw new Error('messageId không hợp lệ')
            return true
          }
        }
      }
    },
    ['params']
  )
)

export const appealIdValidator = validate(
  checkSchema(
    {
      appealId: {
        in: ['params'],
        notEmpty: { errorMessage: 'appealId là bắt buộc' },
        custom: {
          options: (value) => {
            if (!ObjectId.isValid(value)) throw new Error('appealId không hợp lệ')
            return true
          }
        }
      }
    },
    ['params']
  )
)

export const userIdParamValidator = validate(
  checkSchema(
    {
      userId: {
        in: ['params'],
        notEmpty: { errorMessage: 'userId là bắt buộc' },
        custom: {
          options: (value) => {
            if (!ObjectId.isValid(value)) throw new Error('userId không hợp lệ')
            return true
          }
        }
      }
    },
    ['params']
  )
)

export const createRoomValidator = validate(
  checkSchema(
    {
      name: {
        in: ['body'],
        notEmpty: { errorMessage: 'name là bắt buộc' },
        isString: { errorMessage: 'name phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 2, max: 80 }, errorMessage: 'name độ dài 2-80 ký tự' }
      },
      slug: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'slug phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 2, max: 80 }, errorMessage: 'slug độ dài 2-80 ký tự' }
      },
      visibility: {
        in: ['body'],
        notEmpty: { errorMessage: 'visibility là bắt buộc' },
        isIn: { options: [['public', 'private']], errorMessage: 'visibility chỉ nhận public|private' }
      },
      diseaseKey: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'diseaseKey phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 1, max: 80 }, errorMessage: 'diseaseKey tối đa 80 ký tự' }
      }
    },
    ['body']
  )
)

export const updateRoomValidator = validate(
  checkSchema(
    {
      name: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'name phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 2, max: 80 }, errorMessage: 'name độ dài 2-80 ký tự' }
      },
      slug: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'slug phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 2, max: 80 }, errorMessage: 'slug độ dài 2-80 ký tự' }
      },
      visibility: {
        in: ['body'],
        optional: true,
        isIn: { options: [['public', 'private']], errorMessage: 'visibility chỉ nhận public|private' }
      },
      diseaseKey: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'diseaseKey phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 1, max: 80 }, errorMessage: 'diseaseKey tối đa 80 ký tự' }
      }
    },
    ['body']
  )
)

export const paginationValidator = validate(
  checkSchema(
    {
      page: {
        in: ['query'],
        optional: true,
        isInt: { options: { min: 1, max: 100000 }, errorMessage: 'page không hợp lệ' },
        toInt: true
      },
      limit: {
        in: ['query'],
        optional: true,
        isInt: { options: { min: 1, max: 50 }, errorMessage: 'limit không hợp lệ' },
        toInt: true
      }
    },
    ['query']
  )
)

export const sendMessageValidator = validate(
  checkSchema(
    {
      content: {
        in: ['body'],
        notEmpty: { errorMessage: 'content là bắt buộc' },
        isString: { errorMessage: 'content phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 1, max: 2000 }, errorMessage: 'content tối đa 2000 ký tự' }
      }
    },
    ['body']
  )
)

export const reportMessageValidator = validate(
  checkSchema(
    {
      reason: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'reason phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 1, max: 300 }, errorMessage: 'reason tối đa 300 ký tự' }
      }
    },
    ['body']
  )
)

export const createAppealValidator = validate(
  checkSchema(
    {
      type: {
        in: ['body'],
        notEmpty: { errorMessage: 'type là bắt buộc' },
        isIn: { options: [['ban', 'mute', 'message']], errorMessage: 'type chỉ nhận ban|mute|message' }
      },
      reason: {
        in: ['body'],
        notEmpty: { errorMessage: 'reason là bắt buộc' },
        isString: { errorMessage: 'reason phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 10, max: 1000 }, errorMessage: 'reason độ dài 10-1000 ký tự' }
      },
      messageId: {
        in: ['body'],
        optional: true,
        custom: {
          options: (value) => {
            if (!ObjectId.isValid(value)) throw new Error('messageId không hợp lệ')
            return true
          }
        }
      }
    },
    ['body']
  )
)

export const resolveAppealValidator = validate(
  checkSchema(
    {
      decision: {
        in: ['body'],
        notEmpty: { errorMessage: 'decision là bắt buộc' },
        isIn: { options: [['approved', 'rejected']], errorMessage: 'decision chỉ nhận approved|rejected' }
      },
      notes: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'notes phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 1, max: 500 }, errorMessage: 'notes tối đa 500 ký tự' }
      }
    },
    ['body']
  )
)

export const moderationActionValidator = validate(
  checkSchema(
    {
      action: {
        in: ['body'],
        notEmpty: { errorMessage: 'action là bắt buộc' },
        isIn: {
          options: [
            [
              'approve',
              'hide',
              'delete',
              'mute_user',
              'ban_user',
              'unmute_user',
              'unban_user',
              'restore_message',
              'reopen_finding'
            ]
          ],
          errorMessage: 'action không hợp lệ'
        }
      },
      notes: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'notes phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 1, max: 500 }, errorMessage: 'notes tối đa 500 ký tự' }
      },
      durationMinutes: {
        in: ['body'],
        optional: true,
        isInt: { options: { min: 1, max: 1440 }, errorMessage: 'durationMinutes 1-1440' },
        toInt: true
      },
      targetUserId: {
        in: ['body'],
        optional: true,
        custom: {
          options: (value) => {
            if (!ObjectId.isValid(value)) throw new Error('targetUserId không hợp lệ')
            return true
          }
        }
      }
    },
    ['body']
  )
)

export const memberActionValidator = validate(
  checkSchema(
    {
      status: {
        in: ['body'],
        optional: true,
        isIn: {
          options: [['pending', 'invited', 'active', 'left', 'banned']],
          errorMessage: 'status không hợp lệ'
        }
      },
      role: {
        in: ['body'],
        optional: true,
        isIn: { options: [['member', 'moderator', 'admin']], errorMessage: 'role không hợp lệ' }
      },
      mutedUntil: {
        in: ['body'],
        optional: { options: { nullable: true } },
        custom: {
          options: (value) => {
            if (value === null || value === '') return true
            const date = new Date(value)
            if (Number.isNaN(date.getTime())) throw new Error('mutedUntil không hợp lệ')
            return true
          }
        }
      }
    },
    ['body']
  )
)

export const inviteMemberValidator = validate(
  checkSchema(
    {
      userId: {
        in: ['body'],
        optional: true,
        custom: {
          options: (value) => {
            if (!ObjectId.isValid(value)) throw new Error('userId không hợp lệ')
            return true
          }
        }
      },
      email: {
        in: ['body'],
        optional: true,
        isEmail: { errorMessage: 'email không hợp lệ' },
        trim: true
      }
    },
    ['body']
  )
)
