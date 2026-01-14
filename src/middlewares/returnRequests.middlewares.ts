import { checkSchema } from 'express-validator'
import { ObjectId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { RETURN_REQUESTS_MESSAGES } from '~/constants/message'
import { ReturnReason, ReturnStatus, ReturnType, RefundMethod } from '~/models/schemas/ReturnRequest.schema'
import { ErrorWithStatus } from '~/models/Error'
import { validate } from '~/utils/validation'

// Valid values for enums
const VALID_RETURN_REASONS = Object.values(ReturnReason)
const VALID_RETURN_STATUSES = Object.values(ReturnStatus)
const VALID_RETURN_TYPES = Object.values(ReturnType)
const VALID_REFUND_METHODS = Object.values(RefundMethod)
const VALID_CONDITIONS = ['good', 'damaged', 'opened', 'unusable']

// Common schemas
const requestIdSchema = {
    custom: {
        options: (value: string) => {
            if (!ObjectId.isValid(value)) {
                throw new ErrorWithStatus({
                    message: RETURN_REQUESTS_MESSAGES.REQUEST_ID_INVALID,
                    status: HTTP_STATUS.BAD_REQUEST
                })
            }
            return true
        }
    }
}

const pageSchema = {
    optional: true,
    isInt: {
        options: { min: 1 },
        errorMessage: RETURN_REQUESTS_MESSAGES.PAGE_INVALID
    }
}

const limitSchema = {
    optional: true,
    isInt: {
        options: { min: 1, max: 100 },
        errorMessage: RETURN_REQUESTS_MESSAGES.LIMIT_INVALID
    }
}

// Validators

/**
 * Validate create return request payload
 */
export const createReturnRequestValidator = validate(
    checkSchema(
        {
            orderId: {
                notEmpty: {
                    errorMessage: RETURN_REQUESTS_MESSAGES.ORDER_ID_REQUIRED
                },
                custom: {
                    options: (value) => {
                        if (!ObjectId.isValid(value)) {
                            throw new ErrorWithStatus({
                                message: RETURN_REQUESTS_MESSAGES.ORDER_ID_INVALID,
                                status: HTTP_STATUS.BAD_REQUEST
                            })
                        }
                        return true
                    }
                }
            },
            items: {
                isArray: {
                    options: { min: 1 },
                    errorMessage: RETURN_REQUESTS_MESSAGES.ITEMS_REQUIRED
                }
            },
            'items.*.productId': {
                notEmpty: true,
                custom: {
                    options: (value) => {
                        if (!ObjectId.isValid(value)) {
                            throw new Error('Invalid product ID')
                        }
                        return true
                    }
                }
            },
            'items.*.quantity': {
                isInt: {
                    options: { min: 1 },
                    errorMessage: 'Quantity must be at least 1'
                }
            },
            'items.*.returnReason': {
                isIn: {
                    options: [VALID_RETURN_REASONS],
                    errorMessage: RETURN_REQUESTS_MESSAGES.REASON_INVALID
                }
            },
            reason: {
                notEmpty: {
                    errorMessage: RETURN_REQUESTS_MESSAGES.REASON_REQUIRED
                },
                isIn: {
                    options: [VALID_RETURN_REASONS],
                    errorMessage: RETURN_REQUESTS_MESSAGES.REASON_INVALID
                }
            },
            reasonDetail: {
                notEmpty: {
                    errorMessage: RETURN_REQUESTS_MESSAGES.REASON_DETAIL_REQUIRED
                },
                isString: {
                    errorMessage: RETURN_REQUESTS_MESSAGES.REASON_DETAIL_MUST_BE_STRING
                },
                isLength: {
                    options: { min: 10, max: 1000 },
                    errorMessage: RETURN_REQUESTS_MESSAGES.REASON_DETAIL_LENGTH_INVALID
                }
            },
            evidence: {
                isArray: {
                    options: { min: 1 },
                    errorMessage: RETURN_REQUESTS_MESSAGES.EVIDENCE_REQUIRED
                }
            },
            type: {
                optional: true,
                isIn: {
                    options: [VALID_RETURN_TYPES],
                    errorMessage: RETURN_REQUESTS_MESSAGES.TYPE_INVALID
                }
            },
            refundMethod: {
                optional: true,
                isIn: {
                    options: [VALID_REFUND_METHODS],
                    errorMessage: RETURN_REQUESTS_MESSAGES.REFUND_METHOD_INVALID
                }
            },
            'bankInfo.bankName': {
                optional: true,
                isString: true
            },
            'bankInfo.accountNumber': {
                optional: true,
                isString: true
            },
            'bankInfo.accountHolder': {
                optional: true,
                isString: true
            }
        },
        ['body']
    )
)

/**
 * Validate request ID parameter
 */
export const requestIdValidator = validate(
    checkSchema(
        {
            requestId: requestIdSchema
        },
        ['params']
    )
)

/**
 * Validate get return requests query
 */
export const getReturnRequestsValidator = validate(
    checkSchema(
        {
            page: pageSchema,
            limit: limitSchema,
            status: {
                optional: true,
                isIn: {
                    options: [VALID_RETURN_STATUSES],
                    errorMessage: RETURN_REQUESTS_MESSAGES.STATUS_INVALID
                }
            }
        },
        ['query']
    )
)

/**
 * Validate review return request payload
 */
export const reviewReturnRequestValidator = validate(
    checkSchema(
        {
            status: {
                notEmpty: true,
                isIn: {
                    options: [['approved', 'rejected']],
                    errorMessage: 'Status must be approved or rejected'
                }
            },
            approvedAmount: {
                optional: true,
                isFloat: {
                    options: { min: 0 },
                    errorMessage: RETURN_REQUESTS_MESSAGES.AMOUNT_INVALID
                }
            },
            reviewNotes: {
                optional: true,
                isString: {
                    errorMessage: RETURN_REQUESTS_MESSAGES.NOTES_MUST_BE_STRING
                },
                isLength: {
                    options: { max: 1000 },
                    errorMessage: RETURN_REQUESTS_MESSAGES.NOTES_LENGTH_INVALID
                }
            },
            rejectionReason: {
                optional: true,
                isString: true
            }
        },
        ['body']
    )
)

/**
 * Validate update return shipping payload
 */
export const updateReturnShippingValidator = validate(
    checkSchema(
        {
            trackingNumber: {
                notEmpty: true,
                isString: {
                    errorMessage: RETURN_REQUESTS_MESSAGES.TRACKING_NUMBER_MUST_BE_STRING
                }
            },
            carrier: {
                optional: true,
                isString: true
            }
        },
        ['body']
    )
)

/**
 * Validate receive return items payload
 */
export const receiveReturnItemsValidator = validate(
    checkSchema(
        {
            condition: {
                notEmpty: true,
                isIn: {
                    options: [VALID_CONDITIONS],
                    errorMessage: RETURN_REQUESTS_MESSAGES.CONDITION_INVALID
                }
            },
            conditionNotes: {
                optional: true,
                isString: true
            }
        },
        ['body']
    )
)

/**
 * Validate process refund payload
 */
export const processRefundValidator = validate(
    checkSchema(
        {
            refundedAmount: {
                notEmpty: true,
                isFloat: {
                    options: { min: 0 },
                    errorMessage: RETURN_REQUESTS_MESSAGES.AMOUNT_INVALID
                }
            },
            refundTransactionId: {
                optional: true,
                isString: true
            },
            refundNotes: {
                optional: true,
                isString: {
                    errorMessage: RETURN_REQUESTS_MESSAGES.NOTES_MUST_BE_STRING
                },
                isLength: {
                    options: { max: 1000 },
                    errorMessage: RETURN_REQUESTS_MESSAGES.NOTES_LENGTH_INVALID
                }
            }
        },
        ['body']
    )
)
