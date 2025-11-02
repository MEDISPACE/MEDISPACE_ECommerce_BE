import { checkSchema } from 'express-validator'
import { ObjectId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'
import { validate } from '~/utils/validation'
import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '~/utils/jwt'
import { CARTS_MESSAGES } from '~/constants/message'

// Optional authentication middleware for guest cart support
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  console.log('🔍 optionalAuth middleware - Request:', req.method, req.url)
  const authHeader = req.headers.authorization
  console.log('🔍 optionalAuth middleware - Auth header:', authHeader)

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const access_token = authHeader.split(' ')[1]

    if (access_token) {
      try {
        const decoded_authorization = await verifyToken({
          token: access_token,
          secretOrPublicKey: process.env.JWT_SECRET_ACCESS_TOKEN as string
        })
        ;(req as Request).decoded_authorization = decoded_authorization
        console.log('🔍 optionalAuth middleware - Token verified:', decoded_authorization)
      } catch (error) {
        // Invalid token, treat as guest user
        console.log('🔍 optionalAuth middleware - Token verification failed, treating as guest')
        ;(req as Request).decoded_authorization = undefined
      }
    }
  } else {
    // No token provided, treat as guest user
    console.log('🔍 optionalAuth middleware - No auth header, treating as guest')
    ;(req as Request).decoded_authorization = undefined
  }

  next()
}

// Product ID validation for cart operations
const productIdSchema = {
  custom: {
    options: async (value: string) => {
      if (!ObjectId.isValid(value)) {
        throw new ErrorWithStatus({
          message: CARTS_MESSAGES.PRODUCT_ID_INVALID,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
      return true
    }
  }
}

// Quantity validation
const quantitySchema = {
  isInt: {
    options: { min: 1, max: 10 },
    errorMessage: CARTS_MESSAGES.QUANTITY_MUST_BE_BETWEEN_1_AND_10
  },
  toInt: true
}

// Add to cart validation
export const addToCartValidator = validate(
  checkSchema(
    {
      productId: {
        ...productIdSchema,
        notEmpty: {
          errorMessage: CARTS_MESSAGES.PRODUCT_ID_IS_REQUIRED
        }
      },
      quantity: {
        ...quantitySchema,
        notEmpty: {
          errorMessage: CARTS_MESSAGES.QUANTITY_IS_REQUIRED
        }
      }
    },
    ['body']
  )
)

// Update cart item validation
export const updateCartItemValidator = validate(
  checkSchema(
    {
      quantity: {
        ...quantitySchema,
        notEmpty: {
          errorMessage: CARTS_MESSAGES.QUANTITY_IS_REQUIRED
        }
      }
    },
    ['body']
  )
)

// Cart item validation (for URL params)
export const cartItemValidator = validate(
  checkSchema(
    {
      productId: productIdSchema
    },
    ['params']
  )
)
