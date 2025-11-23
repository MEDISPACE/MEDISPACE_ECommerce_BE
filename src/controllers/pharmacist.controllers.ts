import { Request, Response } from 'express'
import { TokenPayload } from '~/models/requests/User.request'
import { PHARMACIST_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'
import pharmacistService from '~/services/pharmacist.services'
import { ObjectId } from 'mongodb'

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

// Get patient by phone
export const getPatientByPhoneController = async (req: Request, res: Response) => {
  const { phone } = req.query as { phone: string }
  const result = await pharmacistService.getPatientByPhone(phone)
  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.GET_PATIENT_INFO_SUCCESS,
    result
  })
}

// Get patient history
export const getPatientHistoryController = async (req: Request<{ customerId: string }>, res: Response) => {
  const { customerId } = req.params
  const result = await pharmacistService.getPatientHistory(customerId)
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
  const result = await pharmacistService.getMedicalInfo(customerId)
  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.GET_MEDICAL_INFO_SUCCESS,
    result
  })
}

// Update patient medical information
export const updateMedicalInfoController = async (req: Request<{ customerId: string }>, res: Response) => {
  const { customerId } = req.params
  const { blood_type, allergies, chronic_diseases } = req.body
  const result = await pharmacistService.updateMedicalInfo(customerId, {
    blood_type,
    allergies,
    chronic_diseases
  })
  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.UPDATE_MEDICAL_INFO_SUCCESS,
    result
  })
}

// Add allergy to patient
export const addAllergyController = async (req: Request<{ customerId: string }>, res: Response) => {
  const { customerId } = req.params
  const { allergy } = req.body
  const result = await pharmacistService.addAllergy(customerId, allergy)
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

  const result = await pharmacistService.createPatientNote(customerId, new ObjectId(userId), {
    note_type,
    content,
    related_prescription_id
  })

  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.CREATE_NOTE_SUCCESS,
    result
  })
}

// Get patient notes
export const getPatientNotesController = async (req: Request<{ customerId: string }>, res: Response) => {
  const { customerId } = req.params
  const result = await pharmacistService.getPatientNotes(customerId)
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
  return res.status(HTTP_STATUS.OK).json({
    message: PHARMACIST_MESSAGES.CHECK_INTERACTIONS_SUCCESS,
    result
  })
}

// ========== ORDER MANAGEMENT CONTROLLERS ==========

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
