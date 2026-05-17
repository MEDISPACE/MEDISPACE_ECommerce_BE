import { checkSchema } from 'express-validator'
import { ObjectId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { HEALTH_CATEGORIES_MESSAGES } from '~/constants/message'
import { ErrorWithStatus } from '~/models/Error'
import { validate } from '~/utils/validation'

// Common schemas
const categoryIdSchema = {
  custom: {
    options: async (value: string) => {
      // Accept both ObjectId and slug format
      if (!ObjectId.isValid(value) && !/^[a-z0-9-]+$/.test(value)) {
        throw new ErrorWithStatus({
          message: HEALTH_CATEGORIES_MESSAGES.CATEGORY_ID_INVALID,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
      return true
    }
  }
}

const nameSchema = {
  notEmpty: {
    errorMessage: HEALTH_CATEGORIES_MESSAGES.NAME_IS_REQUIRED
  },
  isString: {
    errorMessage: HEALTH_CATEGORIES_MESSAGES.NAME_MUST_BE_STRING
  },
  trim: true,
  isLength: {
    options: { min: 1, max: 100 },
    errorMessage: HEALTH_CATEGORIES_MESSAGES.NAME_LENGTH_INVALID
  }
}

const slugSchema = {
  optional: true,
  isString: {
    errorMessage: HEALTH_CATEGORIES_MESSAGES.SLUG_MUST_BE_STRING
  },
  trim: true,
  matches: {
    options: /^[a-z0-9-]+$/,
    errorMessage: HEALTH_CATEGORIES_MESSAGES.SLUG_FORMAT_INVALID
  },
  isLength: {
    options: { min: 1, max: 100 },
    errorMessage: HEALTH_CATEGORIES_MESSAGES.SLUG_LENGTH_INVALID
  }
}

const descriptionSchema = {
  notEmpty: {
    errorMessage: HEALTH_CATEGORIES_MESSAGES.DESCRIPTION_IS_REQUIRED
  },
  isString: {
    errorMessage: HEALTH_CATEGORIES_MESSAGES.DESCRIPTION_MUST_BE_STRING
  },
  trim: true,
  isLength: {
    options: { min: 1, max: 500 },
    errorMessage: HEALTH_CATEGORIES_MESSAGES.DESCRIPTION_LENGTH_INVALID
  }
}

const orderSchema = {
  optional: true,
  isInt: {
    options: { min: 0 },
    errorMessage: HEALTH_CATEGORIES_MESSAGES.ORDER_INVALID
  }
}

const isActiveSchema = {
  optional: true,
  isBoolean: {
    errorMessage: HEALTH_CATEGORIES_MESSAGES.IS_ACTIVE_INVALID
  }
}

// Query schemas
const pageSchema = {
  optional: true,
  isInt: {
    options: { min: 1 },
    errorMessage: HEALTH_CATEGORIES_MESSAGES.PAGE_INVALID
  }
}

const limitSchema = {
  optional: true,
  isInt: {
    options: { min: 1, max: 100 },
    errorMessage: HEALTH_CATEGORIES_MESSAGES.LIMIT_INVALID
  }
}

const searchSchema = {
  optional: true,
  isString: {
    errorMessage: HEALTH_CATEGORIES_MESSAGES.SEARCH_MUST_BE_STRING
  },
  trim: true,
  isLength: {
    options: { min: 1, max: 100 },
    errorMessage: HEALTH_CATEGORIES_MESSAGES.SEARCH_LENGTH_INVALID
  }
}

const sortBySchema = {
  optional: true,
  isIn: {
    options: [['name', 'order', 'articleCount', 'createdAt']],
    errorMessage: HEALTH_CATEGORIES_MESSAGES.SORT_BY_INVALID
  }
}

const sortOrderSchema = {
  optional: true,
  isIn: {
    options: [['asc', 'desc']],
    errorMessage: HEALTH_CATEGORIES_MESSAGES.SORT_ORDER_INVALID
  }
}

// Validators
export const createHealthCategoryValidator = validate(
  checkSchema(
    {
      name: nameSchema,
      slug: slugSchema,
      description: descriptionSchema,
      order: orderSchema,
      isActive: isActiveSchema
    },
    ['body']
  )
)

export const updateHealthCategoryValidator = validate(
  checkSchema(
    {
      name: {
        ...nameSchema,
        optional: true,
        notEmpty: undefined
      },
      slug: slugSchema,
      description: {
        ...descriptionSchema,
        optional: true,
        notEmpty: undefined
      },
      order: orderSchema,
      isActive: isActiveSchema
    },
    ['body']
  )
)

export const getHealthCategoriesValidator = validate(
  checkSchema(
    {
      page: pageSchema,
      limit: limitSchema,
      search: searchSchema,
      sortBy: sortBySchema,
      sortOrder: sortOrderSchema
    },
    ['query']
  )
)

export const healthCategoryIdValidator = validate(
  checkSchema(
    {
      categoryId: categoryIdSchema
    },
    ['params']
  )
)
