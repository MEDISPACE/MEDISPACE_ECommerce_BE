import { ObjectId } from 'mongodb'
import { ReviewStatus } from '~/constants/enum'

/**
 * Review Schema for Medical E-commerce
 *
 * Business Rules:
 * - Only verified purchasers can review products
 * - One review per user per product
 * - Reviews require moderation for medical products
 * - Rating must be 1-5 stars
 */

export interface ReviewType {
    _id?: ObjectId
    productId: ObjectId
    userId: ObjectId
    orderId: ObjectId // Proof of purchase - required for verified reviews

    // Review content
    rating: number // 1-5 stars (required)
    title: string // Short summary (optional but recommended)
    comment: string // Detailed review (required, min 10 chars)
    images?: string[] // Optional review images (max 5)

    // Verification & Trust
    isVerifiedPurchase: boolean // Auto-set based on order verification

    // Engagement metrics
    helpfulCount: number // Number of users who found this helpful
    helpfulVotes?: ObjectId[] // Users who voted helpful (prevent duplicate votes)

    // Hybrid Moderation - Auto-approval tracking
    autoApproved?: boolean // True if auto-approved by system

    // Flagging system for post-moderation
    flagged?: boolean // True if flagged for review
    flagReason?: 'spam' | 'inappropriate' | 'fake' | 'sensitive' | 'other'
    flaggedBy?: ObjectId // User who flagged
    flaggedAt?: Date

    // Moderation (important for medical products)
    status: ReviewStatus
    moderatedBy?: ObjectId // Admin/Pharmacist who moderated
    moderatedAt?: Date
    moderationNotes?: string // Internal notes for rejection reason

    // Timestamps
    createdAt?: Date
    updatedAt?: Date
}

export default class Review {
    _id?: ObjectId
    productId: ObjectId
    userId: ObjectId
    orderId: ObjectId

    rating: number
    title: string
    comment: string
    images?: string[]

    isVerifiedPurchase: boolean

    helpfulCount: number
    helpfulVotes?: ObjectId[]

    // Hybrid moderation
    autoApproved?: boolean
    flagged?: boolean
    flagReason?: 'spam' | 'inappropriate' | 'fake' | 'sensitive' | 'other'
    flaggedBy?: ObjectId
    flaggedAt?: Date

    status: ReviewStatus
    moderatedBy?: ObjectId
    moderatedAt?: Date
    moderationNotes?: string

    createdAt?: Date
    updatedAt?: Date

    constructor(review: ReviewType) {
        const date = new Date()

        this._id = review._id
        this.productId = review.productId
        this.userId = review.userId
        this.orderId = review.orderId

        // Review content
        this.rating = review.rating
        this.title = review.title || ''
        this.comment = review.comment
        this.images = review.images || []

        // Verification
        this.isVerifiedPurchase = review.isVerifiedPurchase || false

        // Engagement
        this.helpfulCount = review.helpfulCount || 0
        this.helpfulVotes = review.helpfulVotes || []

        // Hybrid moderation
        this.autoApproved = review.autoApproved || false
        this.flagged = review.flagged || false
        this.flagReason = review.flagReason
        this.flaggedBy = review.flaggedBy
        this.flaggedAt = review.flaggedAt

        // Moderation - default to pending for safety (medical products)
        this.status = review.status || ReviewStatus.Pending
        this.moderatedBy = review.moderatedBy
        this.moderatedAt = review.moderatedAt
        this.moderationNotes = review.moderationNotes

        // Timestamps
        this.createdAt = review.createdAt || date
        this.updatedAt = review.updatedAt || date
    }

    /**
     * Validate review data
     * @returns Error message if invalid, null if valid
     */
    validate(): string | null {
        // Rating validation
        if (!this.rating || this.rating < 1 || this.rating > 5) {
            return 'Rating must be between 1 and 5 stars'
        }

        // Comment validation (minimum length for meaningful feedback)
        if (!this.comment || this.comment.trim().length < 10) {
            return 'Review comment must be at least 10 characters'
        }

        // Comment max length (prevent spam)
        if (this.comment.length > 2000) {
            return 'Review comment must not exceed 2000 characters'
        }

        // Title validation (if provided)
        if (this.title && this.title.length > 200) {
            return 'Review title must not exceed 200 characters'
        }

        // Images validation
        if (this.images && this.images.length > 5) {
            return 'Maximum 5 images allowed per review'
        }

        return null
    }

    /**
     * Mark review as approved
     */
    approve(moderatorId: ObjectId, notes?: string) {
        this.status = ReviewStatus.Approved
        this.moderatedBy = moderatorId
        this.moderatedAt = new Date()
        this.moderationNotes = notes
        this.updatedAt = new Date()
    }

    /**
     * Mark review as rejected
     */
    reject(moderatorId: ObjectId, reason: string) {
        this.status = ReviewStatus.Rejected
        this.moderatedBy = moderatorId
        this.moderatedAt = new Date()
        this.moderationNotes = reason
        this.updatedAt = new Date()
    }

    /**
     * Increment helpful count
     */
    markHelpful(userId: ObjectId): boolean {
        // Check if user already voted
        if (this.helpfulVotes?.some((id) => id.equals(userId))) {
            return false // Already voted
        }

        this.helpfulCount++
        this.helpfulVotes = this.helpfulVotes || []
        this.helpfulVotes.push(userId)
        this.updatedAt = new Date()
        return true
    }

    /**
     * Decrement helpful count (undo vote)
     */
    unmarkHelpful(userId: ObjectId): boolean {
        const index = this.helpfulVotes?.findIndex((id) => id.equals(userId))

        if (index === undefined || index === -1) {
            return false // User hasn't voted
        }

        this.helpfulCount = Math.max(0, this.helpfulCount - 1)
        this.helpfulVotes?.splice(index, 1)
        this.updatedAt = new Date()
        return true
    }
}
