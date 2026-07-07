import { NextFunction, Request, Response } from 'express'
import { checkSchema } from 'express-validator'
import { ObjectId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { redis } from '~/services/cache.services'
import { validate } from '~/utils/validation'

const COMMUNITY_RATE_WINDOW_MS = 60_000
const COMMUNITY_RATE_WINDOW_SECONDS = Math.ceil(COMMUNITY_RATE_WINDOW_MS / 1000)
const communityRateAttempts = new Map<string, { count: number; resetAt: number }>()

const communityRateLimitMaxByAction = {
  thread: Number(process.env.COMMUNITY_THREAD_RATE_LIMIT_MAX || 5),
  reply: Number(process.env.COMMUNITY_REPLY_RATE_LIMIT_MAX || 12),
  report: Number(process.env.COMMUNITY_REPORT_RATE_LIMIT_MAX || 10),
  reaction: Number(process.env.COMMUNITY_REACTION_RATE_LIMIT_MAX || 30)
}

const rejectCommunityRateLimit = (res: Response, action: keyof typeof communityRateLimitMaxByAction) => {
  const actionLabel = action === 'thread' ? 'tạo thread' : action === 'reply' ? 'gửi trả lời' : action === 'report' ? 'báo cáo nội dung' : 'react nội dung'
  return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
    message: `Bạn ${actionLabel} quá nhanh. Vui lòng thử lại sau.`
  })
}

const applyCommunityRateLimitFallback = (
  key: string,
  maxRequests: number,
  action: keyof typeof communityRateLimitMaxByAction,
  res: Response,
  next: NextFunction
) => {
  const now = Date.now()
  const current = communityRateAttempts.get(key)

  if (!current || current.resetAt <= now) {
    communityRateAttempts.set(key, { count: 1, resetAt: now + COMMUNITY_RATE_WINDOW_MS })
    return next()
  }

  if (current.count >= maxRequests) return rejectCommunityRateLimit(res, action)

  current.count += 1
  return next()
}

export const communityActionRateLimit = (action: keyof typeof communityRateLimitMaxByAction) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const identity = req.decoded_authorization?.userId || req.ip
    const maxRequests = communityRateLimitMaxByAction[action]
    const key = `rate-limit:community:${action}:${identity}:${req.path}`

    if (redis.status === 'ready') {
      try {
        const count = await redis.incr(key)
        if (count === 1) await redis.expire(key, COMMUNITY_RATE_WINDOW_SECONDS)
        if (count > maxRequests) return rejectCommunityRateLimit(res, action)
        return next()
      } catch {
        // Redis may become unavailable between the status check and command.
      }
    }

    return applyCommunityRateLimitFallback(key, maxRequests, action, res, next)
  }
}

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

export const threadIdValidator = validate(
  checkSchema(
    {
      threadId: {
        in: ['params'],
        notEmpty: { errorMessage: 'threadId là bắt buộc' },
        custom: {
          options: (value) => {
            if (!ObjectId.isValid(value)) throw new Error('threadId không hợp lệ')
            return true
          }
        }
      }
    },
    ['params']
  )
)

export const eventIdValidator = validate(
  checkSchema(
    {
      eventId: {
        in: ['params'],
        notEmpty: { errorMessage: 'eventId là bắt buộc' },
        custom: {
          options: (value) => {
            if (!ObjectId.isValid(value)) throw new Error('eventId không hợp lệ')
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
        isLength: { options: { min: 2, max: 80 }, errorMessage: 'slug độ dài 2-80 ký tự' },
        matches: {
          options: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/],
          errorMessage: 'slug chỉ dùng chữ thường, số và dấu gạch ngang'
        }
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
      },
      topicLabel: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'topicLabel phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 1, max: 100 }, errorMessage: 'topicLabel tối đa 100 ký tự' }
      },
      description: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'description phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 1, max: 500 }, errorMessage: 'description tối đa 500 ký tự' }
      },
      iconKey: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'iconKey phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 1, max: 60 }, errorMessage: 'iconKey tối đa 60 ký tự' }
      },
      coverImage: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'coverImage phải là chuỗi' },
        trim: true,
        isURL: { options: { require_protocol: true }, errorMessage: 'coverImage không hợp lệ' },
        isLength: { options: { max: 1000 }, errorMessage: 'coverImage tối đa 1000 ký tự' }
      },
      guidelines: {
        in: ['body'],
        optional: true,
        isArray: { options: { max: 8 }, errorMessage: 'guidelines tối đa 8 dòng' }
      },
      'guidelines.*': {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'guideline phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 1, max: 180 }, errorMessage: 'mỗi guideline tối đa 180 ký tự' }
      },
      pinnedMessage: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'pinnedMessage phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 1, max: 300 }, errorMessage: 'pinnedMessage tối đa 300 ký tự' }
      },
      featured: {
        in: ['body'],
        optional: true,
        isBoolean: { errorMessage: 'featured phải là boolean' },
        toBoolean: true
      },
      sortOrder: {
        in: ['body'],
        optional: true,
        isInt: { options: { min: 0, max: 100000 }, errorMessage: 'sortOrder không hợp lệ' },
        toInt: true
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
        isLength: { options: { min: 2, max: 80 }, errorMessage: 'slug độ dài 2-80 ký tự' },
        matches: {
          options: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/],
          errorMessage: 'slug chỉ dùng chữ thường, số và dấu gạch ngang'
        }
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
      },
      topicLabel: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'topicLabel phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 1, max: 100 }, errorMessage: 'topicLabel tối đa 100 ký tự' }
      },
      description: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'description phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 1, max: 500 }, errorMessage: 'description tối đa 500 ký tự' }
      },
      iconKey: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'iconKey phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 1, max: 60 }, errorMessage: 'iconKey tối đa 60 ký tự' }
      },
      coverImage: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'coverImage phải là chuỗi' },
        trim: true,
        isURL: { options: { require_protocol: true }, errorMessage: 'coverImage không hợp lệ' },
        isLength: { options: { max: 1000 }, errorMessage: 'coverImage tối đa 1000 ký tự' }
      },
      guidelines: {
        in: ['body'],
        optional: true,
        isArray: { options: { max: 8 }, errorMessage: 'guidelines tối đa 8 dòng' }
      },
      'guidelines.*': {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'guideline phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 1, max: 180 }, errorMessage: 'mỗi guideline tối đa 180 ký tự' }
      },
      pinnedMessage: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'pinnedMessage phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 1, max: 300 }, errorMessage: 'pinnedMessage tối đa 300 ký tự' }
      },
      featured: {
        in: ['body'],
        optional: true,
        isBoolean: { errorMessage: 'featured phải là boolean' },
        toBoolean: true
      },
      sortOrder: {
        in: ['body'],
        optional: true,
        isInt: { options: { min: 0, max: 100000 }, errorMessage: 'sortOrder không hợp lệ' },
        toInt: true
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
        optional: true,
        isString: { errorMessage: 'content phải là chuỗi' },
        trim: true,
        isLength: { options: { max: 2000 }, errorMessage: 'content tối đa 2000 ký tự' }
      },
      imageUrl: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'imageUrl phải là chuỗi' },
        trim: true,
        isURL: { options: { require_protocol: true }, errorMessage: 'imageUrl không hợp lệ' },
        isLength: { options: { max: 1000 }, errorMessage: 'imageUrl tối đa 1000 ký tự' }
      },
      replyToMessageId: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'replyToMessageId phải là chuỗi' },
        custom: {
          options: (value) => {
            if (value && !ObjectId.isValid(value)) throw new Error('replyToMessageId không hợp lệ')
            return true
          }
        }
      },
      _messagePayload: {
        in: ['body'],
        custom: {
          options: (_value, { req }) => {
            const content = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
            const imageUrl = typeof req.body?.imageUrl === 'string' ? req.body.imageUrl.trim() : ''
            if (!content && !imageUrl) throw new Error('Tin nhắn phải có nội dung hoặc ảnh')
            return true
          }
        }
      }
    },
    ['body']
  )
)

const threadPrefixes = ['question', 'review', 'warning', 'story', 'experience', 'pharmacist']

export const createThreadValidator = validate(
  checkSchema(
    {
      title: {
        in: ['body'],
        notEmpty: { errorMessage: 'title là bắt buộc' },
        isString: { errorMessage: 'title phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 8, max: 160 }, errorMessage: 'title độ dài 8-160 ký tự' }
      },
      content: {
        in: ['body'],
        notEmpty: { errorMessage: 'content là bắt buộc' },
        isString: { errorMessage: 'content phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 10, max: 8000 }, errorMessage: 'content độ dài 10-8000 ký tự' }
      },
      prefix: {
        in: ['body'],
        optional: true,
        isIn: { options: [threadPrefixes], errorMessage: 'prefix không hợp lệ' }
      },
      tags: {
        in: ['body'],
        optional: true,
        isArray: { options: { max: 8 }, errorMessage: 'tags tối đa 8 mục' }
      },
      'tags.*': {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'tag phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 1, max: 40 }, errorMessage: 'mỗi tag tối đa 40 ký tự' }
      },
      isAnonymous: {
        in: ['body'],
        optional: true,
        isBoolean: { errorMessage: 'isAnonymous phải là boolean' },
        toBoolean: true
      },
      imageUrl: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'imageUrl phải là chuỗi' },
        trim: true,
        isURL: { options: { require_protocol: true }, errorMessage: 'imageUrl không hợp lệ' },
        isLength: { options: { max: 1000 }, errorMessage: 'imageUrl tối đa 1000 ký tự' }
      }
    },
    ['body']
  )
)

export const createThreadReplyValidator = validate(
  checkSchema(
    {
      content: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'content phải là chuỗi' },
        trim: true,
        isLength: { options: { max: 8000 }, errorMessage: 'content tối đa 8000 ký tự' }
      },
      imageUrl: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'imageUrl phải là chuỗi' },
        trim: true,
        isURL: { options: { require_protocol: true }, errorMessage: 'imageUrl không hợp lệ' },
        isLength: { options: { max: 1000 }, errorMessage: 'imageUrl tối đa 1000 ký tự' }
      },
      replyToMessageId: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'replyToMessageId phải là chuỗi' },
        custom: {
          options: (value) => {
            if (value && !ObjectId.isValid(value)) throw new Error('replyToMessageId không hợp lệ')
            return true
          }
        }
      },
      _replyPayload: {
        in: ['body'],
        custom: {
          options: (_value, { req }) => {
            const content = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
            const imageUrl = typeof req.body?.imageUrl === 'string' ? req.body.imageUrl.trim() : ''
            if (!content && !imageUrl) throw new Error('Reply phải có nội dung hoặc ảnh')
            return true
          }
        }
      }
    },
    ['body']
  )
)

export const updateThreadValidator = validate(
  checkSchema(
    {
      sticky: {
        in: ['body'],
        optional: true,
        isBoolean: { errorMessage: 'sticky phải là boolean' },
        toBoolean: true
      },
      locked: {
        in: ['body'],
        optional: true,
        isBoolean: { errorMessage: 'locked phải là boolean' },
        toBoolean: true
      },
      status: {
        in: ['body'],
        optional: true,
        isIn: { options: [['open', 'answered', 'hidden', 'deleted']], errorMessage: 'status không hợp lệ' }
      },
      acceptedReplyId: {
        in: ['body'],
        optional: { options: { nullable: true } },
        custom: {
          options: (value) => {
            if (value && !ObjectId.isValid(value)) throw new Error('acceptedReplyId không hợp lệ')
            return true
          }
        }
      },
      videoMeeting: {
        in: ['body'],
        optional: { options: { nullable: true } },
        custom: {
          options: (value) => {
            if (value === null || value === undefined) return true
            if (typeof value !== 'object' || Array.isArray(value)) throw new Error('videoMeeting không hợp lệ')
            const url = typeof value.url === 'string' ? value.url.trim() : ''
            if (!url) throw new Error('videoMeeting.url là bắt buộc')
            const isInternalVideoEvent = /^\/community\/video-events\/[a-fA-F0-9]{24}$/.test(url)
            if (!isInternalVideoEvent) {
              try {
                const parsed = new URL(url)
                if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
              } catch {
                throw new Error('videoMeeting.url không hợp lệ')
              }
            }
            if (value.eventId && !ObjectId.isValid(value.eventId)) {
              throw new Error('videoMeeting.eventId không hợp lệ')
            }
            if (value.status && !['scheduled', 'live', 'ended'].includes(value.status)) {
              throw new Error('videoMeeting.status không hợp lệ')
            }
            if (value.startsAt && Number.isNaN(new Date(value.startsAt).getTime())) {
              throw new Error('videoMeeting.startsAt không hợp lệ')
            }
            if (value.endsAt && Number.isNaN(new Date(value.endsAt).getTime())) {
              throw new Error('videoMeeting.endsAt không hợp lệ')
            }
            return true
          }
        }
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

export const reactToMessageValidator = validate(
  checkSchema(
    {
      type: {
        in: ['body'],
        optional: { options: { nullable: true } },
        isIn: {
          options: [['like', 'love', 'haha', 'wow', 'sad', 'angry', 'helpful', 'thanks', 'care', 'dislike']],
          errorMessage: 'type chỉ nhận like|love|haha|wow|sad|angry|helpful|thanks|care|dislike|null'
        }
      }
    },
    ['body']
  )
)

export const updateMessageValidator = validate(
  checkSchema(
    {
      content: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'content phải là chuỗi' },
        trim: true,
        isLength: { options: { max: 8000 }, errorMessage: 'content tối đa 8000 ký tự' }
      },
      imageUrl: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'imageUrl phải là chuỗi' },
        trim: true,
        isURL: { options: { require_protocol: true }, errorMessage: 'imageUrl không hợp lệ' },
        isLength: { options: { max: 1000 }, errorMessage: 'imageUrl tối đa 1000 ký tự' }
      },
      _messagePayload: {
        in: ['body'],
        custom: {
          options: (_value, { req }) => {
            const content = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
            const imageUrl = typeof req.body?.imageUrl === 'string' ? req.body.imageUrl.trim() : ''
            if (!content && !imageUrl) throw new Error('Bài viết phải có nội dung hoặc ảnh')
            return true
          }
        }
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

const dateValidator = (fieldName: string): any => ({
  in: ['body'],
  notEmpty: { errorMessage: `${fieldName} là bắt buộc` },
  custom: {
    options: (value: string) => {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) throw new Error(`${fieldName} không hợp lệ`)
      return true
    }
  }
})

const optionalDateValidator = (fieldName: string): any => ({
  in: ['body'],
  optional: true,
  custom: {
    options: (value: string) => {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) throw new Error(`${fieldName} không hợp lệ`)
      return true
    }
  }
})

const objectIdArrayValidator = (fieldName: string, maxLength = 20): any => ({
  in: ['body'],
  optional: true,
  isArray: { options: { max: maxLength }, errorMessage: `${fieldName} phải là mảng và tối đa ${maxLength} phần tử` },
  custom: {
    options: (value: unknown) => {
      if (!Array.isArray(value)) return true
      if (value.length > maxLength) throw new Error(`${fieldName} tối đa ${maxLength} phần tử`)
      if (value.some((id) => typeof id !== 'string' || !ObjectId.isValid(id))) {
        throw new Error(`${fieldName} chứa ObjectId không hợp lệ`)
      }
      return true
    }
  }
})

const stringArrayValidator = (fieldName: string, maxLength = 30, maxItemLength = 80): any => ({
  in: ['body'],
  optional: true,
  isArray: { options: { max: maxLength }, errorMessage: `${fieldName} phải là mảng và tối đa ${maxLength} phần tử` },
  custom: {
    options: (value: unknown) => {
      if (!Array.isArray(value)) return true
      if (value.length > maxLength) throw new Error(`${fieldName} tối đa ${maxLength} phần tử`)
      if (
        value.some((item) => typeof item !== 'string' || item.trim().length === 0 || item.trim().length > maxItemLength)
      ) {
        throw new Error(`${fieldName} chỉ nhận chuỗi 1-${maxItemLength} ký tự`)
      }
      return true
    }
  }
})

const objectArrayValidator = (fieldName: string, maxLength = 20): any => ({
  in: ['body'],
  optional: true,
  isArray: { options: { max: maxLength }, errorMessage: `${fieldName} phải là mảng và tối đa ${maxLength} phần tử` },
  custom: {
    options: (value: unknown) => {
      if (!Array.isArray(value)) return true
      if (value.length > maxLength) throw new Error(`${fieldName} tối đa ${maxLength} phần tử`)
      if (value.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
        throw new Error(`${fieldName} chỉ nhận object`)
      }
      return true
    }
  }
})

export const createVideoEventValidator = validate(
  checkSchema(
    {
      roomId: {
        in: ['body'],
        notEmpty: { errorMessage: 'roomId là bắt buộc' },
        custom: {
          options: (value) => {
            if (!ObjectId.isValid(value)) throw new Error('roomId không hợp lệ')
            return true
          }
        }
      },
      title: {
        in: ['body'],
        notEmpty: { errorMessage: 'title là bắt buộc' },
        isString: { errorMessage: 'title phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 3, max: 160 }, errorMessage: 'title độ dài 3-160 ký tự' }
      },
      description: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'description phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 1, max: 3000 }, errorMessage: 'description tối đa 3000 ký tự' }
      },
      agenda: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'agenda phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 1, max: 3000 }, errorMessage: 'agenda tối đa 3000 ký tự' }
      },
      status: {
        in: ['body'],
        optional: true,
        isIn: { options: [['draft', 'scheduled']], errorMessage: 'status khi tạo chỉ nhận draft|scheduled' }
      },
      scheduledStartAt: dateValidator('scheduledStartAt'),
      scheduledEndAt: dateValidator('scheduledEndAt'),
      hostIds: objectIdArrayValidator('hostIds', 50),
      speakerProfiles: objectArrayValidator('speakerProfiles'),
      registrationRequired: {
        in: ['body'],
        optional: true,
        isBoolean: { errorMessage: 'registrationRequired phải là boolean' }
      },
      capacity: {
        in: ['body'],
        optional: { options: { nullable: true } },
        isInt: { options: { min: 1, max: 10000 }, errorMessage: 'capacity không hợp lệ' },
        toInt: true
      },
      provider: { in: ['body'], optional: true, isString: { errorMessage: 'provider phải là chuỗi' }, trim: true },
      providerMeetingId: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'providerMeetingId phải là chuỗi' },
        trim: true
      },
      meetingUrl: { in: ['body'], optional: true, isString: { errorMessage: 'meetingUrl phải là chuỗi' }, trim: true },
      tags: stringArrayValidator('tags'),
      materials: objectArrayValidator('materials', 30)
    },
    ['body']
  )
)

export const updateVideoEventValidator = validate(
  checkSchema(
    {
      title: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'title phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 3, max: 160 }, errorMessage: 'title độ dài 3-160 ký tự' }
      },
      description: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'description phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 1, max: 3000 }, errorMessage: 'description tối đa 3000 ký tự' }
      },
      agenda: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'agenda phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 1, max: 3000 }, errorMessage: 'agenda tối đa 3000 ký tự' }
      },
      status: {
        in: ['body'],
        optional: true,
        isIn: {
          options: [['draft', 'scheduled']],
          errorMessage: 'status khi cập nhật chỉ nhận draft|scheduled. Dùng endpoint start/end/cancel cho lifecycle.'
        }
      },
      scheduledStartAt: optionalDateValidator('scheduledStartAt'),
      scheduledEndAt: optionalDateValidator('scheduledEndAt'),
      hostIds: objectIdArrayValidator('hostIds', 50),
      speakerProfiles: objectArrayValidator('speakerProfiles'),
      registrationRequired: {
        in: ['body'],
        optional: true,
        isBoolean: { errorMessage: 'registrationRequired phải là boolean' }
      },
      capacity: {
        in: ['body'],
        optional: { options: { nullable: true } },
        isInt: { options: { min: 1, max: 10000 }, errorMessage: 'capacity không hợp lệ' },
        toInt: true
      },
      provider: { in: ['body'], optional: true, isString: { errorMessage: 'provider phải là chuỗi' }, trim: true },
      providerMeetingId: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'providerMeetingId phải là chuỗi' },
        trim: true
      },
      meetingUrl: { in: ['body'], optional: true, isString: { errorMessage: 'meetingUrl phải là chuỗi' }, trim: true },
      tags: stringArrayValidator('tags'),
      materials: objectArrayValidator('materials', 30)
    },
    ['body']
  )
)

export const updateVideoRegistrationValidator = validate(
  checkSchema(
    {
      status: {
        in: ['body'],
        optional: true,
        isIn: {
          options: [['registered', 'cancelled', 'attended', 'no_show', 'removed']],
          errorMessage: 'status đăng ký không hợp lệ'
        }
      },
      removeReason: {
        in: ['body'],
        optional: true,
        isString: { errorMessage: 'removeReason phải là chuỗi' },
        trim: true,
        isLength: { options: { min: 1, max: 500 }, errorMessage: 'removeReason tối đa 500 ký tự' }
      }
    },
    ['body']
  )
)
