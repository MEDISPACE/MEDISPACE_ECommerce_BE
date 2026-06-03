import { checkSchema } from 'express-validator'
import { ObjectId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { ARTICLES_MESSAGES } from '~/constants/message'
import { ErrorWithStatus } from '~/models/Error'
import { validate } from '~/utils/validation'

// Common schemas
const articleIdSchema = {
  custom: {
    options: async (value: string) => {
      const isObjectId = ObjectId.isValid(value)
      const isSlug = typeof value === 'string' && /^[a-z0-9-]+$/.test(value)
      if (!isObjectId && !isSlug) {
        throw new ErrorWithStatus({
          message: ARTICLES_MESSAGES.ARTICLE_ID_INVALID,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
      return true
    }
  }
}

const titleSchema = {
  notEmpty: {
    errorMessage: ARTICLES_MESSAGES.TITLE_IS_REQUIRED
  },
  isString: {
    errorMessage: ARTICLES_MESSAGES.TITLE_MUST_BE_STRING
  },
  trim: true,
  isLength: {
    options: { min: 1, max: 200 },
    errorMessage: ARTICLES_MESSAGES.TITLE_LENGTH_INVALID
  }
}

const slugSchema = {
  optional: true,
  isString: {
    errorMessage: ARTICLES_MESSAGES.SLUG_MUST_BE_STRING
  },
  trim: true,
  matches: {
    options: /^[a-z0-9-]+$/,
    errorMessage: ARTICLES_MESSAGES.SLUG_FORMAT_INVALID
  },
  isLength: {
    options: { min: 1, max: 200 },
    errorMessage: ARTICLES_MESSAGES.SLUG_LENGTH_INVALID
  }
}

const excerptSchema = {
  notEmpty: {
    errorMessage: ARTICLES_MESSAGES.EXCERPT_IS_REQUIRED
  },
  isString: {
    errorMessage: ARTICLES_MESSAGES.EXCERPT_MUST_BE_STRING
  },
  trim: true,
  isLength: {
    options: { min: 10, max: 500 },
    errorMessage: ARTICLES_MESSAGES.EXCERPT_LENGTH_INVALID
  }
}

const contentSchema = {
  notEmpty: {
    errorMessage: ARTICLES_MESSAGES.CONTENT_IS_REQUIRED
  },
  isString: {
    errorMessage: ARTICLES_MESSAGES.CONTENT_MUST_BE_STRING
  },
  trim: true,
  isLength: {
    options: { min: 50 },
    errorMessage: ARTICLES_MESSAGES.CONTENT_LENGTH_INVALID
  }
}

const categoryIdSchema = {
  notEmpty: {
    errorMessage: ARTICLES_MESSAGES.CATEGORY_ID_IS_REQUIRED
  },
  custom: {
    options: async (value: string) => {
      if (!ObjectId.isValid(value)) {
        throw new ErrorWithStatus({
          message: ARTICLES_MESSAGES.CATEGORY_ID_INVALID,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
      return true
    }
  }
}

const featuredImageSchema = {
  optional: { options: { nullable: true } },
  isString: {
    errorMessage: ARTICLES_MESSAGES.FEATURED_IMAGE_MUST_BE_STRING
  },
  trim: true,
  isLength: {
    options: { max: 1000 },
    errorMessage: ARTICLES_MESSAGES.FEATURED_IMAGE_MUST_BE_STRING
  }
}

const statusSchema = {
  optional: true,
  isIn: {
    options: [['draft', 'pending', 'published', 'archived']],
    errorMessage: ARTICLES_MESSAGES.STATUS_INVALID
  }
}

const isFeaturedSchema = {
  optional: true,
  isBoolean: {
    errorMessage: ARTICLES_MESSAGES.IS_FEATURED_INVALID
  }
}

const isPinnedSchema = {
  optional: true,
  isBoolean: {
    errorMessage: ARTICLES_MESSAGES.IS_PINNED_INVALID
  }
}

const optionalShortTextSchema = {
  optional: { options: { nullable: true } },
  isString: {
    errorMessage: 'Value must be a string'
  },
  trim: true,
  isLength: {
    options: { max: 200 },
    errorMessage: 'Value must be at most 200 characters'
  }
}

const optionalIsoDateSchema = {
  optional: { options: { nullable: true } },
  isISO8601: {
    errorMessage: 'Date must be a valid ISO date'
  }
}

const referencesSchema = {
  optional: true,
  isArray: {
    options: { max: 20 },
    errorMessage: 'References must be an array with at most 20 items'
  }
}

const optionalStringArraySchema = {
  optional: true,
  isArray: {
    options: { max: 30 },
    errorMessage: 'Value must be an array with at most 30 items'
  }
}

const contentVersionSchema = {
  optional: true,
  isInt: {
    options: { min: 1, max: 999 },
    errorMessage: 'Content version must be a positive integer'
  },
  toInt: true
}

const riskLevelSchema = {
  optional: true,
  isIn: {
    options: [['general', 'medication', 'disease', 'emergency-sensitive']],
    errorMessage: 'Risk level is invalid'
  }
}

// Query schemas
const pageSchema = {
  optional: true,
  isInt: {
    options: { min: 1 },
    errorMessage: ARTICLES_MESSAGES.PAGE_INVALID
  }
}

const limitSchema = {
  optional: true,
  isInt: {
    options: { min: 1, max: 100 },
    errorMessage: ARTICLES_MESSAGES.LIMIT_INVALID
  }
}

const searchSchema = {
  optional: true,
  isString: {
    errorMessage: ARTICLES_MESSAGES.SEARCH_MUST_BE_STRING
  },
  trim: true,
  isLength: {
    options: { min: 1, max: 100 },
    errorMessage: ARTICLES_MESSAGES.SEARCH_LENGTH_INVALID
  }
}

const sortBySchema = {
  optional: true,
  isIn: {
    options: [['createdAt', 'publishedAt', 'viewCount', 'title']],
    errorMessage: ARTICLES_MESSAGES.SORT_BY_INVALID
  }
}

const sortOrderSchema = {
  optional: true,
  isIn: {
    options: [['asc', 'desc']],
    errorMessage: ARTICLES_MESSAGES.SORT_ORDER_INVALID
  }
}

// Validators
export const createArticleValidator = validate(
  checkSchema(
    {
      title: titleSchema,
      slug: slugSchema,
      excerpt: excerptSchema,
      content: contentSchema,
      categoryId: categoryIdSchema,
      featuredImage: featuredImageSchema,
      status: statusSchema,
      isFeatured: isFeaturedSchema,
      isPinned: isPinnedSchema,
      references: referencesSchema,
      'references.*.title': optionalShortTextSchema,
      'references.*.url': {
        ...optionalShortTextSchema,
        isLength: {
          options: { max: 1000 },
          errorMessage: 'Reference URL must be at most 1000 characters'
        }
      },
      reviewedBy: optionalShortTextSchema,
      reviewedByTitle: optionalShortTextSchema,
      reviewedAt: optionalIsoDateSchema,
      lastMedicallyReviewedAt: optionalIsoDateSchema,
      contentVersion: contentVersionSchema,
      riskLevel: riskLevelSchema,
      targetAudiences: optionalStringArraySchema,
      'targetAudiences.*': optionalShortTextSchema,
      symptoms: optionalStringArraySchema,
      'symptoms.*': optionalShortTextSchema,
      activeIngredients: optionalStringArraySchema,
      'activeIngredients.*': optionalShortTextSchema,
      healthTopics: optionalStringArraySchema,
      'healthTopics.*': optionalShortTextSchema
    },
    ['body']
  )
)

export const updateArticleValidator = validate(
  checkSchema(
    {
      title: {
        ...titleSchema,
        optional: true,
        notEmpty: undefined
      },
      slug: slugSchema,
      excerpt: {
        ...excerptSchema,
        optional: true,
        notEmpty: undefined
      },
      content: {
        ...contentSchema,
        optional: true,
        notEmpty: undefined
      },
      categoryId: {
        ...categoryIdSchema,
        optional: true,
        notEmpty: undefined
      },
      featuredImage: featuredImageSchema,
      status: statusSchema,
      isFeatured: isFeaturedSchema,
      isPinned: isPinnedSchema,
      references: referencesSchema,
      'references.*.title': optionalShortTextSchema,
      'references.*.url': {
        ...optionalShortTextSchema,
        isLength: {
          options: { max: 1000 },
          errorMessage: 'Reference URL must be at most 1000 characters'
        }
      },
      reviewedBy: optionalShortTextSchema,
      reviewedByTitle: optionalShortTextSchema,
      reviewedAt: optionalIsoDateSchema,
      lastMedicallyReviewedAt: optionalIsoDateSchema,
      contentVersion: contentVersionSchema,
      riskLevel: riskLevelSchema,
      targetAudiences: optionalStringArraySchema,
      'targetAudiences.*': optionalShortTextSchema,
      symptoms: optionalStringArraySchema,
      'symptoms.*': optionalShortTextSchema,
      activeIngredients: optionalStringArraySchema,
      'activeIngredients.*': optionalShortTextSchema,
      healthTopics: optionalStringArraySchema,
      'healthTopics.*': optionalShortTextSchema
    },
    ['body']
  )
)

export const getArticlesValidator = validate(
  checkSchema(
    {
      page: pageSchema,
      limit: limitSchema,
      categoryId: {
        optional: true,
        custom: {
          options: async (value: string) => {
            if (value) {
              const isObjectId = ObjectId.isValid(value)
              const isSlug = typeof value === 'string' && /^[a-z0-9-]+$/.test(value)
              if (!isObjectId && !isSlug) {
                throw new ErrorWithStatus({
                  message: ARTICLES_MESSAGES.CATEGORY_ID_INVALID,
                  status: HTTP_STATUS.BAD_REQUEST
                })
              }
            }
            return true
          }
        }
      },
      status: statusSchema,
      search: searchSchema,
      sortBy: sortBySchema,
      sortOrder: sortOrderSchema
    },
    ['query']
  )
)

export const articleIdValidator = validate(
  checkSchema(
    {
      articleId: articleIdSchema
    },
    ['params']
  )
)
