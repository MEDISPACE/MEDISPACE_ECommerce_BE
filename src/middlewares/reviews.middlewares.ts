import { checkSchema } from 'express-validator'
import { ObjectId } from 'mongodb'
import { validate } from '~/utils/validation'
import databaseService from '~/services/database.services'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'
import { REVIEWS_MESSAGES, PRODUCTS_MESSAGES, ORDERS_MESSAGES, CARTS_MESSAGES } from '~/constants/message'

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
          errorMessage: CARTS_MESSAGES.PRODUCT_ID_IS_REQUIRED
        },
        custom: {
          options: async (value) => {
            if (!ObjectId.isValid(value)) {
              throw new Error(PRODUCTS_MESSAGES.PRODUCT_ID_INVALID)
            }

            // Check if product exists
            const product = await databaseService.products.findOne({ _id: new ObjectId(value) })
            if (!product) {
              throw new Error(PRODUCTS_MESSAGES.PRODUCT_NOT_FOUND)
            }

            return true
          }
        }
      },
      orderId: {
        in: ['body'],
        notEmpty: {
          errorMessage: ORDERS_MESSAGES.ORDER_ID_REQUIRED
        },
        custom: {
          options: (value) => {
            if (!ObjectId.isValid(value)) {
              throw new Error(ORDERS_MESSAGES.ORDER_ID_INVALID)
            }
            return true
          }
        }
      },
      rating: {
        in: ['body'],
        notEmpty: {
          errorMessage: REVIEWS_MESSAGES.RATING_REQUIRED
        },
        isInt: {
          options: { min: 1, max: 5 },
          errorMessage: REVIEWS_MESSAGES.RATING_INVALID
        },
        toInt: true
      },
      title: {
        in: ['body'],
        optional: true,
        isString: {
          errorMessage: REVIEWS_MESSAGES.TITLE_MUST_BE_STRING
        },
        isLength: {
          options: { max: 200 },
          errorMessage: REVIEWS_MESSAGES.TITLE_TOO_LONG
        },
        trim: true
      },
      comment: {
        in: ['body'],
        notEmpty: {
          errorMessage: REVIEWS_MESSAGES.COMMENT_REQUIRED
        },
        isString: {
          errorMessage: REVIEWS_MESSAGES.COMMENT_MUST_BE_STRING
        },
        isLength: {
          options: { min: 10, max: 2000 },
          errorMessage: REVIEWS_MESSAGES.COMMENT_LENGTH_INVALID
        },
        trim: true
      },
      images: {
        in: ['body'],
        optional: true,
        isArray: {
          errorMessage: REVIEWS_MESSAGES.IMAGES_MUST_BE_ARRAY
        },
        custom: {
          options: (value) => {
            if (value && value.length > 5) {
              throw new Error(REVIEWS_MESSAGES.TOO_MANY_IMAGES)
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
          errorMessage: REVIEWS_MESSAGES.REVIEW_ID_REQUIRED
        },
        custom: {
          options: async (value) => {
            if (!ObjectId.isValid(value)) {
              throw new Error(REVIEWS_MESSAGES.REVIEW_ID_INVALID)
            }

            // Check if review exists
            const review = await databaseService.reviews.findOne({ _id: new ObjectId(value) })
            if (!review) {
              throw new Error(REVIEWS_MESSAGES.REVIEW_NOT_FOUND)
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
          errorMessage: REVIEWS_MESSAGES.RATING_INVALID
        },
        toInt: true
      },
      title: {
        in: ['body'],
        optional: true,
        isString: {
          errorMessage: REVIEWS_MESSAGES.TITLE_MUST_BE_STRING
        },
        isLength: {
          options: { max: 200 },
          errorMessage: REVIEWS_MESSAGES.TITLE_TOO_LONG
        },
        trim: true
      },
      comment: {
        in: ['body'],
        optional: true,
        isString: {
          errorMessage: REVIEWS_MESSAGES.COMMENT_MUST_BE_STRING
        },
        isLength: {
          options: { min: 10, max: 2000 },
          errorMessage: REVIEWS_MESSAGES.COMMENT_LENGTH_INVALID
        },
        trim: true
      },
      images: {
        in: ['body'],
        optional: true,
        isArray: {
          errorMessage: REVIEWS_MESSAGES.IMAGES_MUST_BE_ARRAY
        },
        custom: {
          options: (value) => {
            if (value && value.length > 5) {
              throw new Error(REVIEWS_MESSAGES.TOO_MANY_IMAGES)
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
          errorMessage: REVIEWS_MESSAGES.REVIEW_ID_REQUIRED
        },
        custom: {
          options: async (value) => {
            if (!ObjectId.isValid(value)) {
              throw new Error(REVIEWS_MESSAGES.REVIEW_ID_INVALID)
            }

            const review = await databaseService.reviews.findOne({ _id: new ObjectId(value) })
            if (!review) {
              throw new Error(REVIEWS_MESSAGES.REVIEW_NOT_FOUND)
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
          errorMessage: CARTS_MESSAGES.PRODUCT_ID_IS_REQUIRED
        },
        custom: {
          options: async (value) => {
            if (!ObjectId.isValid(value)) {
              throw new Error(PRODUCTS_MESSAGES.PRODUCT_ID_INVALID)
            }

            const product = await databaseService.products.findOne({ _id: new ObjectId(value) })
            if (!product) {
              throw new Error(PRODUCTS_MESSAGES.PRODUCT_NOT_FOUND)
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
          errorMessage: PRODUCTS_MESSAGES.PAGE_INVALID
        },
        toInt: true
      },
      limit: {
        in: ['query'],
        optional: true,
        isInt: {
          options: { min: 1, max: 50 },
          errorMessage: PRODUCTS_MESSAGES.LIMIT_INVALID
        },
        toInt: true
      },
      sortBy: {
        in: ['query'],
        optional: true,
        isIn: {
          options: [['newest', 'oldest', 'highest', 'lowest', 'helpful']],
          errorMessage: REVIEWS_MESSAGES.SORT_BY_INVALID
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
          errorMessage: REVIEWS_MESSAGES.REVIEW_ID_REQUIRED
        },
        custom: {
          options: async (value) => {
            if (!ObjectId.isValid(value)) {
              throw new Error(REVIEWS_MESSAGES.REVIEW_ID_INVALID)
            }

            const review = await databaseService.reviews.findOne({ _id: new ObjectId(value) })
            if (!review) {
              throw new Error(REVIEWS_MESSAGES.REVIEW_NOT_FOUND)
            }

            return true
          }
        }
      },
      status: {
        in: ['body'],
        notEmpty: {
          errorMessage: REVIEWS_MESSAGES.STATUS_REQUIRED
        },
        isIn: {
          options: [['approved', 'rejected']],
          errorMessage: REVIEWS_MESSAGES.STATUS_INVALID
        }
      },
      notes: {
        in: ['body'],
        optional: true,
        isString: {
          errorMessage: REVIEWS_MESSAGES.NOTES_MUST_BE_STRING
        },
        trim: true,
        custom: {
          options: (value, { req }) => {
            // Rejection requires notes
            if (req.body.status === 'rejected' && (!value || value.trim().length === 0)) {
              throw new Error(REVIEWS_MESSAGES.REJECTION_REASON_REQUIRED)
            }
            return true
          }
        }
      }
    },
    ['params', 'body']
  )
)
