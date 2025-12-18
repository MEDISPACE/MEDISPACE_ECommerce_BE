import { Request, Response, NextFunction } from 'express'
import { ObjectId } from 'mongodb'
import reviewService from '~/services/reviews.services'
import { TokenPayload } from '~/models/requests/User.request'
import { REVIEWS_MESSAGES } from '~/constants/message'

/**
 * Review Controllers for Medical E-commerce
 */

/**
 * Create a new review
 * POST /reviews
 */
export const createReviewController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = req.decoded_authorization as TokenPayload
        const { productId, orderId, rating, title, comment, images } = req.body

        const result = await reviewService.createReview(
            new ObjectId(userId),
            new ObjectId(productId),
            new ObjectId(orderId),
            {
                rating,
                title,
                comment,
                images
            }
        )

        return res.status(201).json({
            message: REVIEWS_MESSAGES.CREATE_REVIEW_SUCCESS,
            data: result
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Get reviews for a product
 * GET /reviews/product/:productId
 */
export const getProductReviewsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { productId } = req.params
        const page = parseInt(req.query.page as string) || 1
        const limit = parseInt(req.query.limit as string) || 10
        const sortBy = (req.query.sortBy as any) || 'newest'

        const result = await reviewService.getReviewsByProductId(new ObjectId(productId), page, limit, sortBy)

        return res.status(200).json({
            message: REVIEWS_MESSAGES.GET_PRODUCT_REVIEWS_SUCCESS,
            data: result
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Get product review statistics
 * GET /reviews/product/:productId/stats
 */
export const getProductReviewStatsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { productId } = req.params

        const stats = await reviewService.getProductReviewStats(new ObjectId(productId))

        return res.status(200).json({
            message: REVIEWS_MESSAGES.GET_PRODUCT_REVIEW_STATS_SUCCESS,
            data: stats
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Get user's reviews
 * GET /reviews/user
 */
export const getUserReviewsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = req.decoded_authorization as TokenPayload

        const reviews = await reviewService.getReviewsByUserId(new ObjectId(userId))

        return res.status(200).json({
            message: REVIEWS_MESSAGES.GET_USER_REVIEWS_SUCCESS,
            data: reviews
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Update a review
 * PUT /reviews/:reviewId
 */
export const updateReviewController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = req.decoded_authorization as TokenPayload
        const { reviewId } = req.params
        const { rating, title, comment, images } = req.body

        const result = await reviewService.updateReview(new ObjectId(reviewId), new ObjectId(userId), {
            rating,
            title,
            comment,
            images
        })

        return res.status(200).json({
            message: REVIEWS_MESSAGES.UPDATE_REVIEW_SUCCESS,
            data: result
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Delete a review
 * DELETE /reviews/:reviewId
 */
export const deleteReviewController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = req.decoded_authorization as TokenPayload
        const { reviewId } = req.params

        const result = await reviewService.deleteReview(new ObjectId(reviewId), new ObjectId(userId))

        return res.status(200).json({
            message: REVIEWS_MESSAGES.DELETE_REVIEW_SUCCESS,
            data: result
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Mark a review as helpful
 * POST /reviews/:reviewId/helpful
 */
export const markReviewHelpfulController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = req.decoded_authorization as TokenPayload
        const { reviewId } = req.params

        const result = await reviewService.markReviewHelpful(new ObjectId(reviewId), new ObjectId(userId))

        return res.status(200).json({
            message: REVIEWS_MESSAGES.MARK_REVIEW_HELPFUL_SUCCESS,
            data: result
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Moderate a review (Admin/Pharmacist only)
 * PATCH /reviews/:reviewId/moderate
 */
export const moderateReviewController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = req.decoded_authorization as TokenPayload
        const { reviewId } = req.params
        const { status, notes } = req.body

        const result = await reviewService.moderateReview(new ObjectId(reviewId), new ObjectId(userId), status, notes)

        return res.status(200).json({
            message: REVIEWS_MESSAGES.MODERATE_REVIEW_SUCCESS,
            data: result
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Get all reviews for admin (with filtering)
 * GET /reviews/admin
 */
export const getAdminReviewsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status, page, limit, sortBy } = req.query

        const result = await reviewService.getAdminReviews({
            status: status as any,
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
            sortBy: sortBy as string
        })

        return res.status(200).json({
            message: REVIEWS_MESSAGES.GET_ADMIN_REVIEWS_SUCCESS,
            data: result
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Get admin dashboard statistics
 * GET /reviews/admin/stats
 */
export const getAdminReviewStatsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const stats = await reviewService.getAdminReviewStats()

        return res.status(200).json({
            message: REVIEWS_MESSAGES.GET_ADMIN_REVIEW_STATS_SUCCESS,
            data: stats
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Bulk moderate reviews (Admin only)
 * POST /reviews/admin/bulk-moderate
 */
export const bulkModerateController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = req.decoded_authorization as TokenPayload
        const { reviewIds, action } = req.body

        const result = await reviewService.bulkModerate(
            reviewIds.map((id: string) => new ObjectId(id)),
            action,
            new ObjectId(userId)
        )

        return res.status(200).json({
            message: REVIEWS_MESSAGES.BULK_MODERATE_SUCCESS,
            data: result
        })
    } catch (error) {
        next(error)
    }
}
