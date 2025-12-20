import { NextFunction, Request, Response } from 'express'
import { checkSchema, ParamSchema } from 'express-validator'
import { ObjectId } from 'mongodb'
import { CATEGORIES_MESSAGES } from '~/constants/message'
import { validate } from '~/utils/validation'

const nameSchema: ParamSchema = {
  in: ['body'],
  isString: {
    errorMessage: CATEGORIES_MESSAGES.NAME_MUST_BE_STRING
  },
  notEmpty: {
    errorMessage: CATEGORIES_MESSAGES.NAME_IS_REQUIRED
  },
  trim: true,
  isLength: {
    options: { min: 1, max: 100 },
    errorMessage: CATEGORIES_MESSAGES.NAME_LENGTH_INVALID
  }
}

const slugSchema: ParamSchema = {
  in: ['body'],
  optional: true,
  isString: {
    errorMessage: CATEGORIES_MESSAGES.SLUG_MUST_BE_STRING
  },
  trim: true,
  isLength: {
    options: { min: 1, max: 100 },
    errorMessage: CATEGORIES_MESSAGES.SLUG_LENGTH_INVALID
  },
  matches: {
    options: /^[a-z0-9-]+$/,
    errorMessage: CATEGORIES_MESSAGES.SLUG_FORMAT_INVALID
  }
}

const descriptionSchema: ParamSchema = {
  in: ['body'],
  optional: true,
  isString: {
    errorMessage: CATEGORIES_MESSAGES.DESCRIPTION_MUST_BE_STRING
  },
  trim: true,
  isLength: {
    options: { max: 500 },
    errorMessage: CATEGORIES_MESSAGES.DESCRIPTION_LENGTH_INVALID
  }
}

const parentIdSchema: ParamSchema = {
  in: ['body'],
  optional: true,
  custom: {
    options: (value) => {
      if (value && !ObjectId.isValid(value)) {
        throw new Error(CATEGORIES_MESSAGES.INVALID_PARENT_CATEGORY)
      }
      return true
    }
  }
}

const iconSchema: ParamSchema = {
  in: ['body'],
  optional: true,
  isString: {
    errorMessage: CATEGORIES_MESSAGES.ICON_MUST_BE_STRING
  },
  trim: true,
  isURL: {
    errorMessage: CATEGORIES_MESSAGES.ICON_URL_INVALID
  }
}

const thumbnailImageSchema: ParamSchema = {
  in: ['body'],
  optional: true,
  isString: {
    errorMessage: CATEGORIES_MESSAGES.THUMBNAIL_IMAGE_MUST_BE_STRING
  },
  trim: true,
  isURL: {
    errorMessage: CATEGORIES_MESSAGES.THUMBNAIL_URL_INVALID
  }
}

const sortOrderSchema: ParamSchema = {
  in: ['body'],
  optional: true,
  isInt: {
    options: { min: 0 },
    errorMessage: CATEGORIES_MESSAGES.SORT_ORDER_INVALID
  }
}

const isActiveSchema: ParamSchema = {
  in: ['body'],
  optional: true,
  isBoolean: {
    errorMessage: CATEGORIES_MESSAGES.IS_ACTIVE_INVALID
  }
}

const categoryIdParamSchema: ParamSchema = {
  in: ['params'],
  custom: {
    options: (value) => {
      // Accept either a Mongo ObjectId or a human-friendly slug (lowercase letters, numbers and hyphens)
      const isObjectId = ObjectId.isValid(value)
      const isSlug = typeof value === 'string' && /^[a-z0-9-]+$/.test(value)
      if (!isObjectId && !isSlug) {
        throw new Error(CATEGORIES_MESSAGES.CATEGORY_ID_INVALID)
      }
      return true
    }
  }
}

export const createCategoryValidator = validate(
  checkSchema({
    name: nameSchema,
    slug: slugSchema,
    description: descriptionSchema,
    parentId: parentIdSchema,
    icon: iconSchema,
    thumbnailImage: thumbnailImageSchema,
    sortOrder: sortOrderSchema,
    isActive: isActiveSchema
  })
)

export const updateCategoryValidator = validate(
  checkSchema({
    categoryId: categoryIdParamSchema,
    name: {
      ...nameSchema,
      optional: true,
      notEmpty: {
        errorMessage: CATEGORIES_MESSAGES.NAME_IS_REQUIRED
      }
    },
    slug: slugSchema,
    description: descriptionSchema,
    parentId: {
      ...parentIdSchema,
      custom: {
        options: (value) => {
          if (value && value !== null && !ObjectId.isValid(value)) {
            throw new Error(CATEGORIES_MESSAGES.INVALID_PARENT_CATEGORY)
          }
          return true
        }
      }
    },
    icon: iconSchema,
    thumbnailImage: thumbnailImageSchema,
    sortOrder: sortOrderSchema,
    isActive: isActiveSchema
  })
)

export const getCategoriesValidator = validate(
  checkSchema({
    page: {
      in: ['query'],
      optional: true,
      isInt: {
        options: { min: 1 },
        errorMessage: CATEGORIES_MESSAGES.PAGE_INVALID
      }
    },
    limit: {
      in: ['query'],
      optional: true,
      isInt: {
        options: { min: 1, max: 500 },
        errorMessage: CATEGORIES_MESSAGES.LIMIT_INVALID
      }
    },
    parentId: {
      in: ['query'],
      optional: true,
      custom: {
        options: (value) => {
          if (value && value !== 'null' && !ObjectId.isValid(value)) {
            throw new Error(CATEGORIES_MESSAGES.INVALID_PARENT_CATEGORY)
          }
          return true
        }
      }
    },
    level: {
      in: ['query'],
      optional: true,
      isInt: {
        options: { min: 0, max: 10 },
        errorMessage: CATEGORIES_MESSAGES.LEVEL_INVALID
      }
    },
    isActive: {
      in: ['query'],
      optional: true,
      isIn: {
        options: [['true', 'false']],
        errorMessage: CATEGORIES_MESSAGES.IS_ACTIVE_INVALID
      }
    },
    search: {
      in: ['query'],
      optional: true,
      isString: {
        errorMessage: CATEGORIES_MESSAGES.SEARCH_LENGTH_INVALID
      },
      trim: true,
      isLength: {
        options: { min: 1, max: 100 },
        errorMessage: CATEGORIES_MESSAGES.SEARCH_LENGTH_INVALID
      }
    }
  })
)

export const categoryIdValidator = validate(
  checkSchema({
    categoryId: categoryIdParamSchema
  })
)

export const toggleCategoryStatusValidator = validate(
  checkSchema({
    categoryId: categoryIdParamSchema,
    isActive: {
      in: ['body'],
      notEmpty: {
        errorMessage: CATEGORIES_MESSAGES.IS_ACTIVE_REQUIRED
      },
      isBoolean: {
        errorMessage: CATEGORIES_MESSAGES.IS_ACTIVE_INVALID
      }
    }
  })
)

export const adminRequired = (req: Request, res: Response, next: NextFunction) => {
  // TODO: Implement admin check when User system is ready
  next()
}

export const pharmacistOrAdminRequired = (req: Request, res: Response, next: NextFunction) => {
  // TODO: Implement pharmacist or admin check when User system is ready
  next()
}
