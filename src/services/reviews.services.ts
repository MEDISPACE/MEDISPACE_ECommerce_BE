import { ObjectId } from 'mongodb'
import Review from '~/models/schemas/Review.schema'
import databaseService from './database.services'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'
import { ReviewStatus } from '~/constants/enum'
import { REVIEWS_MESSAGES } from '~/constants/message'
import productsService from './products.services'
import typesenseService from './typesense.services'
import notificationService from './notifications.services'
import reviewAiModerationService from './reviewAiModeration.services'
import { moderateTextRuleBased } from '~/utils/moderation/moderationEngine'
import { getIO } from '~/sockets/chat.socket'
import type { Server as SocketIOServer } from 'socket.io'

/**
 * Review Service for Medical E-commerce
 *
 * Business Rules:
 * - Users can only review products they have purchased (verified purchase)
 * - One review per user per product
 * - Reviews require moderation before being visible
 * - Product ratings are recalculated after each review change
 */

class ReviewService {
  /**
   * Hybrid Moderation: Determine if review should be auto-approved
   *
   * Auto-approve criteria:
   * 1. Verified purchase (delivered order)
   * 2. User has good review history (3+ approved, 0 rejected)
   * 3. No spam patterns detected
   * 4. No sensitive keywords (medical safety)
   * 5. Reasonable content length
   * 6. Not extreme rating with short comment
   */
  private async shouldAutoApprove(
    userId: ObjectId,
    reviewData: {
      comment: string
      title?: string
      rating: number
      images?: string[]
    },
    isVerifiedPurchase: boolean
  ): Promise<boolean> {
    // Rule 1: Verified Purchase (HIGHEST PRIORITY)
    if (!isVerifiedPurchase) return false

    // Rule 2: Cực ngắn — block ngay (<5 ký tự như "ok", "a")
    // Ngưỡng 5 (thay vì 10) để không phạt nhầm review ngắn chân thực
    // VD: "Tốt!" (4 ký tự) → pending, "Tốt lắm" (7 ký tự) → tiếp tục check
    if (reviewData.comment.trim().length < 5) return false

    // Rule 3: Quá dài bất thường
    if (reviewData.comment.length > 2000) return false

    // Rule 4: Rule-based moderation engine (PII, spam URL, toxic, medical_harm)
    // Thay thế các inline regex/keyword checks — dùng chung với community moderation
    const textToCheck = `${reviewData.title || ''} ${reviewData.comment}`.trim()
    const ruleResult = moderateTextRuleBased(textToCheck)

    // Severity high/critical → Force pending (PII, dangerous medical advice, critical toxic)
    if (ruleResult.severity === 'high' || ruleResult.severity === 'critical') return false

    // Severity medium → Force pending (spam URLs, toxic language)
    // AI layer sẽ xử lý các trường hợp tinh vi hơn không bị rule bắt
    if (ruleResult.severity === 'medium') return false

    // Rule 5: User Trust Score
    // Trusted users (≥3 approved, 0 rejected) → auto-approve bất kể độ dài
    // Lý do: khách hàng trung thành có thể viết ngắn vẫn là review thật
    const userReviews = await databaseService.reviews.find({ userId }).toArray()
    const approvedCount = userReviews.filter((r) => r.status === ReviewStatus.Approved).length
    const rejectedCount = userReviews.filter((r) => r.status === ReviewStatus.Rejected).length

    if (approvedCount >= 3 && rejectedCount === 0) return true

    // Rule 6: Too Many Images (potential spam)
    if (reviewData.images && reviewData.images.length > 3) return false

    // Default: Auto-approve nếu qua hết rule-based checks
    // AI layer sẽ chạy nền sau để phát hiện các vấn đề tinh vi hơn
    return true
  }

  /**
   * Create a new review
   *
   * @param userId - ID of the user creating the review
   * @param productId - ID of the product being reviewed
   * @param orderId - ID of the order (proof of purchase)
   * @param data - Review data (rating, title, comment, images)
   * @returns Created review
   */
  async createReview(
    userId: ObjectId,
    productId: ObjectId,
    orderId: ObjectId,
    data: {
      rating: number
      title?: string
      comment: string
      images?: string[]
    }
  ) {
    // 1. Verify the order exists and belongs to the user
    const order = await databaseService.orders.findOne({
      _id: orderId,
      userId: userId
    })

    if (!order) {
      throw new ErrorWithStatus({
        message: REVIEWS_MESSAGES.ORDER_NOT_FOUND_OR_NOT_YOURS,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    // 2. Verify order is delivered (only delivered orders can be reviewed)
    if (order.orderStatus !== 'delivered') {
      throw new ErrorWithStatus({
        message: REVIEWS_MESSAGES.ORDER_NOT_DELIVERED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // 3. Verify the product is in the order
    const productInOrder = order.items.some((item) => item.productId.equals(productId))

    if (!productInOrder) {
      throw new ErrorWithStatus({
        message: REVIEWS_MESSAGES.PRODUCT_NOT_IN_ORDER,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // 4. Check if user already reviewed this product
    const existingReview = await databaseService.reviews.findOne({
      userId: userId,
      productId: productId
    })

    if (existingReview) {
      throw new ErrorWithStatus({
        message: REVIEWS_MESSAGES.REVIEW_ALREADY_EXISTS,
        status: HTTP_STATUS.CONFLICT
      })
    }

    // 5. Hybrid Moderation: Check if should auto-approve
    const shouldApprove = await this.shouldAutoApprove(
      userId,
      {
        comment: data.comment,
        title: data.title,
        rating: data.rating,
        images: data.images
      },
      true // isVerifiedPurchase = true (we verified the order above)
    )

    // 6. Create review instance with appropriate status
    const review = new Review({
      _id: new ObjectId(),
      productId,
      userId,
      orderId,
      rating: data.rating,
      title: data.title || '',
      comment: data.comment,
      images: data.images || [],
      isVerifiedPurchase: true, // Always true since we verified the order
      helpfulCount: 0,
      helpfulVotes: [],
      autoApproved: shouldApprove, // Track if auto-approved
      status: shouldApprove ? ReviewStatus.Approved : ReviewStatus.Pending
    })

    // 7. Validate review data
    const validationError = review.validate()
    if (validationError) {
      throw new ErrorWithStatus({
        message: validationError,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // 8. Insert review into database
    const result = await databaseService.reviews.insertOne(review)

    // 9. Update product rating statistics (only for approved reviews)
    if (shouldApprove) {
      await this.updateProductRating(productId)
    }

    // 10. AI Moderation — fire-and-forget (KHÔNG block response về customer)
    // Chạy nền sau khi save, nếu AI phát hiện vấn đề sẽ tự downgrade status
    const aiContent = `${data.title || ''} ${data.comment}`.trim()
    reviewAiModerationService.analyzeAsync(result.insertedId, userId, aiContent).catch(() => {})

    return { ...review, _id: result.insertedId }
  }

  /**
   * Get reviews for a specific product
   *
   * @param productId - ID of the product
   * @param page - Page number (default: 1)
   * @param limit - Number of reviews per page (default: 10)
   * @param sortBy - Sort criteria (default: 'newest')
   * @returns Paginated reviews
   */
  async getReviewsByProductId(
    productId: ObjectId,
    page: number = 1,
    limit: number = 10,
    sortBy: 'newest' | 'oldest' | 'highest' | 'lowest' | 'helpful' = 'newest'
  ) {
    const skip = (page - 1) * limit

    // Only show approved reviews to public
    const query: any = {
      productId: productId,
      status: ReviewStatus.Approved
    }

    // Determine sort order
    let sort: any = { createdAt: -1 } // Default: newest first
    switch (sortBy) {
      case 'oldest':
        sort = { createdAt: 1 }
        break
      case 'highest':
        sort = { rating: -1, createdAt: -1 }
        break
      case 'lowest':
        sort = { rating: 1, createdAt: -1 }
        break
      case 'helpful':
        sort = { helpfulCount: -1, createdAt: -1 }
        break
    }

    const [reviews, total] = await Promise.all([
      databaseService.reviews
        .aggregate([
          { $match: query },
          { $sort: sort },
          { $skip: skip },
          { $limit: limit },
          // Lookup user information
          {
            $lookup: {
              from: 'users',
              localField: 'userId',
              foreignField: '_id',
              as: 'user'
            }
          },
          { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
          // Project only necessary fields
          {
            $project: {
              _id: 1,
              productId: 1,
              userId: 1,
              orderId: 1,
              rating: 1,
              title: 1,
              comment: 1,
              images: 1,
              isVerifiedPurchase: 1,
              helpfulCount: 1,
              status: 1,
              createdAt: 1,
              updatedAt: 1,
              userName: {
                $concat: ['$user.firstName', ' ', '$user.lastName']
              },
              userAvatar: '$user.avatar'
            }
          }
        ])
        .toArray(),
      databaseService.reviews.countDocuments(query)
    ])

    return {
      reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }
  }

  /**
   * Get all reviews by a specific user
   *
   * @param userId - ID of the user
   * @returns User's reviews with product information
   */
  async getReviewsByUserId(userId: ObjectId) {
    const reviews = await databaseService.reviews
      .aggregate([
        { $match: { userId: userId } },
        { $sort: { createdAt: -1 } },
        // Lookup product information
        {
          $lookup: {
            from: 'products',
            localField: 'productId',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        // Project fields
        {
          $project: {
            _id: 1,
            productId: 1,
            rating: 1,
            title: 1,
            comment: 1,
            images: 1,
            isVerifiedPurchase: 1,
            helpfulCount: 1,
            status: 1,
            moderationNotes: 1,
            createdAt: 1,
            updatedAt: 1,
            productName: '$product.name',
            productImage: '$product.featuredImage',
            productSlug: '$product.slug'
          }
        }
      ])
      .toArray()

    return reviews
  }

  /**
   * Update a review (user can only update their own review)
   *
   * @param reviewId - ID of the review
   * @param userId - ID of the user (for authorization)
   * @param data - Updated review data
   * @returns Updated review
   */
  async updateReview(
    reviewId: ObjectId,
    userId: ObjectId,
    data: {
      rating?: number
      title?: string
      comment?: string
      images?: string[]
    }
  ) {
    // 1. Find the review
    const review = await databaseService.reviews.findOne({ _id: reviewId })

    if (!review) {
      throw new ErrorWithStatus({
        message: REVIEWS_MESSAGES.REVIEW_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    // 2. Verify ownership
    if (!review.userId.equals(userId)) {
      throw new ErrorWithStatus({
        message: REVIEWS_MESSAGES.NOT_YOUR_REVIEW,
        status: HTTP_STATUS.FORBIDDEN
      })
    }

    // 2b. Rejected reviews cannot be edited — customer must contact admin
    if (review.status === ReviewStatus.Rejected) {
      throw new ErrorWithStatus({
        message: REVIEWS_MESSAGES.REJECTED_REVIEW_CANNOT_BE_EDITED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // 3. Prepare update data
    const updateData: any = {
      updatedAt: new Date()
    }

    if (data.rating !== undefined) {
      if (data.rating < 1 || data.rating > 5) {
        throw new ErrorWithStatus({
          message: REVIEWS_MESSAGES.RATING_INVALID,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
      updateData.rating = data.rating
    }

    if (data.title !== undefined) {
      if (data.title.length > 200) {
        throw new ErrorWithStatus({
          message: REVIEWS_MESSAGES.TITLE_TOO_LONG,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
      updateData.title = data.title
    }

    if (data.comment !== undefined) {
      if (data.comment.trim().length < 5) {
        throw new ErrorWithStatus({
          message: REVIEWS_MESSAGES.COMMENT_TOO_SHORT,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
      if (data.comment.length > 2000) {
        throw new ErrorWithStatus({
          message: REVIEWS_MESSAGES.COMMENT_TOO_LONG,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
      updateData.comment = data.comment
    }

    if (data.images !== undefined) {
      if (data.images.length > 5) {
        throw new ErrorWithStatus({
          message: REVIEWS_MESSAGES.TOO_MANY_IMAGES,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
      updateData.images = data.images
    }

    // Re-evaluate moderation if content changed
    let shouldUpdateStatus = false
    if (data.comment !== undefined || data.title !== undefined || data.rating !== undefined) {
      const shouldApprove = await this.shouldAutoApprove(
        userId,
        {
          comment: data.comment ?? review.comment,
          title: data.title ?? review.title,
          rating: data.rating ?? review.rating,
          images: data.images ?? review.images
        },
        review.isVerifiedPurchase
      )

      updateData.autoApproved = shouldApprove
      updateData.status = shouldApprove ? ReviewStatus.Approved : ReviewStatus.Pending
      // Reset AI moderation fields — nội dung đã thay đổi, AI sẽ re-score sau
      updateData.aiModeration = null
      updateData.aiFlag = false
      shouldUpdateStatus = true
    }

    // 5. Update review
    const result = await databaseService.reviews.findOneAndUpdate(
      { _id: reviewId },
      { $set: updateData },
      { returnDocument: 'after' }
    )

    // 6. Update product rating
    if (review.status === ReviewStatus.Approved || shouldUpdateStatus) {
      await this.updateProductRating(review.productId)
    }

    // 7. AI Moderation re-score nếu nội dung đã thay đổi — fire-and-forget
    const contentChanged = data.comment !== undefined || data.title !== undefined
    if (contentChanged) {
      const newComment = data.comment ?? review.comment
      const newTitle = data.title ?? review.title ?? ''
      reviewAiModerationService.analyzeAsync(reviewId, userId, `${newTitle} ${newComment}`.trim()).catch(() => {})
    }

    return result
  }

  /**
   * Delete a review (user can only delete their own review)
   *
   * @param reviewId - ID of the review
   * @param userId - ID of the user (for authorization)
   */
  async deleteReview(reviewId: ObjectId, userId: ObjectId) {
    // 1. Find the review
    const review = await databaseService.reviews.findOne({ _id: reviewId })

    if (!review) {
      throw new ErrorWithStatus({
        message: REVIEWS_MESSAGES.REVIEW_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    // 2. Verify ownership
    if (!review.userId.equals(userId)) {
      throw new ErrorWithStatus({
        message: REVIEWS_MESSAGES.NOT_YOUR_REVIEW,
        status: HTTP_STATUS.FORBIDDEN
      })
    }

    // 3. Delete review
    await databaseService.reviews.deleteOne({ _id: reviewId })

    // 4. Update product rating only if the deleted review was approved
    if (review.status === ReviewStatus.Approved) {
      await this.updateProductRating(review.productId)
    }

    return { message: REVIEWS_MESSAGES.DELETE_REVIEW_SUCCESS }
  }

  /**
   * Mark a review as helpful
   *
   * @param reviewId - ID of the review
   * @param userId - ID of the user voting
   * @returns Updated review
   */
  async markReviewHelpful(reviewId: ObjectId, userId: ObjectId) {
    const review = await databaseService.reviews.findOne({ _id: reviewId })

    if (!review) {
      throw new ErrorWithStatus({
        message: REVIEWS_MESSAGES.REVIEW_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    // Only approved reviews can receive helpful votes (pending/rejected are not public)
    if (review.status !== ReviewStatus.Approved) {
      throw new ErrorWithStatus({
        message: REVIEWS_MESSAGES.REVIEW_NOT_APPROVED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // Check if user is voting their own review
    if (review.userId.equals(userId)) {
      throw new ErrorWithStatus({
        message: REVIEWS_MESSAGES.CANNOT_VOTE_OWN_REVIEW,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // Check if user already voted
    const alreadyVoted = review.helpfulVotes?.some((id) => id.equals(userId))

    if (alreadyVoted) {
      throw new ErrorWithStatus({
        message: REVIEWS_MESSAGES.ALREADY_VOTED_HELPFUL,
        status: HTTP_STATUS.CONFLICT
      })
    }

    // Add vote
    const result = await databaseService.reviews.findOneAndUpdate(
      { _id: reviewId },
      {
        $inc: { helpfulCount: 1 },
        $push: { helpfulVotes: userId },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: 'after' }
    )

    return result
  }

  /**
   * Moderate a review (Admin/Pharmacist only)
   *
   * @param reviewId - ID of the review
   * @param moderatorId - ID of the moderator
   * @param status - New status ('approved' or 'rejected')
   * @param notes - Moderation notes (required for rejection)
   * @returns Updated review
   */
  async moderateReview(reviewId: ObjectId, moderatorId: ObjectId, status: ReviewStatus, notes?: string) {
    const review = await databaseService.reviews.findOne({ _id: reviewId })

    if (!review) {
      throw new ErrorWithStatus({
        message: REVIEWS_MESSAGES.REVIEW_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    // Rejection requires notes
    if (status === 'rejected' && !notes) {
      throw new ErrorWithStatus({
        message: REVIEWS_MESSAGES.REJECTION_REASON_REQUIRED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // Update review — admin decision clears aiFlag (human overrides AI)
    const result = await databaseService.reviews.findOneAndUpdate(
      { _id: reviewId },
      {
        $set: {
          status,
          moderatedBy: moderatorId,
          moderatedAt: new Date(),
          moderationNotes: notes,
          aiFlag: false,           // Admin reviewed → clear AI flag
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    )

    // Update product rating (approved/rejected affects visible rating)
    await this.updateProductRating(review.productId)

    // Notify customer:
    // - ALWAYS notify when rejected (customer needs to know why)
    // - Notify when manually approved (review was pending, customer was waiting)
    // - SKIP when auto-approved (customer already got success toast on submit)
    if (status === ReviewStatus.Rejected || status === ReviewStatus.Approved) {
      try {
        const product = await databaseService.products.findOne(
          { _id: review.productId },
          { projection: { name: 1 } }
        )
        const productName = product?.name ?? 'sản phẩm'

        // Graceful degradation: getIO() throws if socket not initialized (e.g. during tests)
        // In that case, notification is still persisted in DB — real-time push is skipped
        let io: SocketIOServer | undefined
        try { io = getIO() } catch { io = undefined }

        await notificationService.notifyReviewModerated(
          review.userId,
          reviewId,
          productName,
          status === ReviewStatus.Approved ? 'approved' : 'rejected',
          Boolean(review.autoApproved),
          notes,
          io
        )
      } catch (notifyErr) {
        // Notification failure must NOT block moderation result
        console.error('[ReviewService] notifyReviewModerated failed:', notifyErr)
      }
    }

    return result
  }

  /**
   * Recalculate and update product rating statistics
   *
   * @param productId - ID of the product
   */
  async updateProductRating(productId: ObjectId) {
    // Get all approved reviews for the product
    const reviews = await databaseService.reviews
      .find({
        productId: productId,
        status: ReviewStatus.Approved
      })
      .toArray()

    // Calculate statistics
    const reviewCount = reviews.length
    const averageRating = reviewCount > 0 ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount : 0

    // Calculate rating distribution
    const ratingDistribution = {
      1: reviews.filter((r) => r.rating === 1).length,
      2: reviews.filter((r) => r.rating === 2).length,
      3: reviews.filter((r) => r.rating === 3).length,
      4: reviews.filter((r) => r.rating === 4).length,
      5: reviews.filter((r) => r.rating === 5).length
    }

    // Update product
    await databaseService.products.updateOne(
      { _id: productId },
      {
        $set: {
          rating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
          reviewCount: reviewCount,
          ratingDistribution: ratingDistribution,
          updatedAt: new Date()
        }
      }
    )

    try {
      const updatedProduct = await productsService.getProductById(productId.toString())
      typesenseService.indexProduct(updatedProduct).catch(() => {})
    } catch {
      // Rating update should not fail review moderation if product re-indexing cannot run.
    }
  }

  /**
   * Get review statistics for a product
   *
   * @param productId - ID of the product
   * @returns Review statistics
   */
  async getProductReviewStats(productId: ObjectId) {
    const reviews = await databaseService.reviews
      .find({
        productId: productId,
        status: ReviewStatus.Approved
      })
      .toArray()

    const total = reviews.length
    const averageRating = total > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / total : 0

    const distribution = {
      5: reviews.filter((r) => r.rating === 5).length,
      4: reviews.filter((r) => r.rating === 4).length,
      3: reviews.filter((r) => r.rating === 3).length,
      2: reviews.filter((r) => r.rating === 2).length,
      1: reviews.filter((r) => r.rating === 1).length
    }

    const percentages = {
      5: total > 0 ? Math.round((distribution[5] / total) * 100) : 0,
      4: total > 0 ? Math.round((distribution[4] / total) * 100) : 0,
      3: total > 0 ? Math.round((distribution[3] / total) * 100) : 0,
      2: total > 0 ? Math.round((distribution[2] / total) * 100) : 0,
      1: total > 0 ? Math.round((distribution[1] / total) * 100) : 0
    }

    return {
      total,
      averageRating: Math.round(averageRating * 10) / 10,
      distribution,
      percentages
    }
  }

  /**
   * Get all reviews for admin dashboard (with filtering)
   *
   * @param filters - Filter criteria
   * @returns Paginated reviews with filters
   */
  async getAdminReviews(filters: {
    status?: ReviewStatus
    page?: number
    limit?: number
    sortBy?: string
    dateFrom?: string
    dateTo?: string
  }) {
    const query: any = {}

    // Filter by status if provided
    if (filters.status) {
      query.status = filters.status
    }

    // Filter by date range
    if (filters.dateFrom || filters.dateTo) {
      query.createdAt = {}
      if (filters.dateFrom) {
        query.createdAt.$gte = new Date(filters.dateFrom)
      }
      if (filters.dateTo) {
        // Add 1 day to include the entire end date
        const endDate = new Date(filters.dateTo)
        endDate.setDate(endDate.getDate() + 1)
        query.createdAt.$lt = endDate
      }
    }

    const page = filters.page || 1
    const limit = filters.limit || 20
    const skip = (page - 1) * limit

    // Sort options
    let sort: any = { createdAt: -1 } // Default: newest first
    if (filters.sortBy === 'oldest') sort = { createdAt: 1 }
    if (filters.sortBy === 'rating-high') sort = { rating: -1 }
    if (filters.sortBy === 'rating-low') sort = { rating: 1 }

    // Get reviews with populated product and user info using aggregation
    const [reviewsResult, total] = await Promise.all([
      databaseService.reviews
        .aggregate([
          { $match: query },
          { $sort: sort },
          { $skip: skip },
          { $limit: limit },
          // Lookup product info
          {
            $lookup: {
              from: 'products',
              localField: 'productId',
              foreignField: '_id',
              as: 'productInfo'
            }
          },
          // Lookup user info
          {
            $lookup: {
              from: 'users',
              localField: 'userId',
              foreignField: '_id',
              as: 'userInfo'
            }
          },
          // Add computed fields
          {
            $addFields: {
              productName: { $arrayElemAt: ['$productInfo.name', 0] },
              userName: {
                $concat: [
                  { $arrayElemAt: ['$userInfo.firstName', 0] },
                  ' ',
                  { $arrayElemAt: ['$userInfo.lastName', 0] }
                ]
              }
            }
          },
          // Remove lookup arrays to keep response clean
          {
            $project: {
              productInfo: 0,
              userInfo: 0
            }
          }
        ])
        .toArray(),
      databaseService.reviews.countDocuments(query)
    ])

    return {
      reviews: reviewsResult,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }
  }

  /**
   * Get admin dashboard statistics
   *
   * @returns Review statistics for admin dashboard
   */
  async getAdminReviewStats() {
    // Count reviews by status
    const [total, pending, approved, rejected, autoApproved] = await Promise.all([
      databaseService.reviews.countDocuments(),
      databaseService.reviews.countDocuments({ status: ReviewStatus.Pending }),
      databaseService.reviews.countDocuments({ status: ReviewStatus.Approved }),
      databaseService.reviews.countDocuments({ status: ReviewStatus.Rejected }),
      databaseService.reviews.countDocuments({ autoApproved: true })
    ])

    // Calculate average rating (approved reviews only)
    const avgRatingResult = await databaseService.reviews
      .aggregate([
        { $match: { status: ReviewStatus.Approved } },
        { $group: { _id: null, avgRating: { $avg: '$rating' } } }
      ])
      .toArray()

    const averageRating = avgRatingResult[0]?.avgRating || 0

    return {
      total,
      pending,
      approved,
      rejected,
      autoApproved,
      autoApprovedPercentage: total > 0 ? Math.round((autoApproved / total) * 100) : 0,
      averageRating: Math.round(averageRating * 10) / 10
    }
  }

  /**
   * Bulk moderate reviews (approve or reject multiple reviews)
   *
   * @param reviewIds - Array of review IDs
   * @param action - 'approve' or 'reject'
   * @param moderatorId - ID of the moderator
   * @returns Result of bulk operation
   */
  async bulkModerate(reviewIds: ObjectId[], action: 'approve' | 'reject', moderatorId: ObjectId) {
    // Fetch reviews BEFORE updating so we have userId, productId, autoApproved
    const reviews = await databaseService.reviews.find({ _id: { $in: reviewIds } }).toArray()

    const updateData: any = {
      moderatedBy: moderatorId,
      moderatedAt: new Date()
    }

    const bulkRejectionReason = 'Nội dung không đáp ứng tiêu chuẩn cộng đồng của MEDISPACE.'

    if (action === 'approve') {
      updateData.status = ReviewStatus.Approved
    } else {
      updateData.status = ReviewStatus.Rejected
      updateData.moderationNotes = bulkRejectionReason
    }

    // Update all reviews — admin decision clears aiFlag (human overrides AI)
    const result = await databaseService.reviews.updateMany(
      { _id: { $in: reviewIds } },
      { $set: { ...updateData, aiFlag: false, updatedAt: new Date() } }
    )

    // Update product ratings for affected products
    const productIds = [...new Set(reviews.map((r) => r.productId))]
    await Promise.all(productIds.map((id) => this.updateProductRating(id)))

    // Notify each affected customer (fire-and-forget — don't block bulk result)
    try {
      // Graceful degradation: getIO() throws if socket not initialized
      let io: SocketIOServer | undefined
      try { io = getIO() } catch { io = undefined }

      // Fetch product names once (deduplicated by productId)
      const productDocs = await databaseService.products
        .find({ _id: { $in: productIds } }, { projection: { _id: 1, name: 1 } })
        .toArray()
      const productNameMap = new Map(productDocs.map((p) => [p._id.toString(), p.name as string]))

      await Promise.all(
        reviews.map((review) =>
          notificationService
            .notifyReviewModerated(
              review.userId,
              review._id!,
              productNameMap.get(review.productId.toString()) ?? 'sản phẩm',
              action === 'approve' ? 'approved' : 'rejected',
              Boolean(review.autoApproved),
              action === 'reject' ? bulkRejectionReason : undefined,
              io
            )
            .catch((e) => console.error('[ReviewService] bulkModerate notify failed:', e))
        )
      )
    } catch (bulkNotifyErr) {
      // Notification failure must NOT block bulk moderation result
      console.error('[ReviewService] bulkModerate notification block failed:', bulkNotifyErr)
    }

    return {
      modifiedCount: result.modifiedCount,
      action
    }
  }
}

const reviewService = new ReviewService()
export default reviewService
