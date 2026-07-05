import { Request, Response } from 'express'
import { TokenPayload } from '~/models/requests/User.request'
import { PHARMACIST_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'
import pharmacistService from '~/services/pharmacist.services'
import { ObjectId } from 'mongodb'
import { writePatientPhiAudit } from '~/middlewares/patientPhi.middlewares'
import { ErrorWithStatus } from '~/models/Error'
import { redis } from '~/services/cache.services'

// Get dashboard statistics
export const getDashboardStatsController = async (req: Request, res: Response) => {
  const result = await pharmacistService.getDashboardStats()
  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.GET_DASHBOARD_STATS_SUCCESS,
    result
  })
}

// Get recent activities
export const getRecentActivitiesController = async (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 5

  const [recentPrescriptions, recentOrders] = await Promise.all([
    pharmacistService.getRecentPrescriptions(limit),
    pharmacistService.getRecentOrders(limit)
  ])

  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.GET_RECENT_ACTIVITIES_SUCCESS,
    result: {
      prescriptions: recentPrescriptions,
      orders: recentOrders
    }
  })
}

// Search patients by phone or partial name
export const searchPatientsController = async (req: Request, res: Response) => {
  const { phone } = req.query as { phone: string }
  const { userId } = req.decoded_authorization as TokenPayload
  const result = await pharmacistService.searchPatients(phone, new ObjectId(userId))
  await writePatientPhiAudit(req, 'patient_search', undefined, { query: phone, resultCount: result.length })
  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.GET_PATIENT_INFO_SUCCESS,
    result // Now returns an array of users instead of exactly 1 user
  })
}

// Get patient history
export const getPatientHistoryController = async (req: Request<{ customerId: string }>, res: Response) => {
  const { customerId } = req.params
  const result = await pharmacistService.getPatientHistory(customerId)
  await writePatientPhiAudit(req, 'patient_history_view', new ObjectId(customerId))
  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.GET_PATIENT_HISTORY_SUCCESS,
    result
  })
}

// Get pharmacist profile
export const getPharmacistProfileController = async (req: Request, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const result = await pharmacistService.getPharmacistProfile(new ObjectId(userId))
  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.GET_PROFILE_SUCCESS,
    result
  })
}

// ========== PATIENT MEDICAL INFO CONTROLLERS ==========

// Get patient medical information
export const getMedicalInfoController = async (req: Request<{ customerId: string }>, res: Response) => {
  const { customerId } = req.params
  const [medicalInfo, recentMedications] = await Promise.all([
    pharmacistService.getMedicalInfo(customerId),
    pharmacistService.getRecentMedications(customerId, 90)
  ])
  const result = {
    ...medicalInfo,
    currentMedications: recentMedications.map((medication) => ({
      name: medication.drug_name,
      dosage: medication.dosage,
      frequency: medication.instructions || '',
      startDate: medication.prescribed_date
    }))
  }
  await writePatientPhiAudit(req, 'patient_medical_info_view', new ObjectId(customerId))
  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.GET_MEDICAL_INFO_SUCCESS,
    result
  })
}

// Update patient medical information
export const updateMedicalInfoController = async (req: Request<{ customerId: string }>, res: Response) => {
  const { customerId } = req.params
  const { blood_type, bloodType, allergies, chronic_diseases, chronicDiseases } = req.body
  const result = await pharmacistService.updateMedicalInfo(customerId, {
    blood_type: blood_type ?? bloodType,
    allergies,
    chronic_diseases: chronic_diseases ?? chronicDiseases
  })
  await writePatientPhiAudit(req, 'patient_medical_info_update', new ObjectId(customerId))
  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.UPDATE_MEDICAL_INFO_SUCCESS,
    result
  })
}

// Add allergy to patient
export const addAllergyController = async (req: Request<{ customerId: string }>, res: Response) => {
  const { customerId } = req.params
  const { allergy, allergen } = req.body
  const result = await pharmacistService.addAllergy(customerId, allergy ?? allergen)
  await writePatientPhiAudit(req, 'patient_allergy_add', new ObjectId(customerId))
  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.ADD_ALLERGY_SUCCESS,
    result
  })
}

// ========== PATIENT NOTES CONTROLLERS ==========

// Create patient note
export const createPatientNoteController = async (req: Request<{ customerId: string }>, res: Response) => {
  const { customerId } = req.params
  const { userId } = req.decoded_authorization as TokenPayload
  const { note_type, content, related_prescription_id } = req.body

  // Check prescription status - allow notes for pending and verified prescriptions
  if (related_prescription_id) {
    const prescription = await pharmacistService.getPrescriptionById(related_prescription_id)
    if (!prescription || !['pending', 'verified'].includes(prescription.status)) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Chỉ đơn thuốc ở trạng thái chờ xử lý hoặc đã duyệt mới có thể ghi chú.'
      })
    }
  }

  const result = await pharmacistService.createPatientNote(customerId, new ObjectId(userId), {
    note_type,
    content,
    related_prescription_id
  })
  await writePatientPhiAudit(req, 'patient_note_create', new ObjectId(customerId), { noteType: note_type })

  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.CREATE_NOTE_SUCCESS,
    result
  })
}

// Get patient notes
export const getPatientNotesController = async (req: Request<{ customerId: string }>, res: Response) => {
  const { customerId } = req.params
  const result = await pharmacistService.getPatientNotes(customerId)
  await writePatientPhiAudit(req, 'patient_notes_view', new ObjectId(customerId), { resultCount: result.length })
  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.GET_NOTES_SUCCESS,
    result
  })
}

// ========== MEDICATION TRACKING CONTROLLERS ==========

// Get recent medications
export const getRecentMedicationsController = async (req: Request<{ customerId: string }>, res: Response) => {
  const { customerId } = req.params
  const daysBack = Number(req.query.days) || 30
  const result = await pharmacistService.getRecentMedications(customerId, daysBack)
  await writePatientPhiAudit(req, 'patient_medications_view', new ObjectId(customerId), { daysBack })
  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.GET_MEDICATIONS_SUCCESS,
    result
  })
}

// Check drug interactions
export const checkDrugInteractionsController = async (req: Request<{ customerId: string }>, res: Response) => {
  const { customerId } = req.params
  const { drug_name } = req.body
  const result = await pharmacistService.checkDrugInteractions(customerId, drug_name)
  await writePatientPhiAudit(req, 'patient_interaction_check', new ObjectId(customerId), { drugName: drug_name })
  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.CHECK_INTERACTIONS_SUCCESS,
    result
  })
}

// ========== DRUG DATABASE CONTROLLERS ==========

export const getDrugDatabaseProductsController = async (req: Request, res: Response) => {
  const { page, limit, search, categoryId, type, stock, activeStatus, status, sortBy, sortOrder } = req.query as {
    page?: string
    limit?: string
    search?: string
    categoryId?: string
    type?: string
    stock?: string
    activeStatus?: string
    status?: string
    sortBy?: string
    sortOrder?: string
  }

  const result = await pharmacistService.getDrugDatabaseProducts({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    search,
    categoryId,
    type,
    stock,
    activeStatus,
    status,
    sortBy,
    sortOrder
  })

  return res.status(HTTP_STATUS.OK).json({
    message: 'Get pharmacist drug database products successfully',
    result
  })
}

export const getDrugDatabaseProductController = async (req: Request<{ productId: string }>, res: Response) => {
  const result = await pharmacistService.getDrugDatabaseProduct(req.params.productId)
  return res.status(HTTP_STATUS.OK).json({
    message: 'Get pharmacist drug database product successfully',
    result
  })
}

// ========== ORDER MANAGEMENT CONTROLLERS ==========

// Create order (for pharmacist)
export const createPharmacistOrderController = async (req: Request, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const pharmacistId = new ObjectId(userId)
  const idempotencyKey = req.header('x-idempotency-key')?.trim()
  const lockKey = idempotencyKey ? `pharmacist:order:create:${pharmacistId.toString()}:${idempotencyKey}` : undefined
  let locked = false
  let lockAvailable = false

  try {
    if (lockKey) {
      try {
        locked = (await redis.set(lockKey, '1', 'EX', 60, 'NX')) === 'OK'
        lockAvailable = true
      } catch {
        lockAvailable = false
      }

      if (lockAvailable && !locked) {
        const existing = await pharmacistService.getOrderByIdempotencyKey(pharmacistId, idempotencyKey!)
        if (existing) {
          let paymentUrl: string | undefined
          let paymentUrlError = false
          try {
            paymentUrl = await pharmacistService.createPaymentUrlForPharmacistOrder(existing, req)
          } catch {
            paymentUrlError = true
          }
          return res.status(HTTP_STATUS.OK).json({
            message: PHARMACIST_MESSAGES.CREATE_ORDER_SUCCESS,
            result: {
              order: existing,
              orderId: existing._id?.toString(),
              orderNumber: existing.orderNumber,
              paymentUrl,
              paymentUrlError
            }
          })
        }
        throw new ErrorWithStatus({ message: 'Order creation is already being processed.', status: HTTP_STATUS.CONFLICT })
      }
    }

    const result = await pharmacistService.createPharmacistOrder(pharmacistId, {
      ...req.body,
      idempotencyKey,
      req
    })

    return res.status(HTTP_STATUS.CREATED).json({
      message: PHARMACIST_MESSAGES.CREATE_ORDER_SUCCESS,
      result
    })
  } finally {
    if (lockKey && locked) await redis.del(lockKey).catch(() => undefined)
  }
}

// Get orders with filters
export const getOrdersController = async (req: Request, res: Response) => {
  const { page, limit, status, paymentStatus, search } = req.query as {
    page?: string
    limit?: string
    status?: string
    paymentStatus?: string
    search?: string
  }

  const result = await pharmacistService.getOrders({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    status,
    paymentStatus,
    search
  })

  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.GET_ORDERS_SUCCESS,
    result
  })
}

// Get order details by ID
export const getOrderDetailsController = async (req: Request<{ orderId: string }>, res: Response) => {
  const { orderId } = req.params
  const result = await pharmacistService.getOrderById(orderId)
  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.GET_ORDER_DETAILS_SUCCESS,
    result
  })
}

// Update order status
export const updateOrderStatusController = async (req: Request<{ orderId: string }>, res: Response) => {
  const { orderId } = req.params
  const { status, trackingNumber, notes } = req.body
  const result = await pharmacistService.updateOrderStatus(orderId, status, trackingNumber, notes)
  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.UPDATE_ORDER_STATUS_SUCCESS,
    result
  })
}

// Get order statistics
export const getOrderStatisticsController = async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query as { startDate?: string; endDate?: string }

  const dateRange =
    startDate && endDate
      ? {
          startDate: new Date(startDate),
          endDate: new Date(endDate)
        }
      : undefined

  const result = await pharmacistService.getOrderStatistics(dateRange)

  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.GET_ORDER_STATS_SUCCESS,
    result
  })
}

// ========== SETTINGS & PROFILE CONTROLLERS ==========

// Update pharmacist profile
export const updateProfileController = async (req: Request, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const { firstName, lastName, phoneNumber, dateOfBirth, gender, avatar, lisenseNumber } = req.body

  const result = await pharmacistService.updateProfile(new ObjectId(userId), {
    firstName,
    lastName,
    phoneNumber,
    dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
    gender,
    avatar,
    lisenseNumber
  })

  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.UPDATE_PROFILE_SUCCESS,
    result
  })
}

// Update pharmacist password
export const updatePasswordController = async (req: Request, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const { oldPassword, newPassword } = req.body

  const result = await pharmacistService.updatePassword(new ObjectId(userId), oldPassword, newPassword)

  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.UPDATE_PASSWORD_SUCCESS,
    result
  })
}

// Get pharmacist working statistics
export const getWorkingStatsController = async (req: Request, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const { startDate, endDate } = req.query as { startDate?: string; endDate?: string }

  const dateRange =
    startDate && endDate
      ? {
          startDate: new Date(startDate),
          endDate: new Date(endDate)
        }
      : undefined

  const result = await pharmacistService.getWorkingStats(new ObjectId(userId), dateRange)

  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.GET_WORKING_STATS_SUCCESS,
    result
  })
}

// Update pharmacist online status
export const updateOnlineStatusController = async (req: Request, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const { isOnline } = req.body

  const result = await pharmacistService.updateOnlineStatus(new ObjectId(userId), isOnline)

  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.UPDATE_ONLINE_STATUS_SUCCESS,
    result
  })
}
