import { checkSchema } from 'express-validator'
import { ObjectId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { BRANDS_MESSAGES } from '~/constants/message'
import { ErrorWithStatus } from '~/models/Error'
import { validate } from '~/utils/validation'

// Common schemas
const brandIdSchema = {
  custom: {
    options: async (value: string) => {
      if (!ObjectId.isValid(value)) {
        throw new ErrorWithStatus({
          message: BRANDS_MESSAGES.BRAND_ID_INVALID,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
      return true
    }
  }
}

const nameSchema = {
  notEmpty: {
    errorMessage: BRANDS_MESSAGES.NAME_IS_REQUIRED
  },
  isString: {
    errorMessage: BRANDS_MESSAGES.NAME_MUST_BE_STRING
  },
  trim: true,
  isLength: {
    options: { min: 1, max: 100 },
    errorMessage: BRANDS_MESSAGES.NAME_LENGTH_INVALID
  }
}

const slugSchema = {
  optional: true,
  isString: {
    errorMessage: BRANDS_MESSAGES.SLUG_MUST_BE_STRING
  },
  trim: true,
  matches: {
    options: /^[a-z0-9-]+$/,
    errorMessage: BRANDS_MESSAGES.SLUG_FORMAT_INVALID
  },
  isLength: {
    options: { min: 1, max: 100 },
    errorMessage: BRANDS_MESSAGES.SLUG_LENGTH_INVALID
  }
}

const logoSchema = {
  optional: { options: { nullable: true } },
  isString: {
    errorMessage: BRANDS_MESSAGES.LOGO_MUST_BE_STRING
  },
  trim: true,
  isURL: {
    errorMessage: BRANDS_MESSAGES.LOGO_URL_INVALID
  }
}

const descriptionSchema = {
  optional: { options: { nullable: true } },
  isString: {
    errorMessage: BRANDS_MESSAGES.DESCRIPTION_MUST_BE_STRING
  },
  trim: true,
  isLength: {
    options: { max: 500 },
    errorMessage: BRANDS_MESSAGES.DESCRIPTION_LENGTH_INVALID
  }
}

const websiteSchema = {
  optional: { options: { nullable: true } },
  isString: {
    errorMessage: BRANDS_MESSAGES.WEBSITE_MUST_BE_STRING
  },
  trim: true,
  isURL: {
    errorMessage: BRANDS_MESSAGES.WEBSITE_URL_INVALID
  }
}

const countrySchema = {
  optional: { options: { nullable: true } },
  isString: {
    errorMessage: BRANDS_MESSAGES.COUNTRY_MUST_BE_STRING
  },
  trim: true,
  isLength: {
    options: { max: 100 },
    errorMessage: BRANDS_MESSAGES.COUNTRY_LENGTH_INVALID
  }
}

const isActiveSchema = {
  optional: true,
  isBoolean: {
    errorMessage: BRANDS_MESSAGES.IS_ACTIVE_INVALID
  }
}

const pageSchema = {
  optional: true,
  isInt: {
    options: { min: 1 },
    errorMessage: BRANDS_MESSAGES.PAGE_INVALID
  }
}

const limitSchema = {
  optional: true,
  isInt: {
    options: { min: 1, max: 100 },
    errorMessage: BRANDS_MESSAGES.LIMIT_INVALID
  }
}

const searchSchema = {
  optional: true,
  isString: {
    errorMessage: BRANDS_MESSAGES.SEARCH_MUST_BE_STRING
  },
  trim: true,
  isLength: {
    options: { min: 1, max: 100 },
    errorMessage: BRANDS_MESSAGES.SEARCH_LENGTH_INVALID
  }
}

const sortBySchema = {
  optional: true,
  isIn: {
    options: [['name', 'createdAt', 'productCount']],
    errorMessage: BRANDS_MESSAGES.SORT_BY_INVALID
  }
}

const sortOrderSchema = {
  optional: true,
  isIn: {
    options: [['asc', 'desc']],
    errorMessage: BRANDS_MESSAGES.SORT_ORDER_INVALID
  }
}

// Validators
export const createBrandValidator = validate(
  checkSchema(
    {
      name: nameSchema,
      slug: slugSchema,
      logo: logoSchema,
      description: descriptionSchema,
      website: websiteSchema,
      country: countrySchema,
      isActive: isActiveSchema
    },
    ['body']
  )
)

export const updateBrandValidator = validate(
  checkSchema(
    {
      name: {
        ...nameSchema,
        optional: true,
        notEmpty: undefined
      },
      slug: slugSchema,
      logo: logoSchema,
      description: descriptionSchema,
      website: websiteSchema,
      country: countrySchema,
      isActive: isActiveSchema
    },
    ['body']
  )
)

export const getBrandsValidator = validate(
  checkSchema(
    {
      page: pageSchema,
      limit: limitSchema,
      isActive: {
        optional: true,
        isIn: {
          options: [['true', 'false']],
          errorMessage: BRANDS_MESSAGES.IS_ACTIVE_INVALID
        }
      },
      search: searchSchema,
      country: countrySchema,
      sortBy: sortBySchema,
      sortOrder: sortOrderSchema
    },
    ['query']
  )
)

export const brandIdValidator = validate(
  checkSchema(
    {
      brandId: brandIdSchema
    },
    ['params']
  )
)

export const toggleBrandStatusValidator = validate(
  checkSchema(
    {
      isActive: {
        notEmpty: {
          errorMessage: BRANDS_MESSAGES.IS_ACTIVE_REQUIRED
        },
        isBoolean: {
          errorMessage: BRANDS_MESSAGES.IS_ACTIVE_INVALID
        }
      }
    },
    ['body']
  )
)
