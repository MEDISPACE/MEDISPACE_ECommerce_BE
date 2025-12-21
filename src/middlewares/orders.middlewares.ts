import { checkSchema } from 'express-validator'
import { ObjectId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'
import { validate } from '~/utils/validation'
import { ORDERS_MESSAGES } from '~/constants/message'
import { PaymentMethod, ShippingMethod } from '~/constants/enum'

// Order ID validation
const orderIdSchema = {
  custom: {
    options: async (value: string) => {
      if (!ObjectId.isValid(value)) {
        throw new ErrorWithStatus({
          message: ORDERS_MESSAGES.ORDER_ID_INVALID,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
      return true
    }
  }
}

// Shipping address validation
const shippingAddressSchema = {
  isObject: {
    errorMessage: ORDERS_MESSAGES.SHIPPING_ADDRESS_INVALID
  },
  custom: {
    options: (value: any) => {
      if (!value.firstName || typeof value.firstName !== 'string') {
        throw new Error(ORDERS_MESSAGES.FIRST_NAME_REQUIRED)
      }
      if (!value.lastName || typeof value.lastName !== 'string') {
        throw new Error(ORDERS_MESSAGES.LAST_NAME_REQUIRED)
      }
      if (!value.phone || typeof value.phone !== 'string') {
        throw new Error(ORDERS_MESSAGES.PHONE_REQUIRED)
      }
      if (!value.email || typeof value.email !== 'string') {
        throw new Error(ORDERS_MESSAGES.EMAIL_REQUIRED)
      }
      if (!value.address || typeof value.address !== 'string') {
        throw new Error(ORDERS_MESSAGES.ADDRESS_REQUIRED)
      }
      if (!value.ward || typeof value.ward !== 'string') {
        throw new Error(ORDERS_MESSAGES.WARD_REQUIRED)
      }
      if (!value.district || typeof value.district !== 'string') {
        throw new Error(ORDERS_MESSAGES.DISTRICT_REQUIRED)
      }
      if (!value.province || typeof value.province !== 'string') {
        throw new Error(ORDERS_MESSAGES.PROVINCE_REQUIRED)
      }
      return true
    }
  }
}

// Payment method validation
// Payment method validation
const paymentMethodSchema = {
  isIn: {
    options: [[...Object.values(PaymentMethod)]],
    errorMessage: ORDERS_MESSAGES.PAYMENT_METHOD_INVALID
  }
}

// Shipping method validation
const shippingMethodSchema = {
  isIn: {
    options: [[...Object.values(ShippingMethod)]],
    errorMessage: ORDERS_MESSAGES.SHIPPING_METHOD_INVALID
  }
}

// Order status validation
const orderStatusSchema = {
  isIn: {
    options: [['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']],
    errorMessage: ORDERS_MESSAGES.ORDER_STATUS_INVALID
  }
}

// Payment status validation
const paymentStatusSchema = {
  isIn: {
    options: [['pending', 'paid', 'failed', 'refunded']],
    errorMessage: ORDERS_MESSAGES.PAYMENT_STATUS_INVALID
  }
}

// Create order validation
export const createOrderValidator = validate(
  checkSchema(
    {
      items: {
        optional: true,
        isArray: {
          errorMessage: ORDERS_MESSAGES.ITEMS_MUST_BE_ARRAY
        }
      },
      isDirectBuy: {
        optional: true,
        isBoolean: {
          errorMessage: ORDERS_MESSAGES.IS_DIRECT_BUY_MUST_BE_BOOLEAN
        }
      },
      shippingAddress: shippingAddressSchema,
      paymentMethod: {
        ...paymentMethodSchema,
        notEmpty: {
          errorMessage: ORDERS_MESSAGES.PAYMENT_METHOD_REQUIRED
        }
      },
      shippingMethod: {
        optional: true,
        isString: {
          errorMessage: 'Invalid shipping method format' // Relaxed validation
        }
      },
      notes: {
        optional: true,
        isString: {
          errorMessage: ORDERS_MESSAGES.NOTES_MUST_BE_STRING
        },
        isLength: {
          options: { max: 500 },
          errorMessage: ORDERS_MESSAGES.NOTES_TOO_LONG
        }
      }
    },
    ['body']
  )
)

// Update order status validation
export const updateOrderStatusValidator = validate(
  checkSchema(
    {
      status: {
        ...orderStatusSchema,
        notEmpty: {
          errorMessage: ORDERS_MESSAGES.ORDER_STATUS_REQUIRED
        }
      },
      trackingNumber: {
        optional: true,
        isString: {
          errorMessage: ORDERS_MESSAGES.TRACKING_NUMBER_MUST_BE_STRING
        },
        isLength: {
          options: { max: 100 },
          errorMessage: ORDERS_MESSAGES.TRACKING_NUMBER_TOO_LONG
        }
      }
    },
    ['body']
  )
)

// Update payment status validation
export const updatePaymentStatusValidator = validate(
  checkSchema(
    {
      paymentStatus: {
        ...paymentStatusSchema,
        notEmpty: {
          errorMessage: ORDERS_MESSAGES.PAYMENT_STATUS_REQUIRED
        }
      }
    },
    ['body']
  )
)

// Order ID validation for params
export const orderIdValidator = validate(
  checkSchema(
    {
      orderId: {
        ...orderIdSchema,
        notEmpty: {
          errorMessage: ORDERS_MESSAGES.ORDER_ID_REQUIRED
        }
      }
    },
    ['params']
  )
)
