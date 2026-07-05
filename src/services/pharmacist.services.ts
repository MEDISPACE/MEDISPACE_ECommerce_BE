import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import { PHARMACIST_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'
import PatientMedicalInfo from '~/models/schemas/PatientMedicalInfo.schema'
import PatientNote from '~/models/schemas/PatientNote.schema'
import { PrescriptionMedication } from '~/models/schemas/Prescription.schema'
import prescriptionsService from './prescriptions.services'
import { hashPassword } from '~/utils/crypto'
import { OrderStatus, PaymentMethod, PrescriptionStatus, ShippingMethod, UserRole, UserStatus } from '~/constants/enum'
import notificationService from './notifications.services'
import { getIO } from '~/sockets/chat.socket'
import orderService from './orders.services'
import { canAccessPatientPhi } from '~/middlewares/patientPhi.middlewares'
import ghnService from './ghn.services'
import paymentService from './payment.services'
import typesenseService from './typesense.services'
import cacheService from './cache.services'

const VIETNAM_TIMEZONE_OFFSET_MINUTES = 7 * 60
const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD || 30)
const DASHBOARD_STATS_CACHE_MS = Number(process.env.PHARMACIST_DASHBOARD_STATS_CACHE_MS || 30_000)
const DRUG_DATABASE_CACHE_TTL_SECONDS = Number(process.env.PHARMACIST_DRUG_DATABASE_CACHE_TTL_SECONDS || 60)
const ORDER_STATUSES = new Set(Object.values(OrderStatus))
const PAYMENT_STATUSES = new Set(['pending', 'paid', 'failed', 'refunded', 'partially_refunded'])
const IN_STORE_PAYMENT_METHODS = new Set<string>([
  PaymentMethod.Cash,
  PaymentMethod.CreditCard_POS,
  PaymentMethod.BankTransfer,
  PaymentMethod.PayOS,
  PaymentMethod.VNPay
])
const DELIVERY_PAYMENT_METHODS = new Set<string>([PaymentMethod.COD, PaymentMethod.BankTransfer, PaymentMethod.PayOS, PaymentMethod.VNPay])
const PAID_AT_COUNTER_METHODS = new Set<string>([PaymentMethod.Cash, PaymentMethod.CreditCard_POS])
const ONLINE_PAYMENT_METHODS = new Set<string>([PaymentMethod.PayOS, PaymentMethod.VNPay])

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const normalizeVietnamese = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()

const getVietnamDayRange = (date = new Date()) => {
  const vietnamTime = new Date(date.getTime() + VIETNAM_TIMEZONE_OFFSET_MINUTES * 60 * 1000)
  const startUtc = Date.UTC(vietnamTime.getUTCFullYear(), vietnamTime.getUTCMonth(), vietnamTime.getUTCDate())
  const startDate = new Date(startUtc - VIETNAM_TIMEZONE_OFFSET_MINUTES * 60 * 1000)
  const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000)
  return { startDate, endDate }
}

class PharmacistService {
  private dashboardStatsCache: { expiresAt: number; value: unknown } | null = null

  private async getCategoryAndDescendantIds(categoryIdOrSlug?: string): Promise<ObjectId[] | undefined> {
    if (!categoryIdOrSlug || categoryIdOrSlug === 'all') return undefined

    const targetCategory = ObjectId.isValid(categoryIdOrSlug)
      ? await databaseService.categories.findOne({ _id: new ObjectId(categoryIdOrSlug) })
      : await databaseService.categories.findOne({ slug: categoryIdOrSlug })

    if (!targetCategory?._id) return []

    let categoryPath = targetCategory.path || `/${targetCategory.slug}`
    if (!categoryPath.startsWith('/')) categoryPath = `/${categoryPath}`
    if (categoryPath === '/') categoryPath = `/${targetCategory.slug}`
    else if (!categoryPath.endsWith(`/${targetCategory.slug}`)) categoryPath = `${categoryPath}/${targetCategory.slug}`

    const escapedPath = escapeRegex(categoryPath)
    const descendants = await databaseService.categories
      .find({
        $or: [{ _id: targetCategory._id }, { path: { $regex: `^${escapedPath}(?:/|$)` } }]
      })
      .project({ _id: 1 })
      .toArray()

    return descendants.map((category) => category._id)
  }

  private getDrugDatabaseProductProjection() {
    const safePriceVariants = this.getSafePriceVariantsExpression()

    return {
      _id: 1,
      name: 1,
      slug: 1,
      sku: 1,
      barcode: 1,
      shortDescription: 1,
      categoryId: 1,
      brandId: 1,
      priceVariants: {
        $map: {
          input: safePriceVariants,
          as: 'variant',
          in: {
            unit: '$$variant.unit',
            price: '$$variant.price',
            originalPrice: '$$variant.originalPrice',
            salePrice: '$$variant.salePrice',
            discountPercent: '$$variant.discountPercent',
            isDefault: { $ifNull: ['$$variant.isDefault', false] },
            quantityPerUnit: '$$variant.quantityPerUnit'
          }
        }
      },
      stockQuantity: 1,
      maxOrderQuantity: 1,
      status: 1,
      isActive: 1,
      requiresPrescription: 1,
      featuredImage: 1,
      rating: 1,
      reviewCount: 1,
      createdAt: 1,
      updatedAt: 1,
      category: 1,
      brand: 1,
      details: 1,
      media: 1,
      warnings: 1,
      packaging: 1,
      calculatedPrice: 1
    }
  }

  private getSafePriceVariantsExpression() {
    return {
      $cond: [{ $isArray: '$priceVariants' }, '$priceVariants', []]
    }
  }

  private getCalculatedPriceStage() {
    const safePriceVariants = this.getSafePriceVariantsExpression()

    return {
      $addFields: {
        calculatedPrice: {
          $let: {
            vars: {
              defaultVariant: {
                $ifNull: [
                  { $arrayElemAt: [{ $filter: { input: safePriceVariants, cond: { $eq: ['$$this.isDefault', true] } } }, 0] },
                  { $arrayElemAt: [safePriceVariants, 0] }
                ]
              }
            },
            in: { $ifNull: ['$$defaultVariant.price', 0] }
          }
        }
      }
    }
  }

  private getDrugDatabaseLookupStages() {
    return [
      {
        $lookup: {
          from: 'categories',
          localField: 'categoryId',
          foreignField: '_id',
          as: 'category',
          pipeline: [{ $project: { _id: 1, name: 1, slug: 1, path: 1 } }]
        }
      },
      {
        $lookup: {
          from: 'brands',
          localField: 'brandId',
          foreignField: '_id',
          as: 'brand',
          pipeline: [{ $project: { _id: 1, name: 1, slug: 1, logo: 1 } }]
        }
      },
      {
        $lookup: {
          from: 'productDetails',
          localField: '_id',
          foreignField: 'productId',
          as: 'details'
        }
      },
      {
        $lookup: {
          from: 'productMedia',
          localField: '_id',
          foreignField: 'productId',
          as: 'media'
        }
      }
    ]
  }

  private getDrugDatabaseListLookupStages() {
    return [
      {
        $lookup: {
          from: 'categories',
          localField: 'categoryId',
          foreignField: '_id',
          as: 'category',
          pipeline: [{ $project: { _id: 1, name: 1, slug: 1, path: 1 } }]
        }
      },
      {
        $lookup: {
          from: 'brands',
          localField: 'brandId',
          foreignField: '_id',
          as: 'brand',
          pipeline: [{ $project: { _id: 1, name: 1, slug: 1, logo: 1 } }]
        }
      }
    ]
  }

  private getDrugDatabaseHydrationStage() {
    return {
      $addFields: {
        category: { $arrayElemAt: ['$category', 0] },
        brand: { $arrayElemAt: ['$brand', 0] },
        details: { $arrayElemAt: ['$details', 0] },
        media: { $arrayElemAt: ['$media', 0] }
      }
    }
  }

  private mapDrugDatabaseProduct(product: any) {
    const details = product.details || {}
    const priceVariants = Array.isArray(product.priceVariants) ? product.priceVariants : []
    const requiredClinicalFields = [
      'activeIngredients',
      'dosageForm',
      'packSize',
      'manufacturer',
      'indications',
      'dosageInstructions',
      'storageInstructions'
    ]
    const missingClinicalFields = requiredClinicalFields.filter((field) => !String(details[field] || '').trim())
    const activeIngredientText = String(details.activeIngredients || product.activeIngredients || '')

    return {
      ...product,
      priceVariants,
      stockQuantity: product.stockQuantity || 0,
      maxOrderQuantity: product.maxOrderQuantity || 0,
      details: product.details || null,
      media: product.media || null,
      lastCheckedAt: new Date(),
      dataQuality: {
        completenessPercent: Math.round(((requiredClinicalFields.length - missingClinicalFields.length) / requiredClinicalFields.length) * 100),
        missingClinicalFields,
        hasStructuredActiveIngredients: false,
        activeIngredientSource: activeIngredientText ? 'free_text' : 'missing',
        clinicalReferenceReady: missingClinicalFields.length === 0 && Boolean(activeIngredientText)
      }
    }
  }

  private mapTypesenseDrugDatabaseHit(hit: any) {
    const doc = hit?.document || {}
    let priceVariants: any[] = []
    if (typeof doc.priceVariantsJson === 'string' && doc.priceVariantsJson) {
      try {
        const parsed = JSON.parse(doc.priceVariantsJson)
        priceVariants = Array.isArray(parsed) ? parsed : []
      } catch {
        priceVariants = []
      }
    }

    const details = {
      activeIngredients: doc.activeIngredients || '',
      indications: doc.indications || '',
      manufacturer: doc.manufacturer || '',
      dosageForm: doc.dosageForm || '',
      strength: doc.strength || '',
      packSize: doc.packSize || '',
      dosageInstructions: doc.dosageInstructions || '',
      storageInstructions: doc.storageInstructions || ''
    }

    return this.mapDrugDatabaseProduct({
      _id: doc.mongoId,
      name: doc.name || '',
      slug: doc.slug || '',
      sku: doc.sku || '',
      barcode: doc.barcode || '',
      shortDescription: doc.shortDescription || '',
      categoryId: doc.categoryId || '',
      brandId: doc.brandId || '',
      priceVariants,
      stockQuantity: doc.stockQuantity || 0,
      maxOrderQuantity: doc.maxOrderQuantity || 0,
      status: doc.isActive === false ? 'inactive' : 'active',
      isActive: doc.isActive !== false,
      requiresPrescription: Boolean(doc.requiresPrescription),
      featuredImage: doc.featuredImage || '',
      rating: doc.rating || 0,
      reviewCount: doc.reviewCount || 0,
      createdAt: doc.createdAt ? new Date(doc.createdAt) : undefined,
      category: doc.categoryId || doc.categoryName ? { _id: doc.categoryId || '', name: doc.categoryName || '', slug: '' } : null,
      brand: doc.brandId || doc.brandName ? { _id: doc.brandId || '', name: doc.brandName || '', slug: '' } : null,
      details,
      media: doc.featuredImage ? { url: doc.featuredImage, isPrimary: true } : null,
      calculatedPrice: doc.price || 0
    })
  }

  private buildDrugDatabasePipeline(match: Record<string, unknown>, searchRegex?: string, sort: Record<string, 1 | -1> = { name: 1 }) {
    return [
      { $match: match },
      this.getCalculatedPriceStage(),
      ...this.getDrugDatabaseLookupStages(),
      this.getDrugDatabaseHydrationStage(),
      ...(searchRegex
        ? [
            {
              $match: {
                $or: [
                  { name: { $regex: searchRegex, $options: 'i' } },
                  { shortDescription: { $regex: searchRegex, $options: 'i' } },
                  { sku: { $regex: searchRegex, $options: 'i' } },
                  { barcode: { $regex: searchRegex, $options: 'i' } },
                  { 'category.name': { $regex: searchRegex, $options: 'i' } },
                  { 'brand.name': { $regex: searchRegex, $options: 'i' } },
                  { 'details.activeIngredients': { $regex: searchRegex, $options: 'i' } },
                  { 'details.indications': { $regex: searchRegex, $options: 'i' } },
                  { 'details.manufacturer': { $regex: searchRegex, $options: 'i' } },
                  { 'details.dosageForm': { $regex: searchRegex, $options: 'i' } },
                  { 'details.strength': { $regex: searchRegex, $options: 'i' } }
                ]
              }
            }
          ]
        : []),
      { $sort: sort },
      { $project: this.getDrugDatabaseProductProjection() }
    ]
  }

  private buildDrugDatabaseListPipeline(
    match: Record<string, unknown>,
    sort: Record<string, 1 | -1>,
    skip: number,
    limit: number,
    needsCalculatedPrice = false
  ) {
    return [
      { $match: match },
      ...(needsCalculatedPrice ? [this.getCalculatedPriceStage()] : []),
      { $sort: sort },
      { $skip: skip },
      { $limit: limit },
      ...this.getDrugDatabaseListLookupStages(),
      this.getDrugDatabaseHydrationStage(),
      { $project: this.getDrugDatabaseProductProjection() }
    ]
  }

  private buildPharmacistSnapshot(pharmacist: any) {
    if (!pharmacist?._id) return undefined
    const firstName = pharmacist.firstName || ''
    const lastName = pharmacist.lastName || ''
    const fullName = `${firstName} ${lastName}`.trim()
    return {
      _id: pharmacist._id,
      firstName: pharmacist.firstName,
      lastName: pharmacist.lastName,
      fullName,
      email: pharmacist.email,
      phoneNumber: pharmacist.phoneNumber,
      avatar: pharmacist.avatar,
      lisenseNumber: pharmacist.lisenseNumber,
      licenseNumber: pharmacist.lisenseNumber
    }
  }

  private async getPharmacistSnapshot(pharmacistId: ObjectId) {
    const pharmacist = await databaseService.users.findOne(
      { _id: pharmacistId, role: UserRole.Pharmacist },
      { projection: { _id: 1, firstName: 1, lastName: 1, email: 1, phoneNumber: 1, avatar: 1, lisenseNumber: 1 } }
    )
    const snapshot = this.buildPharmacistSnapshot(pharmacist)
    if (!snapshot) {
      throw new ErrorWithStatus({ message: PHARMACIST_MESSAGES.PHARMACIST_NOT_FOUND, status: HTTP_STATUS.NOT_FOUND })
    }
    return snapshot
  }

  private assertValidPharmacistOrderMethod(deliveryMethod: string, paymentMethod: string) {
    if (!deliveryMethod || typeof deliveryMethod !== 'string') {
      throw new ErrorWithStatus({ message: 'Delivery method is required', status: HTTP_STATUS.BAD_REQUEST })
    }

    if (!Object.values(PaymentMethod).includes(paymentMethod as PaymentMethod)) {
      throw new ErrorWithStatus({ message: 'Invalid payment method', status: HTTP_STATUS.BAD_REQUEST })
    }

    const isInstore = deliveryMethod === ShippingMethod.InStore
    const isDelivery = !isInstore

    if (isInstore && !IN_STORE_PAYMENT_METHODS.has(paymentMethod)) {
      throw new ErrorWithStatus({ message: 'Payment method is not allowed for in-store orders', status: HTTP_STATUS.BAD_REQUEST })
    }

    if (isDelivery) {
      const validDeliveryMethod =
        [ShippingMethod.Standard, ShippingMethod.Fast, ShippingMethod.Express].includes(deliveryMethod as ShippingMethod) ||
        /^ghn:\d+$/.test(deliveryMethod)
      if (!validDeliveryMethod) {
        throw new ErrorWithStatus({ message: 'Invalid delivery method', status: HTTP_STATUS.BAD_REQUEST })
      }
      if (!DELIVERY_PAYMENT_METHODS.has(paymentMethod)) {
        throw new ErrorWithStatus({ message: 'Payment method is not allowed for delivery orders', status: HTTP_STATUS.BAD_REQUEST })
      }
    }
  }

  private validateShippingAddressForDelivery(shippingAddress: any) {
    if (!shippingAddress?.address || !shippingAddress?.province || !shippingAddress?.district || !shippingAddress?.ward) {
      throw new ErrorWithStatus({ message: 'Complete delivery address is required', status: HTTP_STATUS.BAD_REQUEST })
    }
    if (!Number.isFinite(Number(shippingAddress.districtId)) || !shippingAddress.wardCode) {
      throw new ErrorWithStatus({ message: 'GHN district and ward are required for delivery orders', status: HTTP_STATUS.BAD_REQUEST })
    }
  }

  private estimatePackageWeight(stockDeductions: Array<{ quantity: number }>) {
    void stockDeductions
    return 1000
  }

  private async calculatePharmacistShippingFee(deliveryMethod: string, shippingAddress: any, stockDeductions: Array<{ quantity: number }>) {
    if (deliveryMethod === ShippingMethod.InStore) return 0

    this.validateShippingAddressForDelivery(shippingAddress)

    if (deliveryMethod.startsWith('ghn:')) {
      const serviceId = Number(deliveryMethod.split(':')[1])
      if (!Number.isFinite(serviceId) || serviceId <= 0) {
        throw new ErrorWithStatus({ message: 'Invalid GHN service selected', status: HTTP_STATUS.BAD_REQUEST })
      }

      const fee = await ghnService.calculateFee({
        to_district_id: Number(shippingAddress.districtId),
        to_ward_code: shippingAddress.wardCode,
        weight: this.estimatePackageWeight(stockDeductions),
        service_id: serviceId
      })
      const total = Number(fee?.total)
      if (!Number.isFinite(total) || total < 0) {
        throw new ErrorWithStatus({ message: 'Unable to calculate GHN shipping fee', status: HTTP_STATUS.BAD_REQUEST })
      }
      return total
    }

    const deliveryFees: Record<string, number> = {
      [ShippingMethod.Standard]: 0,
      [ShippingMethod.Fast]: 15000,
      [ShippingMethod.Express]: 25000
    }
    return deliveryFees[deliveryMethod] ?? 0
  }

  // Get dashboard statistics
  async getDashboardStats() {
    if (this.dashboardStatsCache && this.dashboardStatsCache.expiresAt > Date.now()) {
      return this.dashboardStatsCache.value
    }

    const { startDate, endDate } = getVietnamDayRange()

    const [
      prescriptionStats,
      totalPrescriptionsToday,
      verifiedPrescriptionsToday,
      rejectedPrescriptionsToday,
      ordersToday,
      totalRevenue,
      activeChats
    ] = await Promise.all([
      // Get prescription stats from prescriptions service (using lowercase status)
      prescriptionsService.getPrescriptionStats(),

      // Count total prescriptions today
      databaseService.prescriptions.countDocuments({
        createdAt: { $gte: startDate, $lt: endDate }
      }),

      // Count verified prescriptions today
      databaseService.prescriptions.countDocuments({
        status: PrescriptionStatus.Verified,
        verifiedAt: { $gte: startDate, $lt: endDate }
      }),

      // Count rejected prescriptions today
      databaseService.prescriptions.countDocuments({
        status: PrescriptionStatus.Rejected,
        verifiedAt: { $gte: startDate, $lt: endDate }
      }),

      // Count orders today
      databaseService.orders.countDocuments({
        createdAt: { $gte: startDate, $lt: endDate }
      }),

      // Calculate total revenue today
      databaseService.orders
        .aggregate([
          {
            $match: {
              createdAt: { $gte: startDate, $lt: endDate },
              orderStatus: { $in: [OrderStatus.Confirmed, OrderStatus.Shipped, OrderStatus.Delivered] },
              paymentStatus: 'paid'
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$totalAmount' }
            }
          }
        ])
        .toArray(),

      databaseService.conversations.countDocuments({
        type: 'pharmacist',
        status: 'active'
      })
    ])

    const value = {
      pendingPrescriptions: prescriptionStats.pending,
      prescriptionsToday: {
        total: totalPrescriptionsToday,
        verified: verifiedPrescriptionsToday,
        rejected: rejectedPrescriptionsToday
      },
      ordersToday,
      totalRevenue: totalRevenue[0]?.total || 0,
      activeChats
    }

    this.dashboardStatsCache = { value, expiresAt: Date.now() + DASHBOARD_STATS_CACHE_MS }
    return value
  }

  // Get recent prescriptions
  async getRecentPrescriptions(limit = 5) {
    const prescriptions = await databaseService.prescriptions
      .find({ status: 'pending' })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray()

    return prescriptions
  }

  // Get recent orders
  async getRecentOrders(limit = 5) {
    const orders = await databaseService.orders.find({}).sort({ createdAt: -1 }).limit(limit).toArray()

    return orders
  }

  // Search patients by phone or partial name
  async searchPatients(searchQuery: string, pharmacistId?: ObjectId) {
    if (!searchQuery) return []

    const safeSearch = escapeRegex(searchQuery.trim())
    const users = await databaseService.users
      .find({
        role: UserRole.Customer,
        $or: [
          { phoneNumber: { $regex: `^${safeSearch}`, $options: 'i' } },
          { firstName: { $regex: `^${safeSearch}`, $options: 'i' } },
          { lastName: { $regex: `^${safeSearch}`, $options: 'i' } }
        ]
      })
      .limit(10)
      .toArray()

    if (!pharmacistId) return []
    const scopedUsers = []
    for (const user of users) {
      if (user._id && (await canAccessPatientPhi(pharmacistId, user._id))) {
        scopedUsers.push(user)
      }
    }

    return scopedUsers
  }

  // Get patient history
  async getPatientHistory(customerId: string) {
    const customerObjectId = new ObjectId(customerId)

    const [prescriptions, orders] = await Promise.all([
      databaseService.prescriptions.find({ customerId: customerObjectId }).sort({ createdAt: -1 }).toArray(),
      databaseService.orders.find({ userId: customerObjectId }).sort({ createdAt: -1 }).toArray()
    ])

    return {
      prescriptions,
      orders,
      totalOrders: orders.length,
      totalSpent: orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0)
    }
  }

  // Get pharmacist profile
  async getPharmacistProfile(pharmacistId: ObjectId) {
    const pharmacist = await databaseService.users.findOne({
      _id: pharmacistId
    })

    if (!pharmacist) {
      throw new ErrorWithStatus({
        message: PHARMACIST_MESSAGES.PHARMACIST_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    return {
      _id: pharmacist._id,
      email: pharmacist.email,
      firstName: pharmacist.firstName,
      lastName: pharmacist.lastName,
      phoneNumber: pharmacist.phoneNumber,
      dateOfBirth: pharmacist.dateOfBirth,
      gender: pharmacist.gender,
      avatar: pharmacist.avatar,
      lisenseNumber: pharmacist.lisenseNumber,
      role: pharmacist.role,
      status: pharmacist.status,
      isOnline: pharmacist.isOnline,
      createdAt: pharmacist.createdAt,
      updatedAt: pharmacist.updatedAt
    }
  }

  async getDrugDatabaseProducts(query: {
    page?: number
    limit?: number
    search?: string
    categoryId?: string
    type?: string
    stock?: string
    activeStatus?: string
    status?: string
    sortBy?: string
    sortOrder?: string
  }) {
    const page = Number.isFinite(query.page) && Number(query.page) > 0 ? Number(query.page) : 1
    const limit = Math.min(Math.max(Number.isFinite(query.limit) && Number(query.limit) > 0 ? Number(query.limit) : 24, 1), 100)
    const skip = (page - 1) * limit
    const search = query.search?.trim()
    const categoryIds = await this.getCategoryAndDescendantIds(query.categoryId)

    const match: Record<string, unknown> = {}
    const activeStatus = query.activeStatus || 'active'
    if (activeStatus === 'active') match.isActive = true
    else if (activeStatus === 'inactive') match.isActive = false

    if (query.status && query.status !== 'all') match.status = query.status
    if (query.type === 'Rx') match.requiresPrescription = true
    if (query.type === 'OTC') match.requiresPrescription = false
    if (categoryIds) match.categoryId = categoryIds.length > 0 ? { $in: categoryIds } : null

    if (query.stock === 'inStock') match.stockQuantity = { $gt: 0 }
    else if (query.stock === 'lowStock') match.stockQuantity = { $gt: 0, $lte: LOW_STOCK_THRESHOLD }
    else if (query.stock === 'outOfStock') match.stockQuantity = { $lte: 0 }

    const sortOrder: 1 | -1 = query.sortOrder === 'desc' ? -1 : 1
    const sortBy = query.sortBy || 'name'
    const sortField = sortBy === 'price' ? 'calculatedPrice' : ['name', 'stockQuantity', 'createdAt', 'updatedAt', 'rating'].includes(sortBy) ? sortBy : 'name'
    const sort: Record<string, 1 | -1> = { [sortField]: sortOrder, _id: 1 }

    const cacheKey = `pharmacist:drug-database:products:${cacheService.hashQuery({
      page,
      limit,
      search: search || '',
      categoryId: query.categoryId || 'all',
      categoryIds: categoryIds?.map((id) => id.toString()).sort() || [],
      type: query.type || 'all',
      stock: query.stock || 'all',
      activeStatus,
      status: query.status || 'all',
      sortBy,
      sortOrder
    })}`

    return cacheService.getOrSet(cacheKey, async () => {

      const canUseTypesense =
        Boolean(search) &&
        typesenseService.getAvailability() &&
        activeStatus === 'active' &&
        query.stock !== 'outOfStock' &&
        (!query.status || query.status === 'all' || query.status === 'active')

      if (canUseTypesense) {
        const tsSortBy =
          sortBy === 'price'
            ? sortOrder === -1
              ? 'price_desc'
              : 'price_asc'
            : sortBy === 'createdAt'
              ? 'newest'
              : sortBy === 'rating'
                ? 'rating'
                : undefined
        const tsResult = await typesenseService.searchProducts({
          q: search as string,
          page,
          limit,
          categoryIds: categoryIds?.map((id) => id.toString()),
          requiresPrescription: query.type === 'Rx' ? true : query.type === 'OTC' ? false : undefined,
          inStock: query.stock === 'inStock' || query.stock === 'lowStock',
          sortBy: tsSortBy,
          includeDrugDatabaseFields: true
        })

        if (tsResult?.hits) {
          return {
            products: tsResult.hits.map((hit: any) => this.mapTypesenseDrugDatabaseHit(hit)),
            pagination: {
              page,
              limit,
              totalPages: Math.ceil((tsResult.found || tsResult.hits.length) / limit),
              totalCount: tsResult.found || tsResult.hits.length
            },
            lowStockThreshold: LOW_STOCK_THRESHOLD,
            searchSource: 'typesense',
            lastCheckedAt: new Date()
          }
        }
      }

      const searchRegex = search ? escapeRegex(search) : undefined
      const listLimit = searchRegex ? limit : limit + 1
      const pipeline = searchRegex
        ? this.buildDrugDatabasePipeline(match, searchRegex, sort)
        : this.buildDrugDatabaseListPipeline(match, sort, skip, listLimit, sortField === 'calculatedPrice')
      const collation = { locale: 'vi', strength: 1 }
      const products = searchRegex
        ? await databaseService.products.aggregate([...pipeline, { $skip: skip }, { $limit: limit }], { collation }).toArray()
        : await databaseService.products.aggregate(pipeline, { collation }).toArray()
      const hasNextPage = !searchRegex && products.length > limit
      const pageProducts = hasNextPage ? products.slice(0, limit) : products
      const totalCount = searchRegex
        ? await databaseService.products
            .aggregate([...pipeline.slice(0, -2), { $count: 'total' }], { collation })
            .toArray()
            .then((countResult) => countResult[0]?.total || 0)
        : skip + pageProducts.length + (hasNextPage ? 1 : 0)

      return {
        products: pageProducts.map((product) => this.mapDrugDatabaseProduct(product)),
        pagination: {
          page,
          limit,
          totalPages: searchRegex ? Math.ceil(totalCount / limit) : page + (hasNextPage ? 1 : 0),
          totalCount
        },
        lowStockThreshold: LOW_STOCK_THRESHOLD,
        searchSource: search ? 'mongo' : 'mongo',
        lastCheckedAt: new Date(),
        normalizedSearch: search ? normalizeVietnamese(search) : undefined
      }
    }, DRUG_DATABASE_CACHE_TTL_SECONDS)
  }

  async getDrugDatabaseProduct(productId: string) {
    const cacheKey = `pharmacist:drug-database:product:${productId}`
    return cacheService.getOrSet(cacheKey, async () => {
      const match = ObjectId.isValid(productId) ? { _id: new ObjectId(productId) } : { slug: productId }
      const products = await databaseService.products.aggregate(this.buildDrugDatabasePipeline(match, undefined, { _id: 1 })).toArray()
      if (!products.length) {
        throw new ErrorWithStatus({ message: 'Product not found', status: HTTP_STATUS.NOT_FOUND })
      }
      return this.mapDrugDatabaseProduct(products[0])
    }, DRUG_DATABASE_CACHE_TTL_SECONDS)
  }

  // ========== PATIENT MEDICAL INFO METHODS ==========

  // Get patient medical information
  async getMedicalInfo(customerId: string) {
    const customerObjectId = new ObjectId(customerId)

    const medicalInfo = await databaseService.patientMedicalInfos.findOne({
      customer_id: customerObjectId
    })

    // Create default medical info if doesn't exist
    if (!medicalInfo) {
      const newMedicalInfo = new PatientMedicalInfo({
        customer_id: customerObjectId,
        allergies: [],
        chronic_diseases: [],
        current_medications: []
      })
      const result = await databaseService.patientMedicalInfos.insertOne(newMedicalInfo)
      return this.mapMedicalInfo({ ...newMedicalInfo, _id: result.insertedId })
    }

    return this.mapMedicalInfo(medicalInfo)
  }

  private mapMedicalInfo(medicalInfo: any) {
    return {
      _id: medicalInfo._id,
      customerId: medicalInfo.customer_id,
      bloodType: medicalInfo.blood_type || '',
      allergies: medicalInfo.allergies || [],
      chronicDiseases: medicalInfo.chronic_diseases || [],
      currentMedications: (medicalInfo.current_medications || []).map((medication: any) => ({
        name: medication.drug_name,
        dosage: medication.dosage,
        frequency: medication.frequency,
        startDate: medication.start_date,
        endDate: medication.end_date
      })),
      createdAt: medicalInfo.created_at,
      updatedAt: medicalInfo.updated_at
    }
  }

  // Update patient medical information
  async updateMedicalInfo(
    customerId: string,
    data: { blood_type?: string; allergies?: string[]; chronic_diseases?: string[] }
  ) {
    const customerObjectId = new ObjectId(customerId)

    const result = await databaseService.patientMedicalInfos.findOneAndUpdate(
      { customer_id: customerObjectId },
      {
        $set: {
          ...data,
          updated_at: new Date()
        }
      },
      { returnDocument: 'after', upsert: true }
    )

    return result ? this.mapMedicalInfo(result) : result
  }

  // Add allergy to patient
  async addAllergy(customerId: string, allergy: string) {
    const customerObjectId = new ObjectId(customerId)

    const result = await databaseService.patientMedicalInfos.findOneAndUpdate(
      { customer_id: customerObjectId },
      {
        $addToSet: { allergies: allergy },
        $set: { updated_at: new Date() }
      },
      { returnDocument: 'after', upsert: true }
    )

    return result ? this.mapMedicalInfo(result) : result
  }

  // ========== PATIENT NOTES METHODS ==========

  // Create a note for a patient
  async createPatientNote(
    customerId: string,
    pharmacistId: ObjectId,
    noteData: {
      note_type: 'consultation' | 'prescription_verification' | 'general'
      content: string
      related_prescription_id?: string
    }
  ) {
    const customerObjectId = new ObjectId(customerId)

    const newNote = new PatientNote({
      customer_id: customerObjectId,
      pharmacist_id: pharmacistId,
      note_type: noteData.note_type,
      content: noteData.content,
      related_prescription_id: noteData.related_prescription_id
        ? new ObjectId(noteData.related_prescription_id)
        : undefined
    })

    await databaseService.patientNotes.insertOne(newNote)
    return newNote
  }

  // Get all notes for a patient
  async getPatientNotes(customerId: string) {
    const customerObjectId = new ObjectId(customerId)

    const notes = await databaseService.patientNotes
      .find({ customer_id: customerObjectId })
      .sort({ created_at: -1 })
      .toArray()

    return notes
  }

  // ========== MEDICATION TRACKING METHODS ==========

  // Get recent medications from prescriptions
  async getRecentMedications(customerId: string, daysBack = 30) {
    const customerObjectId = new ObjectId(customerId)
    const dateLimit = new Date()
    dateLimit.setDate(dateLimit.getDate() - daysBack)

    const prescriptions = await databaseService.prescriptions
      .find({
        customerId: customerObjectId,
        status: 'verified',
        verifiedAt: { $gte: dateLimit }
      })
      .sort({ verifiedAt: -1 })
      .toArray()

    const medications = prescriptions.flatMap((prescription) => {
      return (prescription.medications || []).map((drug: PrescriptionMedication) => ({
        drug_name: drug.productName,
        dosage: drug.dosage,
        quantity: drug.quantity,
        instructions: drug.instructions,
        prescribed_date: prescription.verifiedAt,
        prescription_id: prescription._id
      }))
    })

    return medications
  }

  // Safety gate only. This deliberately never declares a combination safe.
  async checkDrugInteractions(customerId: string, newDrugName: string) {
    // Get patient's current medications
    const [medicalInfo, recentMedications] = await Promise.all([
      this.getMedicalInfo(customerId),
      this.getRecentMedications(customerId, 90)
    ])

    // Check against allergies
    const allergyWarnings = (medicalInfo?.allergies || [])
      .filter((allergy: string) => newDrugName.toLowerCase().includes(allergy.toLowerCase()))
      .map((allergy: string) => ({
        type: 'allergy',
        severity: 'high',
        message: `Patient is allergic to ${allergy}`
      }))

    // Get current drug names
    const currentDrugs = recentMedications.map((med) => med.drug_name)

    // TODO: Implement actual drug interaction checking with drug database
    // For now, return simple format
    return {
      has_interactions: allergyWarnings.length > 0,
      warnings: allergyWarnings,
      current_medications: currentDrugs,
      recommendation:
        allergyWarnings.length > 0
          ? 'DO NOT DISPENSE - Check with doctor'
          : 'NOT_EVALUATED - No validated interaction database is configured',
      evaluation_status: allergyWarnings.length > 0 ? 'blocked' : 'not_evaluated',
      requires_independent_review: true
    }
  }

  // ========== ORDER MANAGEMENT METHODS ==========

  // Create order for pharmacist (direct order creation without cart)
  async createPharmacistOrder(
    pharmacistId: ObjectId,
    orderData: {
      customerId?: string
      prescriptionId?: string
      items: Array<{
        productId: string
        quantity: number
        unit?: string
        notes?: string
      }>
      shippingAddress: {
        firstName: string
        lastName: string
        phone: string
        email: string
        address: string
        ward: string
        district: string
        province: string
        provinceId?: number
        districtId?: number
        wardCode?: string
      }
      deliveryMethod: string
      paymentMethod: string
      orderNotes?: string
      pharmacistNotes?: string
      idempotencyKey?: string
      safetyReviewConfirmed?: boolean
      req?: any
    }
  ) {
    // Validate items
    if (!orderData.items || orderData.items.length === 0) {
      throw new ErrorWithStatus({
        message: 'Order must have at least one item',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    this.assertValidPharmacistOrderMethod(orderData.deliveryMethod, orderData.paymentMethod)

    const prescription = await this.validatePrescriptionForPharmacistOrder(orderData.prescriptionId, orderData.items)

    // Fetch product details and calculate prices
    const orderItems = []
    let subtotal = 0
    const stockDeductions: Array<{ productId: ObjectId; quantity: number; productName: string }> = []

    for (const item of orderData.items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new ErrorWithStatus({ message: 'Order item quantity must be a positive integer', status: HTTP_STATUS.BAD_REQUEST })
      }

      if (!ObjectId.isValid(item.productId)) {
        throw new ErrorWithStatus({
          message: `Invalid product ID: ${item.productId}`,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }

      const product = await databaseService.products.findOne({ _id: new ObjectId(item.productId) })

      if (!product) {
        throw new ErrorWithStatus({
          message: `Product not found: ${item.productId}`,
          status: HTTP_STATUS.NOT_FOUND
        })
      }

      if (product.requiresPrescription && !verifiedPrescription) {
        throw new ErrorWithStatus({
          message: `Verified prescription is required for product: ${product.name}`,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }

      // Check stock with unit conversion
      const variant =
        product.priceVariants?.find((v: any) => v.unit === item.unit) ||
        product.priceVariants?.find((v: any) => v.isDefault) ||
        product.priceVariants?.[0]
      const unitPrice = variant?.price || 0
      if (!variant || !Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new ErrorWithStatus({ message: `Invalid price variant for product: ${product.name}`, status: HTTP_STATUS.BAD_REQUEST })
      }
      const quantityPerUnit = Number(variant?.quantityPerUnit ?? 1)
      if (!Number.isFinite(quantityPerUnit) || quantityPerUnit <= 0) {
        throw new ErrorWithStatus({ message: `Invalid stock unit conversion for product: ${product.name}`, status: HTTP_STATUS.BAD_REQUEST })
      }
      const requiredStock = item.quantity * quantityPerUnit

      if (product.stockQuantity < requiredStock) {
        throw new ErrorWithStatus({
          message: `Insufficient stock for product: ${product.name}`,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }

      stockDeductions.push({ productId: product._id!, quantity: requiredStock, productName: product.name })

      const totalPrice = unitPrice * item.quantity
      subtotal += totalPrice

      orderItems.push({
        productId: new ObjectId(item.productId),
        name: product.name,
        sku: product.sku || '',
        quantity: item.quantity,
        unitPrice: unitPrice,
        totalPrice,
        prescriptionRequired: product.requiresPrescription || false,
        image: product.featuredImage || '',
        unit: item.unit || variant?.unit
      })
    }

    const requiresSafetyReview = orderItems.length > 1 || orderItems.some((item) => item.prescriptionRequired)
    if (requiresSafetyReview && orderData.safetyReviewConfirmed !== true) {
      throw new ErrorWithStatus({
        message: 'Pharmacist safety review confirmation is required before creating this order',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const shippingFee = await this.calculatePharmacistShippingFee(orderData.deliveryMethod, orderData.shippingAddress, stockDeductions)

    // Prices already include VAT, so pharmacist-created orders do not add VAT again.
    const taxAmount = 0
    const discountAmount = 0 // No discount for now
    const totalAmount = subtotal + shippingFee - discountAmount

    // Generate order number
    const orderNumber = await this.generateUniquePharmacistOrderNumber()

    // Find customer. customerId is currently supplied as phone/search value from the POS UI.
    const customer = orderData.customerId ? await this.findUniqueCustomerByPhone(orderData.customerId) : null
    if (prescription && !prescription.customerId) {
      throw new ErrorWithStatus({ message: 'Prescription is not linked to a customer account', status: HTTP_STATUS.BAD_REQUEST })
    }
    if (prescription && customer && prescription.customerId.toString() !== customer._id?.toString()) {
      throw new ErrorWithStatus({
        message: 'Prescription does not belong to the selected customer',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const guestCustomer = !prescription && !customer ? await this.createGuestCustomerForPharmacistOrder(orderNumber, orderData.shippingAddress, pharmacistId) : null
    const userId = prescription?.customerId || customer?._id || guestCustomer?._id
    if (!userId) {
      throw new ErrorWithStatus({ message: 'Unable to resolve customer for pharmacist order', status: HTTP_STATUS.BAD_REQUEST })
    }

    const isInstore = orderData.deliveryMethod === ShippingMethod.InStore
    const isPaidAtCounter = isInstore && PAID_AT_COUNTER_METHODS.has(orderData.paymentMethod)
    const orderStatus = isInstore ? (isPaidAtCounter ? OrderStatus.Delivered : OrderStatus.Confirmed) : OrderStatus.Pending
    const pharmacistInfo = await this.getPharmacistSnapshot(pharmacistId)

    // Create order document
    const order = {
      _id: new ObjectId(),
      userId,
      orderNumber,
      items: orderItems,
      itemCount: orderItems.length,
      shippingAddress: orderData.shippingAddress,
      shippingMethod: orderData.deliveryMethod,
      paymentMethod: orderData.paymentMethod,
      paymentStatus: isPaidAtCounter ? 'paid' : 'pending',
      orderStatus,
      subtotal,
      taxAmount,
      shippingFee,
      discountAmount,
      totalAmount,
      notes: orderData.orderNotes || '',
      pharmacistNotes: orderData.pharmacistNotes || '',
      prescriptionId: prescription?._id,
      createdBy: pharmacistId, // Track who created this order
      createdByInfo: pharmacistInfo,
      idempotencyKey: orderData.idempotencyKey,
      safetyReviewConfirmed: requiresSafetyReview ? true : Boolean(orderData.safetyReviewConfirmed),
      safetyReviewConfirmedAt: requiresSafetyReview ? new Date() : undefined,
      safetyReviewConfirmedBy: requiresSafetyReview ? pharmacistId : undefined,
      safetyReviewConfirmedByInfo: requiresSafetyReview ? pharmacistInfo : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      paidAt: isPaidAtCounter ? new Date() : undefined,
      deliveredAt: isPaidAtCounter ? new Date() : undefined,
      customerType: guestCustomer ? 'guest' : 'registered'
    }

    let result
    try {
      result = await databaseService.withTransaction(async (session) => {
        if (prescription?._id) {
          const existingOrder = await databaseService.orders.findOne({ prescriptionId: prescription._id }, { session })
          if (existingOrder) {
            throw new ErrorWithStatus({
              message: 'An order has already been created for this prescription',
              status: HTTP_STATUS.CONFLICT
            })
          }
        }

        const insertResult = await databaseService.orders.insertOne(order as any, { session })

        for (const deduction of stockDeductions) {
          const stockResult = await databaseService.products.updateOne(
            { _id: deduction.productId, stockQuantity: { $gte: deduction.quantity } },
            { $inc: { stockQuantity: -deduction.quantity } },
            { session }
          )

          if (stockResult.modifiedCount !== 1) {
            throw new ErrorWithStatus({
              message: `Insufficient stock for product: ${deduction.productName}`,
              status: HTTP_STATUS.BAD_REQUEST
            })
          }
        }

        return insertResult
      })
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ErrorWithStatus({
          message: error?.keyPattern?.prescriptionId
            ? 'An order has already been created for this prescription'
            : 'Duplicate order number. Please retry order creation.',
          status: HTTP_STATUS.CONFLICT
        })
      }
      throw error
    }

    // Low-stock alerts after successful order creation.
    for (const deduction of stockDeductions) {
      // Check tồn kho sau khi trừ, cảnh báo nếu ≤ 30 (fire-and-forget)
      const updatedProduct = await databaseService.products.findOne(
        { _id: deduction.productId },
        { projection: { _id: 1, name: 1, stockQuantity: 1 } }
      )
      if (updatedProduct && updatedProduct.stockQuantity <= LOW_STOCK_THRESHOLD) {
        try {
          const io = getIO()
          notificationService
            .notifyLowStock(updatedProduct._id!, updatedProduct.name, updatedProduct.stockQuantity, io)
            .catch(() => {})
        } catch {
          /* socket not ready */
        }
      }
    }

    const persistedOrder = { ...order, _id: result.insertedId }
    let paymentUrl: string | undefined
    let paymentUrlError = false
    if (ONLINE_PAYMENT_METHODS.has(orderData.paymentMethod)) {
      try {
        paymentUrl = await paymentService.createPaymentUrl(persistedOrder as any, orderData.req)
      } catch {
        paymentUrlError = true
      }
    }

    return {
      order: persistedOrder,
      orderId: result.insertedId.toString(),
      orderNumber,
      paymentUrl,
      paymentUrlError
    }
  }

  private async validatePrescriptionForPharmacistOrder(
    prescriptionId: string | undefined,
    items: Array<{ productId: string; quantity: number }>
  ) {
    if (!prescriptionId) return null

    if (!ObjectId.isValid(prescriptionId)) {
      throw new ErrorWithStatus({ message: 'Invalid prescription ID', status: HTTP_STATUS.BAD_REQUEST })
    }

    const prescription = await databaseService.prescriptions.findOne({ _id: new ObjectId(prescriptionId) })
    if (!prescription) {
      throw new ErrorWithStatus({ message: 'Prescription not found', status: HTTP_STATUS.NOT_FOUND })
    }

    if (prescription.status !== PrescriptionStatus.Verified) {
      throw new ErrorWithStatus({
        message: 'Only verified prescriptions can be used to create orders',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (prescription.validUntil && prescription.validUntil < new Date()) {
      throw new ErrorWithStatus({ message: 'Prescription has expired', status: HTTP_STATUS.BAD_REQUEST })
    }

    const medications = prescription.medications || []

    const orderedQuantityByProductId = new Map<string, number>()
    for (const item of items) {
      orderedQuantityByProductId.set(item.productId, (orderedQuantityByProductId.get(item.productId) || 0) + Number(item.quantity || 0))
    }

    for (const [productId, orderedQuantity] of orderedQuantityByProductId.entries()) {
      const medication = medications.find((med: any) => med.productId?.toString() === productId)
      if (medication?.quantity !== undefined && orderedQuantity > Number(medication.quantity)) {
        throw new ErrorWithStatus({
          message: `Prescription quantity exceeded for ${medication.productName}`,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
    }

    return prescription
  }

  private async createGuestCustomerForPharmacistOrder(
    orderNumber: string,
    shippingAddress: { firstName: string; lastName: string; phone: string; email: string; address: string; ward: string; district: string; province: string },
    pharmacistId: ObjectId
  ) {
    const now = new Date()
    const guest = {
      _id: new ObjectId(),
      email: shippingAddress.email?.trim() || `guest-${orderNumber.toLowerCase()}@medispace.local`,
      password: '',
      role: UserRole.Customer,
      status: UserStatus.Verified,
      firstName: shippingAddress.firstName || 'Guest',
      lastName: shippingAddress.lastName || 'Customer',
      phoneNumber: shippingAddress.phone || '',
      addresses: [{ ...shippingAddress, isDefault: true, phone: shippingAddress.phone }],
      medicalProfile: {},
      isGuest: true,
      guestSource: 'pharmacist_pos',
      createdAt: now,
      updatedAt: now,
      created_by: pharmacistId,
      wishlist: []
    }

    try {
      await databaseService.users.insertOne(guest as any)
      return guest
    } catch (error: any) {
      if (error?.code === 11000 && shippingAddress.phone) {
        const existing = await databaseService.users.findOne({ phoneNumber: shippingAddress.phone })
        if (existing) return existing
      }
      throw error
    }
  }

  private async findUniqueCustomerByPhone(phoneNumber: string) {
    const customers = await databaseService.users.find({ phoneNumber }).limit(2).toArray()
    if (customers.length > 1) {
      throw new ErrorWithStatus({
        message: 'Multiple customers found with this phone number. Please select a unique customer account.',
        status: HTTP_STATUS.CONFLICT
      })
    }
    return customers[0] || null
  }

  private async generateUniquePharmacistOrderNumber() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const orderNumber = `DH${Date.now()}${Math.floor(Math.random() * 100000)
        .toString()
        .padStart(5, '0')}`
      const existing = await databaseService.orders.findOne({ orderNumber }, { projection: { _id: 1 } })
      if (!existing) return orderNumber
    }

    throw new ErrorWithStatus({
      message: 'Could not generate a unique order number',
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR
    })
  }

  async getOrderByIdempotencyKey(pharmacistId: ObjectId, idempotencyKey: string) {
    return databaseService.orders.findOne({ createdBy: pharmacistId, idempotencyKey })
  }

  async createPaymentUrlForPharmacistOrder(order: any, req?: any) {
    if (!order || order.paymentStatus === 'paid' || !ONLINE_PAYMENT_METHODS.has(order.paymentMethod)) return undefined
    return paymentService.createPaymentUrl(order, req)
  }

  // Get orders list for pharmacist with filters
  async getOrders(filters: {
    page?: number
    limit?: number
    status?: string
    paymentStatus?: string
    search?: string
  }) {
    const page = filters.page || 1
    const limit = filters.limit || 20
    const skip = (page - 1) * limit

    const query: Record<string, unknown> = {}

    // Filter by order status
    if (filters.status) {
      if (!ORDER_STATUSES.has(filters.status as OrderStatus)) {
        throw new ErrorWithStatus({ message: 'Invalid order status filter', status: HTTP_STATUS.BAD_REQUEST })
      }
      query.orderStatus = filters.status
    }

    // Filter by payment status
    if (filters.paymentStatus) {
      if (!PAYMENT_STATUSES.has(filters.paymentStatus)) {
        throw new ErrorWithStatus({ message: 'Invalid payment status filter', status: HTTP_STATUS.BAD_REQUEST })
      }
      query.paymentStatus = filters.paymentStatus
    }

    // Search by order number or customer info
    if (filters.search) {
      const safeSearch = escapeRegex(filters.search.trim())
      query.$or = [
        { orderNumber: { $regex: safeSearch, $options: 'i' } },
        { 'shippingAddress.firstName': { $regex: safeSearch, $options: 'i' } },
        { 'shippingAddress.lastName': { $regex: safeSearch, $options: 'i' } },
        { 'shippingAddress.phone': { $regex: safeSearch, $options: 'i' } }
      ]
    }

    const [orders, totalOrders] = await Promise.all([
      databaseService.orders.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      databaseService.orders.countDocuments(query)
    ])

    return {
      orders,
      pagination: {
        page,
        limit,
        totalOrders,
        totalPages: Math.ceil(totalOrders / limit)
      }
    }
  }

  // Get order details by ID
  async getOrderById(orderId: string) {
    if (!ObjectId.isValid(orderId)) {
      throw new ErrorWithStatus({
        message: PHARMACIST_MESSAGES.ORDER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    const orderObjectId = new ObjectId(orderId)

    const order = await databaseService.orders.findOne({ _id: orderObjectId })

    if (!order) {
      throw new ErrorWithStatus({
        message: PHARMACIST_MESSAGES.ORDER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    // Get customer info
    const customer = await databaseService.users.findOne({ _id: order.userId })

    return {
      ...order,
      customer: customer
        ? {
            _id: customer._id,
            email: customer.email,
            firstName: customer.firstName,
            lastName: customer.lastName
          }
        : null
    }
  }

  // Update order status
  async updateOrderStatus(orderId: string, newStatus: string, trackingNumber?: string, notes?: string) {
    const result = await orderService.updateOrderStatus(new ObjectId(orderId), newStatus, trackingNumber, notes)
    if (!result) {
      throw new ErrorWithStatus({
        message: PHARMACIST_MESSAGES.ORDER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }
    return result
  }

  // Get order statistics
  async getOrderStatistics(dateRange?: { startDate: Date; endDate: Date }) {
    const query: Record<string, unknown> = {}

    if (dateRange) {
      query.createdAt = {
        $gte: dateRange.startDate,
        $lte: dateRange.endDate
      }
    }

    const [statusCounts, paymentCounts, totalRevenue] = await Promise.all([
      // Count orders by status
      databaseService.orders
        .aggregate([
          { $match: query },
          {
            $group: {
              _id: '$orderStatus',
              count: { $sum: 1 }
            }
          }
        ])
        .toArray(),

      // Count orders by payment status
      databaseService.orders
        .aggregate([
          { $match: query },
          {
            $group: {
              _id: '$paymentStatus',
              count: { $sum: 1 }
            }
          }
        ])
        .toArray(),

      // Calculate total revenue
      databaseService.orders
        .aggregate([
          {
            $match: {
              ...query,
              orderStatus: { $in: ['confirmed', 'shipped', 'delivered'] },
              paymentStatus: 'paid'
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$totalAmount' }
            }
          }
        ])
        .toArray()
    ])

    return {
      ordersByStatus: statusCounts,
      ordersByPayment: paymentCounts,
      totalRevenue: totalRevenue[0]?.total || 0
    }
  }

  // ========== SETTINGS & PROFILE METHODS ==========

  // Update pharmacist profile information
  async updateProfile(
    pharmacistId: ObjectId,
    profileData: {
      firstName?: string
      lastName?: string
      phoneNumber?: string
      dateOfBirth?: Date
      gender?: number
      avatar?: string
      lisenseNumber?: string
    }
  ) {
    const result = await databaseService.users.findOneAndUpdate(
      { _id: pharmacistId },
      {
        $set: {
          ...profileData,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    )

    if (!result) {
      throw new ErrorWithStatus({
        message: PHARMACIST_MESSAGES.PHARMACIST_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    return {
      _id: result._id,
      email: result.email,
      firstName: result.firstName,
      lastName: result.lastName,
      phoneNumber: result.phoneNumber,
      dateOfBirth: result.dateOfBirth,
      gender: result.gender,
      avatar: result.avatar,
      lisenseNumber: result.lisenseNumber,
      role: result.role,
      status: result.status,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    }
  }

  // Update pharmacist password
  async updatePassword(pharmacistId: ObjectId, oldPassword: string, newPassword: string) {
    const pharmacist = await databaseService.users.findOne({ _id: pharmacistId })

    if (!pharmacist) {
      throw new ErrorWithStatus({
        message: PHARMACIST_MESSAGES.PHARMACIST_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    // Verify old password
    const hashedOldPassword = hashPassword(oldPassword)
    if (pharmacist.password !== hashedOldPassword) {
      throw new ErrorWithStatus({
        message: PHARMACIST_MESSAGES.OLD_PASSWORD_INCORRECT,
        status: HTTP_STATUS.UNAUTHORIZED
      })
    }

    // Hash and update new password
    const hashedNewPassword = hashPassword(newPassword)
    await databaseService.users.findOneAndUpdate(
      { _id: pharmacistId },
      {
        $set: {
          password: hashedNewPassword,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    )

    return {
      message: 'Password updated successfully'
    }
  }

  // Get pharmacist working statistics
  async getWorkingStats(pharmacistId: ObjectId, dateRange?: { startDate: Date; endDate: Date }) {
    const query: Record<string, unknown> = {
      verifiedBy: pharmacistId
    }

    if (dateRange) {
      query.verifiedAt = {
        $gte: dateRange.startDate,
        $lte: dateRange.endDate
      }
    }

    const [prescriptionsVerified, prescriptionsByStatus] = await Promise.all([
      // Count total prescriptions verified
      databaseService.prescriptions.countDocuments(query),

      // Count prescriptions by status
      databaseService.prescriptions
        .aggregate([
          { $match: query },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ])
        .toArray()
    ])

    return {
      totalPrescriptionsVerified: prescriptionsVerified,
      prescriptionsByStatus,
      dateRange: dateRange || { startDate: null, endDate: null }
    }
  }

  // Update pharmacist online status
  async updateOnlineStatus(pharmacistId: ObjectId, isOnline: boolean) {
    const result = await databaseService.users.findOneAndUpdate(
      { _id: pharmacistId },
      {
        $set: {
          isOnline,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    )

    if (!result) {
      throw new ErrorWithStatus({
        message: PHARMACIST_MESSAGES.PHARMACIST_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    return {
      _id: result._id,
      isOnline: result.isOnline,
      updatedAt: result.updatedAt
    }
  }

  // Get prescription by ID
  async getPrescriptionById(prescriptionId: string) {
    const prescription = await databaseService.prescriptions.findOne({
      _id: new ObjectId(prescriptionId)
    })

    if (!prescription) {
      throw new ErrorWithStatus({
        message: 'Không tìm thấy đơn thuốc',
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    return prescription
  }
}

const pharmacistService = new PharmacistService()
export default pharmacistService
