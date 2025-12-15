import { Router } from 'express'
import { wrapRequestHandler } from '~/utils/handlers'
import { accessTokenValidator } from '~/middlewares/users.middlewares'
import { isAdminOrPharmacist } from '~/middlewares/common.middlewares'
import {
  createReviewValidator,
  updateReviewValidator,
  reviewIdValidator,
  productIdValidator,
  moderateReviewValidator
} from '~/middlewares/reviews.middlewares'
import {
  createReviewController,
  getProductReviewsController,
  getProductReviewStatsController,
  getUserReviewsController,
  updateReviewController,
  deleteReviewController,
  markReviewHelpfulController,
  moderateReviewController,
  getAdminReviewsController,
  getAdminReviewStatsController,
  bulkModerateController
} from '~/controllers/reviews.controllers'

const reviewsRouter = Router()

/**
 * Review Routes for Medical E-commerce
 *
 * Public routes:
 * - GET /reviews/product/:productId - Get product reviews
 * - GET /reviews/product/:productId/stats - Get review statistics
 *
 * Authenticated routes:
 * - POST /reviews - Create review
 * - GET /reviews/user - Get user's reviews
 * - PUT /reviews/:reviewId - Update review
 * - DELETE /reviews/:reviewId - Delete review
 * - POST /reviews/:reviewId/helpful - Mark review as helpful
 *
 * Admin/Pharmacist routes:
 * - PATCH /reviews/:reviewId/moderate - Moderate review
 */

// Public routes - Get product reviews (no authentication required)
reviewsRouter.get('/product/:productId', productIdValidator, wrapRequestHandler(getProductReviewsController))

reviewsRouter.get('/product/:productId/stats', productIdValidator, wrapRequestHandler(getProductReviewStatsController))

// Authenticated routes - User must be logged in
reviewsRouter.post('/', accessTokenValidator, createReviewValidator, wrapRequestHandler(createReviewController))

reviewsRouter.get('/user', accessTokenValidator, wrapRequestHandler(getUserReviewsController))

reviewsRouter.put('/:reviewId', accessTokenValidator, updateReviewValidator, wrapRequestHandler(updateReviewController))

reviewsRouter.delete('/:reviewId', accessTokenValidator, reviewIdValidator, wrapRequestHandler(deleteReviewController))

reviewsRouter.post(
  '/:reviewId/helpful',
  accessTokenValidator,
  reviewIdValidator,
  wrapRequestHandler(markReviewHelpfulController)
)

// Admin/Pharmacist routes - Moderation
reviewsRouter.patch(
  '/:reviewId/moderate',
  accessTokenValidator,
  isAdminOrPharmacist,
  moderateReviewValidator,
  wrapRequestHandler(moderateReviewController)
)

// Admin-only routes - Review management
reviewsRouter.get(
  '/admin',
  accessTokenValidator,
  isAdminOrPharmacist,
  wrapRequestHandler(getAdminReviewsController)
)

reviewsRouter.get(
  '/admin/stats',
  accessTokenValidator,
  isAdminOrPharmacist,
  wrapRequestHandler(getAdminReviewStatsController)
)

reviewsRouter.post(
  '/admin/bulk-moderate',
  accessTokenValidator,
  isAdminOrPharmacist,
  wrapRequestHandler(bulkModerateController)
)

export default reviewsRouter
