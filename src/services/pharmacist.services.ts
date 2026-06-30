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
import { OrderStatus, PrescriptionStatus, ShippingMethod } from '~/constants/enum'
import notificationService from './notifications.services'
import { getIO } from '~/sockets/chat.socket'
import orderService from './orders.services'

const VIETNAM_TIMEZONE_OFFSET_MINUTES = 7 * 60
const DEFAULT_VAT_RATE = 0.1
const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD || 30)
const ORDER_STATUSES = new Set(Object.values(OrderStatus))
const PAYMENT_STATUSES = new Set(['pending', 'paid', 'failed', 'refunded', 'partially_refunded'])

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const getVietnamDayRange = (date = new Date()) => {
  const vietnamTime = new Date(date.getTime() + VIETNAM_TIMEZONE_OFFSET_MINUTES * 60 * 1000)
  const startUtc = Date.UTC(vietnamTime.getUTCFullYear(), vietnamTime.getUTCMonth(), vietnamTime.getUTCDate())
  const startDate = new Date(startUtc - VIETNAM_TIMEZONE_OFFSET_MINUTES * 60 * 1000)
  const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000)
  return { startDate, endDate }
}

class PharmacistService {
  // Get dashboard statistics
  async getDashboardStats() {
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

    return {
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
  async searchPatients(searchQuery: string) {
    if (!searchQuery) return []

    const users = await databaseService.users
      .find({
        $or: [
          { phoneNumber: { $regex: searchQuery, $options: 'i' } },
          { firstName: { $regex: searchQuery, $options: 'i' } },
          { lastName: { $regex: searchQuery, $options: 'i' } }
        ]
      })
      .limit(10)
      .toArray()

    return users
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
      }
      deliveryMethod: string
      paymentMethod: string
      orderNotes?: string
      pharmacistNotes?: string
    }
  ) {
    // Validate items
    if (!orderData.items || orderData.items.length === 0) {
      throw new ErrorWithStatus({
        message: 'Order must have at least one item',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const prescription = await this.validatePrescriptionForPharmacistOrder(orderData.prescriptionId, orderData.items)

    // Fetch product details and calculate prices
    const orderItems = []
    let subtotal = 0
    const stockDeductions: Array<{ productId: ObjectId; quantity: number; productName: string }> = []

    for (const item of orderData.items) {
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

      // Check stock with unit conversion
      const variant =
        product.priceVariants?.find((v: any) => v.unit === item.unit) ||
        product.priceVariants?.find((v: any) => v.isDefault) ||
        product.priceVariants?.[0]
      const unitPrice = variant?.price || 0
      const quantityPerUnit = variant?.quantityPerUnit || 1
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

    // Calculate delivery fee based on method
    let shippingFee = 0
    if (orderData.deliveryMethod === ShippingMethod.InStore) {
      shippingFee = 0
    } else {
      // For standard, fast, express - backend will accept the shippingFee provided by frontend payload if available,
      // but for now we fallback to standard fees if not provided
      const deliveryFees: Record<string, number> = {
        standard: 0,
        fast: 15000,
        express: 25000
      }
      // If frontend provides an explicit shippingFee we should ideally use it, but since the schema
      // of orderData in createPharmacistOrder doesn't explicitly accept it yet, we use the fallback or 0
      shippingFee =
        (orderData as any).shippingFee !== undefined
          ? (orderData as any).shippingFee
          : deliveryFees[orderData.deliveryMethod] || 0
    }

    // Calculate tax and total
    const taxAmount = Math.round(subtotal * DEFAULT_VAT_RATE)
    const discountAmount = 0 // No discount for now
    const totalAmount = subtotal + taxAmount + shippingFee - discountAmount

    // Generate order number
    const orderNumber = await this.generateUniquePharmacistOrderNumber()

    // Find customer
    // customerId can be empty for anonymous guest in POS
    const customer = orderData.customerId ? await this.findUniqueCustomerByPhone(orderData.customerId) : null
    if (prescription && customer && prescription.customerId.toString() !== customer._id?.toString()) {
      throw new ErrorWithStatus({
        message: 'Prescription does not belong to the selected customer',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }
    const userId = customer ? customer._id : new ObjectId() // If customer not found, create temp ID

    const isInstore = orderData.deliveryMethod === ShippingMethod.InStore

    // Create order document
    const order = {
      _id: new ObjectId(),
      userId,
      orderNumber,
      items: orderItems,
      itemCount: orderItems.length,
      shippingAddress: orderData.shippingAddress,
      paymentMethod: orderData.paymentMethod,
      paymentStatus: isInstore ? 'paid' : 'pending',
      orderStatus: isInstore ? 'delivered' : 'pending',
      subtotal,
      taxAmount,
      shippingFee,
      discountAmount,
      totalAmount,
      notes: orderData.orderNotes || '',
      pharmacistNotes: orderData.pharmacistNotes || '',
      prescriptionId: prescription?._id,
      createdBy: pharmacistId, // Track who created this order
      createdAt: new Date(),
      updatedAt: new Date(),
      paidAt: isInstore ? new Date() : undefined,
      deliveredAt: isInstore ? new Date() : undefined
    }

    const result = await databaseService.withTransaction(async (session) => {
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

    return {
      order: { ...order, _id: result.insertedId },
      orderId: result.insertedId.toString(),
      orderNumber
    }
  }

  private async validatePrescriptionForPharmacistOrder(
    prescriptionId: string | undefined,
    items: Array<{ productId: string }>
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

    const mappedProductIds = new Set(
      (prescription.medications || []).map((medication: any) => medication.productId?.toString()).filter(Boolean)
    )
    const orderedProductIds = items.map((item) => item.productId)
    const hasUnmappedPrescriptionItem = (prescription.medications || []).some(
      (medication: any) => !medication.productId
    )

    if (mappedProductIds.size > 0 && orderedProductIds.some((productId) => !mappedProductIds.has(productId))) {
      throw new ErrorWithStatus({
        message: 'Order contains products that are not mapped from the verified prescription',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (hasUnmappedPrescriptionItem && orderedProductIds.length === 0) {
      throw new ErrorWithStatus({
        message: 'Prescription has unmapped medications. Please map products before creating an order.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    return prescription
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
