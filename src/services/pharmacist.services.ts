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

class PharmacistService {
  // Get dashboard statistics
  async getDashboardStats() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [prescriptionStats, totalPrescriptionsToday, verifiedPrescriptionsToday, ordersToday, totalRevenue] =
      await Promise.all([
        // Get prescription stats from prescriptions service (using lowercase status)
        prescriptionsService.getPrescriptionStats(),

        // Count total prescriptions today
        databaseService.prescriptions.countDocuments({
          createdAt: { $gte: today }
        }),

        // Count verified prescriptions today
        databaseService.prescriptions.countDocuments({
          status: 'verified',
          verifiedAt: { $gte: today }
        }),

        // Count orders today
        databaseService.orders.countDocuments({
          createdAt: { $gte: today }
        }),

        // Calculate total revenue today
        databaseService.orders
          .aggregate([
            {
              $match: {
                createdAt: { $gte: today },
                status: { $in: ['confirmed', 'shipping', 'delivered'] }
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
      pendingPrescriptions: prescriptionStats.pending,
      prescriptionsToday: {
        total: totalPrescriptionsToday,
        verified: verifiedPrescriptionsToday,
        rejected: prescriptionStats.rejected // Using stats from prescriptions service
      },
      ordersToday,
      totalRevenue: totalRevenue[0]?.total || 0,
      activeChats: 0 // TODO: Implement when chat system is ready
    }
  }

  // Get recent prescriptions
  async getRecentPrescriptions(limit = 5) {
    const prescriptions = await databaseService.prescriptions
      .find({ status: 'Pending' })
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

  // Get patient by phone
  async getPatientByPhone(phone: string) {
    const user = await databaseService.users.findOne({ phoneNumber: phone })

    if (!user) {
      throw new ErrorWithStatus({
        message: PHARMACIST_MESSAGES.PATIENT_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    return user
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
      return { ...newMedicalInfo, _id: result.insertedId }
    }

    return medicalInfo
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

    return result
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

    return result
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
        status: 'Verified',
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

  // Check drug interactions (placeholder - needs drug database)
  async checkDrugInteractions(customerId: string, newDrugName: string) {
    // Get patient's current medications
    const [medicalInfo, recentMedications] = await Promise.all([
      this.getMedicalInfo(customerId),
      this.getRecentMedications(customerId, 90)
    ])

    // Check against allergies
    const allergyWarnings = (medicalInfo?.allergies || [])
      .filter((allergy) => newDrugName.toLowerCase().includes(allergy.toLowerCase()))
      .map((allergy) => ({
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
      recommendation: allergyWarnings.length > 0 ? 'DO NOT DISPENSE - Check with doctor' : 'Safe to dispense'
    }
  }

  // ========== ORDER MANAGEMENT METHODS ==========

  // Create order for pharmacist (direct order creation without cart)
  async createPharmacistOrder(
    pharmacistId: ObjectId,
    orderData: {
      customerId: string
      prescriptionId?: string
      items: Array<{
        productId: string
        quantity: number
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

    // Fetch product details and calculate prices
    const orderItems = []
    let subtotal = 0

    for (const item of orderData.items) {
      const product = await databaseService.products.findOne({ _id: new ObjectId(item.productId) })

      if (!product) {
        throw new ErrorWithStatus({
          message: `Product not found: ${item.productId}`,
          status: HTTP_STATUS.NOT_FOUND
        })
      }

      // Check stock
      if (product.stockQuantity < item.quantity) {
        throw new ErrorWithStatus({
          message: `Insufficient stock for product: ${product.name}`,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }

      const totalPrice = product.price * item.quantity
      subtotal += totalPrice

      orderItems.push({
        productId: new ObjectId(item.productId),
        name: product.name,
        sku: product.sku || '',
        quantity: item.quantity,
        unitPrice: product.price,
        totalPrice,
        prescriptionRequired: product.requiresPrescription || false,
        image: product.featuredImage || ''
      })
    }

    // Calculate delivery fee based on method
    const deliveryFees: Record<string, number> = {
      standard: 0,
      fast: 15000,
      express: 25000
    }
    const shippingFee = deliveryFees[orderData.deliveryMethod] || 0

    // Calculate tax and total
    const taxAmount = Math.round(subtotal * 0.1) // 10% VAT
    const discountAmount = 0 // No discount for now
    const totalAmount = subtotal + taxAmount + shippingFee - discountAmount

    // Generate order number
    const orderNumber = `DH${Date.now()}${Math.floor(Math.random() * 1000)}`

    // Find customer
    const customer = await databaseService.users.findOne({ phoneNumber: orderData.customerId })
    const userId = customer ? customer._id : new ObjectId() // If customer not found, create temp ID

    // Create order document
    const order = {
      _id: new ObjectId(),
      userId,
      orderNumber,
      items: orderItems,
      itemCount: orderItems.length,
      shippingAddress: orderData.shippingAddress,
      paymentMethod: orderData.paymentMethod,
      paymentStatus: 'pending',
      orderStatus: 'pending',
      subtotal,
      taxAmount,
      shippingFee,
      discountAmount,
      totalAmount,
      notes: orderData.orderNotes || '',
      pharmacistNotes: orderData.pharmacistNotes || '',
      prescriptionId: orderData.prescriptionId ? new ObjectId(orderData.prescriptionId) : undefined,
      createdBy: pharmacistId, // Track who created this order
      createdAt: new Date(),
      updatedAt: new Date()
    }

    // Insert order
    const result = await databaseService.orders.insertOne(order as any)

    // Update product stock
    for (const item of orderData.items) {
      await databaseService.products.updateOne(
        { _id: new ObjectId(item.productId) },
        { $inc: { stockQuantity: -item.quantity } }
      )
    }

    return {
      order: { ...order, _id: result.insertedId },
      orderId: result.insertedId.toString(),
      orderNumber
    }
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
      query.orderStatus = filters.status
    }

    // Filter by payment status
    if (filters.paymentStatus) {
      query.paymentStatus = filters.paymentStatus
    }

    // Search by order number or customer info
    if (filters.search) {
      query.$or = [
        { orderNumber: { $regex: filters.search, $options: 'i' } },
        { 'shippingAddress.firstName': { $regex: filters.search, $options: 'i' } },
        { 'shippingAddress.lastName': { $regex: filters.search, $options: 'i' } },
        { 'shippingAddress.phone': { $regex: filters.search, $options: 'i' } }
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
    const orderObjectId = new ObjectId(orderId)

    const order = await databaseService.orders.findOne({ _id: orderObjectId })

    if (!order) {
      throw new ErrorWithStatus({
        message: PHARMACIST_MESSAGES.ORDER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    const updateData: Record<string, unknown> = {
      orderStatus: newStatus,
      updatedAt: new Date()
    }

    // Add shipping info if status is shipped
    if (newStatus === 'shipped' && trackingNumber) {
      updateData.trackingNumber = trackingNumber
      updateData.shippedAt = new Date()
    }

    // Add delivery timestamp if delivered
    if (newStatus === 'delivered') {
      updateData.deliveredAt = new Date()
    }

    // Add notes if provided
    if (notes) {
      updateData.notes = notes
    }

    const result = await databaseService.orders.findOneAndUpdate(
      { _id: orderObjectId },
      { $set: updateData },
      { returnDocument: 'after' }
    )

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
