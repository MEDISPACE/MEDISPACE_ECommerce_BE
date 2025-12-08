import { Request, Response, NextFunction } from 'express'
import { ObjectId } from 'mongodb'
import reviewService from '~/services/reviews.services'
import { TokenPayload } from '~/models/requests/User.request'

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
            message: 'Review created successfully. It will be visible after moderation.',
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
            message: 'Get product reviews successfully',
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
            message: 'Get product review stats successfully',
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
            message: 'Get user reviews successfully',
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
            message: 'Review updated successfully. It will be re-moderated if content changed.',
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
            message: 'Review deleted successfully',
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
            message: 'Review marked as helpful',
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
            message: `Review ${status} successfully`,
            data: result
        })
    } catch (error) {
        next(error)
    }
}
