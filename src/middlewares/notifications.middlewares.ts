import { checkSchema } from 'express-validator'
import { ObjectId } from 'mongodb'
import { validate } from '~/utils/validation'

export const notificationIdValidator = validate(
  checkSchema(
    {
      id: {
        in: ['params'],
        notEmpty: {
          errorMessage: 'Notification ID is required'
        },
        custom: {
          options: (value) => {
            if (!ObjectId.isValid(value)) {
              throw new Error('Invalid Notification ID format')
            }
            return true
          }
        }
      }
    },
    ['params']
  )
)

export const getNotificationsValidator = validate(
  checkSchema(
    {
      page: {
        in: ['query'],
        optional: true,
        isInt: {
          options: { min: 1 },
          errorMessage: 'Page must be a positive integer'
        },
        toInt: true
      },
      limit: {
        in: ['query'],
        optional: true,
        isInt: {
          options: { min: 1, max: 100 },
          errorMessage: 'Limit must be a positive integer between 1 and 100'
        },
        toInt: true
      },
      filter: {
        in: ['query'],
        optional: true,
        isIn: {
          options: [[
            'all',
            'unread',
            'order',
            'payment',
            'shipping',
            'prescription',
            'promotion',
            'system',
            'reminder',
            'review',
            'return',
            'security',
            'community'
          ]],
          errorMessage: 'Invalid filter value'
        }
      }
    },
    ['query']
  )
)
