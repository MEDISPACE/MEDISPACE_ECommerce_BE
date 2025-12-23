import { checkSchema } from 'express-validator'
import { ObjectId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { PRODUCTS_MESSAGES } from '~/constants/message'
import { ErrorWithStatus } from '~/models/Error'
import { validate } from '~/utils/validation'

// Common schemas
const productIdSchema = {
  custom: {
    options: async (value: string) => {
      // Accept either an ObjectId or a slug (e.g. product slug like 'paracetamol-500mg')
      const isObjectId = ObjectId.isValid(value)
      const isSlug = typeof value === 'string' && /^[a-z0-9-]+$/.test(value)
      if (!isObjectId && !isSlug) {
        throw new ErrorWithStatus({
          message: PRODUCTS_MESSAGES.PRODUCT_ID_INVALID,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
      return true
    }
  }
}

const nameSchema = {
  notEmpty: {
    errorMessage: PRODUCTS_MESSAGES.NAME_IS_REQUIRED
  },
  isString: {
    errorMessage: PRODUCTS_MESSAGES.NAME_MUST_BE_STRING
  },
  trim: true,
  isLength: {
    options: { min: 1, max: 200 },
    errorMessage: PRODUCTS_MESSAGES.NAME_LENGTH_INVALID
  }
}

const slugSchema = {
  optional: true,
  isString: {
    errorMessage: PRODUCTS_MESSAGES.SLUG_MUST_BE_STRING
  },
  trim: true,
  matches: {
    options: /^[a-z0-9-]+$/,
    errorMessage: PRODUCTS_MESSAGES.SLUG_FORMAT_INVALID
  },
  isLength: {
    options: { min: 1, max: 200 },
    errorMessage: PRODUCTS_MESSAGES.SLUG_LENGTH_INVALID
  }
}

const skuSchema = {
  optional: true,
  isString: {
    errorMessage: PRODUCTS_MESSAGES.SKU_MUST_BE_STRING
  },
  trim: true,
  matches: {
    options: /^[A-Z0-9-]+$/,
    errorMessage: PRODUCTS_MESSAGES.SKU_FORMAT_INVALID
  },
  isLength: {
    options: { min: 3, max: 50 },
    errorMessage: PRODUCTS_MESSAGES.SKU_LENGTH_INVALID
  }
}

const barcodeSchema = {
  optional: { options: { nullable: true } },
  isString: {
    errorMessage: PRODUCTS_MESSAGES.BARCODE_MUST_BE_STRING
  },
  trim: true,
  isLength: {
    options: { min: 8, max: 50 },
    errorMessage: PRODUCTS_MESSAGES.BARCODE_LENGTH_INVALID
  }
}

const shortDescriptionSchema = {
  notEmpty: {
    errorMessage: PRODUCTS_MESSAGES.SHORT_DESCRIPTION_IS_REQUIRED
  },
  isString: {
    errorMessage: PRODUCTS_MESSAGES.SHORT_DESCRIPTION_MUST_BE_STRING
  },
  trim: true,
  isLength: {
    options: { min: 10, max: 500 },
    errorMessage: PRODUCTS_MESSAGES.SHORT_DESCRIPTION_LENGTH_INVALID
  }
}

const categoryIdSchema = {
  notEmpty: {
    errorMessage: PRODUCTS_MESSAGES.CATEGORY_ID_IS_REQUIRED
  },
  custom: {
    options: async (value: string) => {
      if (!ObjectId.isValid(value)) {
        throw new ErrorWithStatus({
          message: PRODUCTS_MESSAGES.CATEGORY_ID_INVALID,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
      return true
    }
  }
}

const brandIdSchema = {
  optional: { options: { nullable: true } },
  custom: {
    options: async (value: string) => {
      if (value && !ObjectId.isValid(value)) {
        throw new ErrorWithStatus({
          message: PRODUCTS_MESSAGES.BRAND_ID_INVALID,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
      return true
    }
  }
}

const stockQuantitySchema = {
  optional: true,
  isInt: {
    options: { min: 0 },
    errorMessage: PRODUCTS_MESSAGES.STOCK_QUANTITY_INVALID
  }
}

const maxOrderQuantitySchema = {
  optional: true,
  isInt: {
    options: { min: 1 },
    errorMessage: PRODUCTS_MESSAGES.MAX_ORDER_QUANTITY_INVALID
  }
}

const statusSchema = {
  optional: true,
  isIn: {
    options: [['active', 'discontinued', 'out_of_stock']],
    errorMessage: PRODUCTS_MESSAGES.STATUS_INVALID
  }
}

const isActiveSchema = {
  optional: true,
  isBoolean: {
    errorMessage: PRODUCTS_MESSAGES.IS_ACTIVE_INVALID
  }
}

const requiresPrescriptionSchema = {
  optional: true,
  isBoolean: {
    errorMessage: PRODUCTS_MESSAGES.REQUIRES_PRESCRIPTION_INVALID
  }
}

const featuredImageSchema = {
  optional: { options: { nullable: true } },
  isString: {
    errorMessage: PRODUCTS_MESSAGES.FEATURED_IMAGE_MUST_BE_STRING
  },
  trim: true,
  isURL: {
    errorMessage: PRODUCTS_MESSAGES.FEATURED_IMAGE_URL_INVALID
  }
}

// Query validation schemas
const pageSchema = {
  optional: true,
  isInt: {
    options: { min: 1 },
    errorMessage: PRODUCTS_MESSAGES.PAGE_INVALID
  }
}

const limitSchema = {
  optional: true,
  isInt: {
    options: { min: 1, max: 20000 }, // Increased for admin to load all products
    errorMessage: PRODUCTS_MESSAGES.LIMIT_INVALID
  }
}

const searchSchema = {
  optional: true,
  isString: {
    errorMessage: PRODUCTS_MESSAGES.SEARCH_MUST_BE_STRING
  },
  trim: true,
  isLength: {
    options: { min: 1, max: 100 },
    errorMessage: PRODUCTS_MESSAGES.SEARCH_LENGTH_INVALID
  }
}

const sortBySchema = {
  optional: true,
  isIn: {
    options: [['name', 'createdAt', 'stockQuantity', 'sku']],
    errorMessage: PRODUCTS_MESSAGES.SORT_BY_INVALID
  }
}

const sortOrderSchema = {
  optional: true,
  isIn: {
    options: [['asc', 'desc']],
    errorMessage: PRODUCTS_MESSAGES.SORT_ORDER_INVALID
  }
}

const stockFilterSchema = {
  optional: true,
  isInt: {
    options: { min: 0 },
    errorMessage: PRODUCTS_MESSAGES.STOCK_QUANTITY_INVALID
  }
}

// Validators
export const createProductValidator = validate(
  checkSchema(
    {
      name: nameSchema,
      slug: slugSchema,
      sku: skuSchema,
      barcode: barcodeSchema,
      shortDescription: shortDescriptionSchema,
      categoryId: categoryIdSchema,
      brandId: brandIdSchema,
      // priceVariants is REQUIRED
      priceVariants: {
        isArray: {
          options: { min: 1 },
          errorMessage: 'priceVariants must be an array with at least 1 variant'
        },
        notEmpty: {
          errorMessage: 'priceVariants is required'
        }
      },
      'priceVariants.*.unit': {
        in: ['body'],
        isString: true,
        notEmpty: {
          errorMessage: 'Unit is required for each price variant'
        }
      },
      'priceVariants.*.price': {
        in: ['body'],
        isFloat: {
          options: { min: 0 },
          errorMessage: 'Price must be a positive number'
        }
      },
      'priceVariants.*.originalPrice': {
        in: ['body'],
        optional: true,
        isFloat: {
          options: { min: 0 },
          errorMessage: 'Original price must be a positive number'
        }
      },
      'priceVariants.*.costPrice': {
        in: ['body'],
        optional: true,
        isFloat: {
          options: { min: 0 },
          errorMessage: 'Cost price must be a positive number'
        }
      },
      'priceVariants.*.isDefault': {
        in: ['body'],
        isBoolean: {
          errorMessage: 'isDefault must be a boolean'
        }
      },
      stockQuantity: stockQuantitySchema,
      maxOrderQuantity: maxOrderQuantitySchema,
      status: statusSchema,
      isActive: isActiveSchema,
      requiresPrescription: requiresPrescriptionSchema,
      featuredImage: featuredImageSchema
    },
    ['body']
  )
)

export const updateProductValidator = validate(
  checkSchema(
    {
      name: {
        ...nameSchema,
        optional: true,
        notEmpty: undefined
      },
      slug: slugSchema,
      sku: skuSchema,
      barcode: barcodeSchema,
      shortDescription: {
        ...shortDescriptionSchema,
        optional: true,
        notEmpty: undefined
      },
      categoryId: {
        ...categoryIdSchema,
        optional: true,
        notEmpty: undefined
      },
      brandId: brandIdSchema,
      priceVariants: {
        optional: true,
        isArray: {
          errorMessage: 'priceVariants must be an array'
        }
      },
      'priceVariants.*.unit': {
        in: ['body'],
        optional: true,
        isString: true,
        notEmpty: {
          errorMessage: 'Unit is required for each price variant'
        }
      },
      'priceVariants.*.price': {
        in: ['body'],
        optional: true,
        isFloat: {
          options: { min: 0 },
          errorMessage: 'Price must be a positive number'
        }
      },
      'priceVariants.*.originalPrice': {
        in: ['body'],
        optional: true,
        isFloat: {
          options: { min: 0 },
          errorMessage: 'Original price must be a positive number'
        }
      },
      'priceVariants.*.costPrice': {
        in: ['body'],
        optional: true,
        isFloat: {
          options: { min: 0 },
          errorMessage: 'Cost price must be a positive number'
        }
      },
      'priceVariants.*.isDefault': {
        in: ['body'],
        optional: true,
        isBoolean: {
          errorMessage: 'isDefault must be a boolean'
        }
      },
      stockQuantity: stockQuantitySchema,
      maxOrderQuantity: maxOrderQuantitySchema,
      status: statusSchema,
      isActive: isActiveSchema,
      requiresPrescription: requiresPrescriptionSchema,
      featuredImage: featuredImageSchema
    },
    ['body']
  )
)

export const getProductsValidator = validate(
  checkSchema(
    {
      page: pageSchema,
      limit: limitSchema,
      categoryId: {
        optional: true,
        custom: {
          options: async (value: string) => {
            // Accept either an ObjectId or a category slug
            if (value) {
              const isObjectId = ObjectId.isValid(value)
              const isSlug = typeof value === 'string' && /^[a-z0-9-]+$/.test(value)
              if (!isObjectId && !isSlug) {
                throw new ErrorWithStatus({
                  message: PRODUCTS_MESSAGES.CATEGORY_ID_INVALID,
                  status: HTTP_STATUS.BAD_REQUEST
                })
              }
            }
            return true
          }
        }
      },
      brandId: {
        optional: true,
        custom: {
          options: async (value: string) => {
            if (value && !ObjectId.isValid(value)) {
              throw new ErrorWithStatus({
                message: PRODUCTS_MESSAGES.BRAND_ID_INVALID,
                status: HTTP_STATUS.BAD_REQUEST
              })
            }
            return true
          }
        }
      },
      status: statusSchema,
      isActive: {
        optional: true,
        isIn: {
          options: [['true', 'false']],
          errorMessage: PRODUCTS_MESSAGES.IS_ACTIVE_INVALID
        }
      },
      requiresPrescription: {
        optional: true,
        isIn: {
          options: [['true', 'false']],
          errorMessage: PRODUCTS_MESSAGES.REQUIRES_PRESCRIPTION_INVALID
        }
      },
      search: searchSchema,
      sortBy: sortBySchema,
      sortOrder: sortOrderSchema,
      minStock: stockFilterSchema,
      maxStock: stockFilterSchema
    },
    ['query']
  )
)

export const productIdValidator = validate(
  checkSchema(
    {
      productId: productIdSchema
    },
    ['params']
  )
)

export const toggleProductStatusValidator = validate(
  checkSchema(
    {
      isActive: {
        notEmpty: {
          errorMessage: PRODUCTS_MESSAGES.IS_ACTIVE_REQUIRED
        },
        isBoolean: {
          errorMessage: PRODUCTS_MESSAGES.IS_ACTIVE_INVALID
        }
      }
    },
    ['body']
  )
)

export const updateStockValidator = validate(
  checkSchema(
    {
      stockQuantity: {
        notEmpty: {
          errorMessage: PRODUCTS_MESSAGES.STOCK_QUANTITY_REQUIRED
        },
        isInt: {
          options: { min: 0 },
          errorMessage: PRODUCTS_MESSAGES.STOCK_QUANTITY_INVALID
        }
      }
    },
    ['body']
  )
)
