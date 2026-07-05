import { MongoClient, Db, Collection, ClientSession, TransactionOptions } from 'mongodb'
import { config } from 'dotenv'
import User from '~/models/schemas/User.schema'
import RefreshToken from '~/models/schemas/RefreshToken.schema'
import Category from '~/models/schemas/Category.schema'
import Brand from '~/models/schemas/Brand.schema'
import Product from '~/models/schemas/Product.schema'
import ProductMedia from '~/models/schemas/ProductMedia.schema'
import Cart from '~/models/schemas/Cart.schema'
import Order from '~/models/schemas/Order.schema'
import Prescription from '~/models/schemas/Prescription.schema'
import PatientMedicalInfo from '~/models/schemas/PatientMedicalInfo.schema'
import PatientNote from '~/models/schemas/PatientNote.schema'
import Review from '~/models/schemas/Review.schema'
import ProductDetail from '~/models/schemas/ProductDetail.schema'
import Conversation from '~/models/schemas/Conversation.schema'
import Message from '~/models/schemas/Message.schema'
import Article from '~/models/schemas/Article.schema'
import HealthCategory from '~/models/schemas/HealthCategory.schema'
import ReturnRequest from '~/models/schemas/ReturnRequest.schema'
import Coupon from '~/models/schemas/Coupon.schema'
import CouponRedemption from '~/models/schemas/CouponRedemption.schema'
import Campaign from '~/models/schemas/Campaign.schema'
import LoyaltyAccount from '~/models/schemas/LoyaltyAccount.schema'
import LoyaltyTransaction from '~/models/schemas/LoyaltyTransaction.schema'
import LoyaltyProgramConfig from '~/models/schemas/LoyaltyProgramConfig.schema'
import Notification from '~/models/schemas/Notification.schema'
import { ensureCriticalLoyaltyCouponIndexes, verifyCriticalLoyaltyCouponIndexes } from './loyaltyCouponIndexes.services'

config()

const uri =
  process.env.MONGODB_URI ||
  `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@medispacedb.35qkwso.mongodb.net/?retryWrites=true&w=majority&appName=MediSpaceDB`

class DatabaseService {
  private client: MongoClient
  public db: Db
  constructor() {
    this.client = new MongoClient(uri)
    this.db = this.client.db(process.env.DB_NAME)
  }
  async connect() {
    try {
      await this.client.connect()
      await this.db.command({ ping: 1 })
      // Create indexes for better performance
      await this.createIndexes()
      // Reset online status on server startup to handle crashes/restarts
      await this.users.updateMany({}, { $set: { isOnline: false, onlineCount: 0 } })
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error)
      process.exit(1)
    }
  }

  async withTransaction<T>(
    callback: (session?: ClientSession) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    const session = this.client.startSession()
    try {
      return await session.withTransaction(() => callback(session), options)
    } catch (error: any) {
      const message = String(error?.message || '')
      if (
        message.includes('Transaction numbers are only allowed') ||
        message.includes('replica set member or mongos')
      ) {
        console.warn('[Database] MongoDB transactions unavailable; running operation without transaction')
        return callback(undefined)
      }
      throw error
    } finally {
      await session.endSession()
    }
  }

  async createIndexes() {
    // Helper function to safely create index
    const safeCreateIndex = async (collection: any, indexSpec: any, options?: any) => {
      try {
        await collection.createIndex(indexSpec, { background: true, ...options })
      } catch (error: any) {
        if (error.code === 11000 || error.code === 85 || error.code === 86) {
          console.warn('⚠️ Non-critical MongoDB index was not created:', {
            collection: collection.collectionName,
            indexSpec,
            code: error.code,
            message: error.message
          })
        } else {
          throw error
        }
      }
    }

    const ensureActiveConversationUniqueIndex = async () => {
      const legacyIndexName = 'customerId_1_type_1_status_1'
      const activeUniqueIndexName = 'customer_active_conversation_unique'

      try {
        const indexes = await this.conversations.indexes()
        const legacyIndex = indexes.find((index: any) => index.name === legacyIndexName)
        const activeUniqueIndex = indexes.find((index: any) => index.name === activeUniqueIndexName)

        if (legacyIndex && !legacyIndex.unique && !legacyIndex.partialFilterExpression && !activeUniqueIndex) {
          await this.conversations.dropIndex(legacyIndexName)
        }
      } catch (error: any) {
        console.warn('⚠️ Could not inspect/drop legacy conversation index:', error?.message || error)
      }

      await safeCreateIndex(
        this.conversations,
        { customerId: 1, type: 1, status: 1 },
        {
          name: activeUniqueIndexName,
          unique: true,
          partialFilterExpression: { status: 'active' }
        }
      )
    }

    const ensurePrescriptionOrderUniqueIndex = async () => {
      const legacyIndexName = 'prescriptionId_1'
      const activeUniqueIndexName = 'order_prescription_unique_when_objectid'

      try {
        const indexes = await this.orders.indexes()
        const legacyIndex = indexes.find((index: any) => index.name === legacyIndexName)
        const activeUniqueIndex = indexes.find((index: any) => index.name === activeUniqueIndexName)
        const legacyUsesObjectIdPartial =
          legacyIndex?.unique === true && legacyIndex?.partialFilterExpression?.prescriptionId?.$type === 'objectId'

        if (legacyIndex && !legacyUsesObjectIdPartial && !activeUniqueIndex) {
          await this.orders.dropIndex(legacyIndexName)
        }
      } catch (error: any) {
        console.warn('⚠️ Could not inspect/drop legacy prescription order index:', error?.message || error)
      }

      await safeCreateIndex(
        this.orders,
        { prescriptionId: 1 },
        {
          name: activeUniqueIndexName,
          unique: true,
          partialFilterExpression: { prescriptionId: { $type: 'objectId' } }
        }
      )
    }

    try {
      // Auth collection indexes
      await safeCreateIndex(this.users, { email: 1 }, { unique: true })
      await safeCreateIndex(this.refreshTokens, { token: 1 }, { unique: true })
      await safeCreateIndex(this.refreshTokens, { userId: 1 })
      await safeCreateIndex(this.refreshTokens, { expiresAt: 1 }, { expireAfterSeconds: 0 })

      // Products collection indexes
      await safeCreateIndex(this.products, { categoryId: 1, isActive: 1, createdAt: -1 })
      await safeCreateIndex(this.products, { isActive: 1, name: 1, _id: 1 })
      await safeCreateIndex(this.products, { categoryId: 1 })
      await safeCreateIndex(this.products, { slug: 1 }, { unique: true })
      await safeCreateIndex(this.products, { sku: 1 }, { unique: true })
      await safeCreateIndex(
        this.products,
        { name: 'text', shortDescription: 'text', sku: 'text' },
        {
          weights: { name: 3, shortDescription: 1, sku: 2 }
        }
      )
      await safeCreateIndex(this.articleJourneyEvents, { articleId: 1, eventType: 1, createdAt: -1 })
      await safeCreateIndex(this.articleJourneyEvents, { sessionId: 1, createdAt: -1 })
      const recommendationEvents = this.db.collection('recommendationEvents')
      await safeCreateIndex(recommendationEvents, { userId: 1, timestamp: -1 })
      await safeCreateIndex(recommendationEvents, { productId: 1, timestamp: -1 })
      await safeCreateIndex(recommendationEvents, { attributionToken: 1, eventType: 1 })
      await safeCreateIndex(recommendationEvents, {
        experimentId: 1,
        experimentVariant: 1,
        eventType: 1,
        timestamp: -1
      })
      await safeCreateIndex(this.db.collection('drugSafetyRules'), { productId: 1, status: 1 })
      await safeCreateIndex(this.db.collection('recommendationSafetyEvents'), { timestamp: -1, reason: 1 })
      await safeCreateIndex(this.db.collection('recommendationQualityEvents'), {
        timestamp: -1,
        algorithm: 1,
        variant: 1
      })
      await safeCreateIndex(recommendationEvents, { timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 })

      // Categories collection indexes
      await safeCreateIndex(this.categories, { slug: 1 }, { unique: true })
      await safeCreateIndex(this.categories, { path: 1 })
      await safeCreateIndex(this.categories, { parentId: 1 })

      // Brands collection indexes
      await safeCreateIndex(this.brands, { slug: 1 }, { unique: true })

      // Reviews collection indexes
      await safeCreateIndex(this.reviews, { productId: 1, createdAt: -1 })

      // Orders collection indexes used by recommendation training and replenishment.
      await safeCreateIndex(this.orders, { orderStatus: 1, createdAt: -1 })
      await safeCreateIndex(this.orders, { paymentStatus: 1, orderStatus: 1, createdAt: -1 })
      await safeCreateIndex(this.orders, { 'shippingAddress.phone': 1 })
      await safeCreateIndex(this.orders, { 'shippingAddress.firstName': 1, 'shippingAddress.lastName': 1 })
      await safeCreateIndex(this.orders, { userId: 1, orderStatus: 1, deliveredAt: -1 })
      await safeCreateIndex(this.orders, { orderNumber: 1 }, { unique: true })
      await ensurePrescriptionOrderUniqueIndex()
      await safeCreateIndex(
        this.orders,
        { userId: 1, idempotencyKey: 1 },
        { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
      )
      await safeCreateIndex(
        this.orders,
        { createdBy: 1, idempotencyKey: 1 },
        { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' }, createdBy: { $type: 'objectId' } } }
      )

      // Prescriptions collection indexes for pharmacist dashboard and verification queues.
      await safeCreateIndex(this.prescriptions, { status: 1, createdAt: -1 })
      await safeCreateIndex(this.prescriptions, { status: 1, verifiedAt: -1 })
      await safeCreateIndex(this.prescriptions, { customerId: 1, createdAt: -1 })

      // Return Requests collection indexes
      await safeCreateIndex(this.returnRequests, { userId: 1, createdAt: -1 })
      await safeCreateIndex(this.returnRequests, { orderId: 1 })
      await safeCreateIndex(this.returnRequests, { status: 1 })
      await safeCreateIndex(this.returnRequests, { requestNumber: 1 }, { unique: true })

      // Coupons collection indexes
      await safeCreateIndex(this.coupons, { code: 1 }, { unique: true })
      await safeCreateIndex(this.coupons, { isActive: 1, startDate: 1, endDate: 1 })
      await safeCreateIndex(this.coupons, { isPublic: 1, isActive: 1 })

      // CouponRedemptions collection indexes
      await safeCreateIndex(this.couponRedemptions, { couponId: 1, userId: 1 })
      await safeCreateIndex(this.couponRedemptions, { couponCode: 1, userId: 1, orderId: 1 }, { unique: true })
      await safeCreateIndex(this.couponRedemptions, { orderId: 1 })
      await safeCreateIndex(this.couponRedemptions, { userId: 1, createdAt: -1 })

      // Campaigns collection indexes
      await safeCreateIndex(this.campaigns, { slug: 1 }, { unique: true })
      await safeCreateIndex(this.campaigns, { status: 1, startDate: 1, endDate: 1 })
      await safeCreateIndex(this.campaigns, { status: 1, isPublic: 1, priority: -1 })
      await safeCreateIndex(this.typesenseSyncState, { key: 1 }, { unique: true })

      // LoyaltyAccounts collection indexes
      await safeCreateIndex(this.loyaltyAccounts, { userId: 1 }, { unique: true })
      await safeCreateIndex(this.loyaltyAccounts, { tier: 1 })

      // LoyaltyTransactions collection indexes
      await safeCreateIndex(this.loyaltyTransactions, { userId: 1, createdAt: -1 })
      await safeCreateIndex(this.loyaltyTransactions, { userId: 1, type: 1 })
      await safeCreateIndex(this.loyaltyTransactions, { type: 1, isExpired: 1, expiresAt: 1 })
      await safeCreateIndex(this.loyaltyProgramConfigs, { status: 1, version: -1 })
      await safeCreateIndex(this.loyaltyProgramConfigs, { version: 1 }, { unique: true })

      await ensureCriticalLoyaltyCouponIndexes(this.db)
      await verifyCriticalLoyaltyCouponIndexes(this.db)

      // Notifications collection indexes
      await safeCreateIndex(this.notifications, { userId: 1, isRead: 1, createdAt: -1 })
      await safeCreateIndex(this.notifications, { userId: 1, targetRole: 1, createdAt: -1 })
      await safeCreateIndex(this.notifications, { targetRole: 1, createdAt: -1 })
      await safeCreateIndex(
        this.notifications,
        { userId: 1, eventKey: 1 },
        { unique: true, partialFilterExpression: { eventKey: { $exists: true, $type: 'string' } } }
      )

      // Pharmacist chat indexes
      await safeCreateIndex(this.conversations, { type: 1, status: 1, pharmacistId: 1, lastMessageAt: 1 })
      await safeCreateIndex(this.conversations, { pharmacistId: 1, status: 1, lastMessageAt: -1 })
      await ensureActiveConversationUniqueIndex()
      await safeCreateIndex(this.messages, { conversationId: 1, createdAt: -1 })
      await safeCreateIndex(this.messages, { conversationId: 1, isRead: 1, senderId: 1 })
      await safeCreateIndex(this.db.collection('chatAuditLogs'), { conversationId: 1, createdAt: -1 })
      await safeCreateIndex(this.db.collection('chatAuditLogs'), { actorId: 1, action: 1, createdAt: -1 })
      await safeCreateIndex(this.patientPhiAuditLogs, { pharmacistId: 1, createdAt: -1 })
      await safeCreateIndex(this.patientPhiAuditLogs, { customerId: 1, createdAt: -1 })
      await safeCreateIndex(this.patientPhiAuditLogs, { action: 1, createdAt: -1 })

      // Community & Moderation indexes (MVP)
      await safeCreateIndex(this.communityRooms, { slug: 1 }, { unique: true })
      await safeCreateIndex(this.communityRooms, { visibility: 1, status: 1, createdAt: -1 })
      await safeCreateIndex(this.communityRooms, { status: 1, featured: -1, sortOrder: 1, createdAt: -1 })
      await safeCreateIndex(this.communityRooms, { diseaseKey: 1, status: 1, featured: -1 })

      await safeCreateIndex(this.communityThreads, { roomId: 1, status: 1, sticky: -1, lastReplyAt: -1 })
      await safeCreateIndex(this.communityThreads, { status: 1, lastReplyAt: -1 })
      await safeCreateIndex(this.communityThreads, { roomId: 1, prefix: 1, lastReplyAt: -1 })
      await safeCreateIndex(this.communityThreads, { authorId: 1, createdAt: -1 })
      await safeCreateIndex(this.communityThreads, { slug: 1 }, { unique: true })

      await safeCreateIndex(this.communityRoomMembers, { roomId: 1, userId: 1 }, { unique: true })
      await safeCreateIndex(this.communityRoomMembers, { roomId: 1, status: 1, updatedAt: -1 })
      await safeCreateIndex(this.communityRoomMembers, { userId: 1, status: 1, updatedAt: -1 })

      await safeCreateIndex(this.communityMessages, { roomId: 1, createdAt: -1 })
      await safeCreateIndex(this.communityMessages, { threadId: 1, createdAt: 1 })
      await safeCreateIndex(this.communityMessages, { threadId: 1, status: 1, createdAt: 1 })
      await safeCreateIndex(this.communityMessages, { senderId: 1, createdAt: -1 })
      await safeCreateIndex(this.communityMessages, { status: 1, createdAt: -1 })

      await safeCreateIndex(this.communityReactions, { messageId: 1, userId: 1 }, { unique: true })
      await safeCreateIndex(this.communityReactions, { messageId: 1, type: 1 })
      await safeCreateIndex(this.communityReactions, { userId: 1, createdAt: -1 })

      await safeCreateIndex(this.moderationFindings, { status: 1, createdAt: -1 })
      await safeCreateIndex(this.moderationFindings, { roomId: 1, status: 1, createdAt: -1 })
      await safeCreateIndex(this.moderationFindings, { messageId: 1 }, { unique: true })

      await safeCreateIndex(this.moderationReports, { messageId: 1, createdAt: -1 })
      await safeCreateIndex(this.moderationReports, { messageId: 1, reporterId: 1 }, { unique: true })
      await safeCreateIndex(this.moderationActions, { messageId: 1, createdAt: -1 })
      await safeCreateIndex(this.moderationAppeals, { status: 1, createdAt: -1 })
      await safeCreateIndex(this.moderationAppeals, { roomId: 1, userId: 1, status: 1, createdAt: -1 })
      await safeCreateIndex(this.moderationAiJobs, { status: 1, lockedUntil: 1, createdAt: 1 })
      await safeCreateIndex(this.moderationAiJobs, { messageId: 1, promptVersion: 1 }, { unique: true })

      await safeCreateIndex(this.communityVideoEvents, { roomId: 1, status: 1, scheduledStartAt: 1 })
      await safeCreateIndex(this.communityVideoEvents, { visibility: 1, status: 1, scheduledStartAt: 1 })
      await safeCreateIndex(this.communityVideoEvents, { hostIds: 1, scheduledStartAt: -1 })
      await safeCreateIndex(this.communityVideoEvents, {
        status: 1,
        scheduledStartAt: 1,
        'reminders.fifteenMinutesSentAt': 1
      })

      await safeCreateIndex(this.communityVideoEventRegistrations, { eventId: 1, userId: 1 }, { unique: true })
      await safeCreateIndex(this.communityVideoEventRegistrations, { userId: 1, status: 1, registeredAt: -1 })
      await safeCreateIndex(this.communityVideoEventRegistrations, { eventId: 1, status: 1, joinedAt: -1 })
      await safeCreateIndex(this.communityVideoEventRegistrations, { eventId: 1, reminder15mSentAt: 1 })
    } catch (error) {
      console.error('❌ MongoDB index creation/verification failed:', error)
      throw error
    }
  }
  get users(): Collection<User> {
    return this.db.collection(process.env.USERS_COLLECTION as string)
  }
  get refreshTokens(): Collection<RefreshToken> {
    return this.db.collection(process.env.DB_REFRESH_TOKENS_COLLECTION as string)
  }
  get categories(): Collection<Category> {
    return this.db.collection(process.env.DB_CATEGORIES_COLLECTION as string)
  }
  get brands(): Collection<Brand> {
    return this.db.collection(process.env.DB_BRANDS_COLLECTION as string)
  }
  get products(): Collection<Product> {
    return this.db.collection(process.env.DB_PRODUCTS_COLLECTION as string)
  }
  get productMedia(): Collection<ProductMedia> {
    return this.db.collection(process.env.DB_PRODUCT_MEDIA_COLLECTION as string)
  }
  get carts(): Collection<Cart> {
    return this.db.collection(process.env.DB_CARTS_COLLECTION as string)
  }
  get orders(): Collection<Order> {
    return this.db.collection(process.env.DB_ORDERS_COLLECTION as string)
  }
  get prescriptions(): Collection<Prescription> {
    return this.db.collection(process.env.DB_PRESCRIPTIONS_COLLECTION as string)
  }
  get patientMedicalInfos(): Collection<PatientMedicalInfo> {
    return this.db.collection(process.env.DB_PATIENT_MEDICAL_INFOS_COLLECTION as string)
  }
  get patientNotes(): Collection<PatientNote> {
    return this.db.collection(process.env.DB_PATIENT_NOTES_COLLECTION as string)
  }
  get reviews(): Collection<Review> {
    return this.db.collection(process.env.DB_REVIEWS_COLLECTION as string)
  }
  get productDetails(): Collection<ProductDetail> {
    return this.db.collection(process.env.DB_PRODUCT_DETAILS_COLLECTION as string)
  }
  get conversations(): Collection<Conversation> {
    return this.db.collection(process.env.DB_CONVERSATIONS_COLLECTION as string)
  }
  get messages(): Collection<Message> {
    return this.db.collection(process.env.DB_MESSAGES_COLLECTION as string)
  }
  get articles(): Collection<Article> {
    return this.db.collection(process.env.DB_ARTICLES_COLLECTION as string)
  }
  get articleJourneyEvents(): Collection {
    return this.db.collection(process.env.DB_ARTICLE_JOURNEY_EVENTS_COLLECTION || 'articleJourneyEvents')
  }
  get healthCategories(): Collection<HealthCategory> {
    return this.db.collection(process.env.DB_HEALTH_CATEGORIES_COLLECTION as string)
  }
  get returnRequests(): Collection<ReturnRequest> {
    return this.db.collection('return_requests')
  }
  get coupons(): Collection<Coupon> {
    return this.db.collection(process.env.DB_COUPONS_COLLECTION as string)
  }
  get couponRedemptions(): Collection<CouponRedemption> {
    return this.db.collection(process.env.DB_COUPON_REDEMPTIONS_COLLECTION as string)
  }
  get campaigns(): Collection<Campaign> {
    return this.db.collection(process.env.DB_CAMPAIGNS_COLLECTION as string)
  }
  get typesenseSyncState(): Collection {
    return this.db.collection('typesense_sync_state')
  }
  get loyaltyAccounts(): Collection<LoyaltyAccount> {
    return this.db.collection(process.env.DB_LOYALTY_ACCOUNTS_COLLECTION as string)
  }
  get loyaltyTransactions(): Collection<LoyaltyTransaction> {
    return this.db.collection(process.env.DB_LOYALTY_TRANSACTIONS_COLLECTION as string)
  }
  get loyaltyProgramConfigs(): Collection<LoyaltyProgramConfig> {
    return this.db.collection(process.env.DB_LOYALTY_PROGRAM_CONFIGS_COLLECTION || 'loyalty_program_configs')
  }
  get notifications(): Collection<Notification> {
    return this.db.collection('notifications')
  }

  get patientPhiAuditLogs(): Collection {
    return this.db.collection('patient_phi_audit_logs')
  }

  // ── Community / Moderation (MVP) ───────────────────────────────────────────
  get communityRooms(): Collection {
    return this.db.collection(process.env.DB_COMMUNITY_ROOMS_COLLECTION || 'communityRooms')
  }

  get communityThreads(): Collection {
    return this.db.collection(process.env.DB_COMMUNITY_THREADS_COLLECTION || 'communityThreads')
  }

  get communityRoomMembers(): Collection {
    return this.db.collection(process.env.DB_COMMUNITY_ROOM_MEMBERS_COLLECTION || 'communityRoomMembers')
  }

  get communityMessages(): Collection {
    return this.db.collection(process.env.DB_COMMUNITY_MESSAGES_COLLECTION || 'communityMessages')
  }

  get communityReactions(): Collection {
    return this.db.collection(process.env.DB_COMMUNITY_REACTIONS_COLLECTION || 'communityReactions')
  }

  get moderationFindings(): Collection {
    return this.db.collection(process.env.DB_MODERATION_FINDINGS_COLLECTION || 'moderationFindings')
  }

  get moderationReports(): Collection {
    return this.db.collection(process.env.DB_MODERATION_REPORTS_COLLECTION || 'moderationReports')
  }

  get moderationActions(): Collection {
    return this.db.collection(process.env.DB_MODERATION_ACTIONS_COLLECTION || 'moderationActions')
  }

  get moderationAppeals(): Collection {
    return this.db.collection(process.env.DB_MODERATION_APPEALS_COLLECTION || 'moderationAppeals')
  }

  get moderationAiJobs(): Collection {
    return this.db.collection(process.env.DB_MODERATION_AI_JOBS_COLLECTION || 'moderationAiJobs')
  }

  get communityVideoEvents(): Collection {
    return this.db.collection(process.env.DB_COMMUNITY_VIDEO_EVENTS_COLLECTION || 'communityVideoEvents')
  }

  get communityVideoEventRegistrations(): Collection {
    return this.db.collection(
      process.env.DB_COMMUNITY_VIDEO_EVENT_REGISTRATIONS_COLLECTION || 'communityVideoEventRegistrations'
    )
  }
}

//Tao Object tu Class DatabaseService
const databaseService = new DatabaseService()
export default databaseService
