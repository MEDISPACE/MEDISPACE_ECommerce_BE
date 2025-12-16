import { checkSchema } from 'express-validator'
import { ObjectId } from 'mongodb'
import { validate } from '~/utils/validation'
import databaseService from '~/services/database.services'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'

/**
 * Validation middleware for review operations
 */

// Validate review creation
export const createReviewValidator = validate(
  checkSchema(
    {
      productId: {
        in: ['body'],
        notEmpty: {
          errorMessage: 'Product ID is required'
        },
        custom: {
          options: async (value) => {
            if (!ObjectId.isValid(value)) {
              throw new Error('Invalid product ID format')
            }

            // Check if product exists
            const product = await databaseService.products.findOne({ _id: new ObjectId(value) })
            if (!product) {
              throw new Error('Product not found')
            }

            return true
          }
        }
      },
      orderId: {
        in: ['body'],
        notEmpty: {
          errorMessage: 'Order ID is required'
        },
        custom: {
          options: (value) => {
            if (!ObjectId.isValid(value)) {
              throw new Error('Invalid order ID format')
            }
            return true
          }
        }
      },
      rating: {
        in: ['body'],
        notEmpty: {
          errorMessage: 'Rating is required'
        },
        isInt: {
          options: { min: 1, max: 5 },
          errorMessage: 'Rating must be an integer between 1 and 5'
        },
        toInt: true
      },
      title: {
        in: ['body'],
        optional: true,
        isString: {
          errorMessage: 'Title must be a string'
        },
        isLength: {
          options: { max: 200 },
          errorMessage: 'Title must not exceed 200 characters'
        },
        trim: true
      },
      comment: {
        in: ['body'],
        notEmpty: {
          errorMessage: 'Review comment is required'
        },
        isString: {
          errorMessage: 'Comment must be a string'
        },
        isLength: {
          options: { min: 10, max: 2000 },
          errorMessage: 'Comment must be between 10 and 2000 characters'
        },
        trim: true
      },
      images: {
        in: ['body'],
        optional: true,
        isArray: {
          errorMessage: 'Images must be an array'
        },
        custom: {
          options: (value) => {
            if (value && value.length > 5) {
              throw new Error('Maximum 5 images allowed')
            }
            return true
          }
        }
      }
    },
    ['body']
  )
)

// Validate review update
export const updateReviewValidator = validate(
  checkSchema(
    {
      reviewId: {
        in: ['params'],
        notEmpty: {
          errorMessage: 'Review ID is required'
        },
        custom: {
          options: async (value) => {
            if (!ObjectId.isValid(value)) {
              throw new Error('Invalid review ID format')
            }

            // Check if review exists
            const review = await databaseService.reviews.findOne({ _id: new ObjectId(value) })
            if (!review) {
              throw new Error('Review not found')
            }

            return true
          }
        }
      },
      rating: {
        in: ['body'],
        optional: true,
        isInt: {
          options: { min: 1, max: 5 },
          errorMessage: 'Rating must be an integer between 1 and 5'
        },
        toInt: true
      },
      title: {
        in: ['body'],
        optional: true,
        isString: {
          errorMessage: 'Title must be a string'
        },
        isLength: {
          options: { max: 200 },
          errorMessage: 'Title must not exceed 200 characters'
        },
        trim: true
      },
      comment: {
        in: ['body'],
        optional: true,
        isString: {
          errorMessage: 'Comment must be a string'
        },
        isLength: {
          options: { min: 10, max: 2000 },
          errorMessage: 'Comment must be between 10 and 2000 characters'
        },
        trim: true
      },
      images: {
        in: ['body'],
        optional: true,
        isArray: {
          errorMessage: 'Images must be an array'
        },
        custom: {
          options: (value) => {
            if (value && value.length > 5) {
              throw new Error('Maximum 5 images allowed')
            }
            return true
          }
        }
      }
    },
    ['params', 'body']
  )
)

// Validate review ID parameter
export const reviewIdValidator = validate(
  checkSchema(
    {
      reviewId: {
        in: ['params'],
        notEmpty: {
          errorMessage: 'Review ID is required'
        },
        custom: {
          options: async (value) => {
            if (!ObjectId.isValid(value)) {
              throw new Error('Invalid review ID format')
            }

            const review = await databaseService.reviews.findOne({ _id: new ObjectId(value) })
            if (!review) {
              throw new Error('Review not found')
            }

            return true
          }
        }
      }
    },
    ['params']
  )
)

// Validate product ID for getting reviews
export const productIdValidator = validate(
  checkSchema(
    {
      productId: {
        in: ['params'],
        notEmpty: {
          errorMessage: 'Product ID is required'
        },
        custom: {
          options: async (value) => {
            if (!ObjectId.isValid(value)) {
              throw new Error('Invalid product ID format')
            }

            const product = await databaseService.products.findOne({ _id: new ObjectId(value) })
            if (!product) {
              throw new Error('Product not found')
            }

            return true
          }
        }
      },
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
          options: { min: 1, max: 50 },
          errorMessage: 'Limit must be between 1 and 50'
        },
        toInt: true
      },
      sortBy: {
        in: ['query'],
        optional: true,
        isIn: {
          options: [['newest', 'oldest', 'highest', 'lowest', 'helpful']],
          errorMessage: 'Sort by must be one of: newest, oldest, highest, lowest, helpful'
        }
      }
    },
    ['params', 'query']
  )
)

// Validate review moderation
export const moderateReviewValidator = validate(
  checkSchema(
    {
      reviewId: {
        in: ['params'],
        notEmpty: {
          errorMessage: 'Review ID is required'
        },
        custom: {
          options: async (value) => {
            if (!ObjectId.isValid(value)) {
              throw new Error('Invalid review ID format')
            }

            const review = await databaseService.reviews.findOne({ _id: new ObjectId(value) })
            if (!review) {
              throw new Error('Review not found')
            }

            return true
          }
        }
      },
      status: {
        in: ['body'],
        notEmpty: {
          errorMessage: 'Status is required'
        },
        isIn: {
          options: [['approved', 'rejected']],
          errorMessage: 'Status must be either approved or rejected'
        }
      },
      notes: {
        in: ['body'],
        optional: true,
        isString: {
          errorMessage: 'Notes must be a string'
        },
        trim: true,
        custom: {
          options: (value, { req }) => {
            // Rejection requires notes
            if (req.body.status === 'rejected' && (!value || value.trim().length === 0)) {
              throw new Error('Rejection reason is required')
            }
            return true
          }
        }
      }
    },
    ['params', 'body']
  )
)
