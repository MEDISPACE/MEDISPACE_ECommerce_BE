import { Router } from 'express'
import {
  getDashboardStatsController,
  getRecentActivitiesController,
  getPatientByPhoneController,
  getPatientHistoryController,
  getPharmacistProfileController,
  getMedicalInfoController,
  updateMedicalInfoController,
  addAllergyController,
  createPatientNoteController,
  getPatientNotesController,
  getRecentMedicationsController,
  checkDrugInteractionsController,
  getOrdersController,
  getOrderDetailsController,
  updateOrderStatusController,
  getOrderStatisticsController,
  updateProfileController,
  updatePasswordController,
  getWorkingStatsController,
  updateOnlineStatusController
} from '~/controllers/pharmacist.controllers'
import { wrapRequestHandler } from '~/utils/handlers'
import { accessTokenValidator } from '~/middlewares/users.middlewares'
import { authenticatePharmacist } from '~/middlewares/pharmacists.middlewares'

const pharmacistRouter = Router()

// Apply pharmacist authentication to all routes
pharmacistRouter.use(accessTokenValidator, authenticatePharmacist)

/**
 * Description: Get dashboard statistics
 * Path: /pharmacist/dashboard/stats
 * Method: GET
 * Headers: { Authorization: Bearer <access_token> }
 */
pharmacistRouter.get('/dashboard/stats', wrapRequestHandler(getDashboardStatsController))

/**
 * Description: Get recent activities (prescriptions & orders)
 * Path: /pharmacist/dashboard/recent-activities
 * Method: GET
 * Query: { limit?: number }
 * Headers: { Authorization: Bearer <access_token> }
 */
pharmacistRouter.get('/dashboard/recent-activities', wrapRequestHandler(getRecentActivitiesController))

/**
 * Description: Get patient information by phone
 * Path: /pharmacist/patients/search
 * Method: GET
 * Query: { phone: string }
 * Headers: { Authorization: Bearer <access_token> }
 */
pharmacistRouter.get('/patients/search', wrapRequestHandler(getPatientByPhoneController))

/**
 * Description: Get patient history (prescriptions & orders)
 * Path: /pharmacist/patients/:customerId/history
 * Method: GET
 * Params: { customerId: string }
 * Headers: { Authorization: Bearer <access_token> }
 */
pharmacistRouter.get('/patients/:customerId/history', wrapRequestHandler(getPatientHistoryController))

/**
 * Description: Get pharmacist profile
 * Path: /pharmacist/profile
 * Method: GET
 * Headers: { Authorization: Bearer <access_token> }
 */
pharmacistRouter.get('/profile', wrapRequestHandler(getPharmacistProfileController))

// ========== PATIENT MEDICAL INFO ROUTES ==========

/**
 * Description: Get patient medical information (allergies, chronic diseases, blood type)
 * Path: /pharmacist/patients/:customerId/medical-info
 * Method: GET
 * Params: { customerId: string }
 * Headers: { Authorization: Bearer <access_token> }
 */
pharmacistRouter.get('/patients/:customerId/medical-info', wrapRequestHandler(getMedicalInfoController))

/**
 * Description: Update patient medical information
 * Path: /pharmacist/patients/:customerId/medical-info
 * Method: PUT
 * Params: { customerId: string }
 * Body: { blood_type?: string, allergies?: string[], chronic_diseases?: string[] }
 * Headers: { Authorization: Bearer <access_token> }
 */
pharmacistRouter.put('/patients/:customerId/medical-info', wrapRequestHandler(updateMedicalInfoController))

/**
 * Description: Add allergy to patient
 * Path: /pharmacist/patients/:customerId/allergies
 * Method: POST
 * Params: { customerId: string }
 * Body: { allergy: string }
 * Headers: { Authorization: Bearer <access_token> }
 */
pharmacistRouter.post('/patients/:customerId/allergies', wrapRequestHandler(addAllergyController))

// ========== PATIENT NOTES ROUTES ==========

/**
 * Description: Create a note for a patient
 * Path: /pharmacist/patients/:customerId/notes
 * Method: POST
 * Params: { customerId: string }
 * Body: { note_type: 'consultation' | 'prescription_verification' | 'general', content: string, related_prescription_id?: string }
 * Headers: { Authorization: Bearer <access_token> }
 */
pharmacistRouter.post('/patients/:customerId/notes', wrapRequestHandler(createPatientNoteController))

/**
 * Description: Get all notes for a patient
 * Path: /pharmacist/patients/:customerId/notes
 * Method: GET
 * Params: { customerId: string }
 * Headers: { Authorization: Bearer <access_token> }
 */
pharmacistRouter.get('/patients/:customerId/notes', wrapRequestHandler(getPatientNotesController))

// ========== MEDICATION TRACKING ROUTES ==========

/**
 * Description: Get recent medications from verified prescriptions
 * Path: /pharmacist/patients/:customerId/medications
 * Method: GET
 * Params: { customerId: string }
 * Query: { days?: number }
 * Headers: { Authorization: Bearer <access_token> }
 */
pharmacistRouter.get('/patients/:customerId/medications', wrapRequestHandler(getRecentMedicationsController))

/**
 * Description: Check drug interactions and allergies
 * Path: /pharmacist/patients/:customerId/check-interactions
 * Method: POST
 * Params: { customerId: string }
 * Body: { drug_name: string }
 * Headers: { Authorization: Bearer <access_token> }
 */
pharmacistRouter.post('/patients/:customerId/check-interactions', wrapRequestHandler(checkDrugInteractionsController))

// ========== ORDER MANAGEMENT ROUTES ==========

/**
 * Description: Get orders list with filters
 * Path: /pharmacist/orders
 * Method: GET
 * Query: { page?: number, limit?: number, status?: string, paymentStatus?: string, search?: string }
 * Headers: { Authorization: Bearer <access_token> }
 */
pharmacistRouter.get('/orders', wrapRequestHandler(getOrdersController))

/**
 * Description: Get order statistics
 * Path: /pharmacist/orders/statistics
 * Method: GET
 * Query: { startDate?: string, endDate?: string }
 * Headers: { Authorization: Bearer <access_token> }
 */
pharmacistRouter.get('/orders/statistics', wrapRequestHandler(getOrderStatisticsController))

/**
 * Description: Get order details by ID
 * Path: /pharmacist/orders/:orderId
 * Method: GET
 * Params: { orderId: string }
 * Headers: { Authorization: Bearer <access_token> }
 */
pharmacistRouter.get('/orders/:orderId', wrapRequestHandler(getOrderDetailsController))

/**
 * Description: Update order status
 * Path: /pharmacist/orders/:orderId/status
 * Method: PATCH
 * Params: { orderId: string }
 * Body: { status: string, trackingNumber?: string, notes?: string }
 * Headers: { Authorization: Bearer <access_token> }
 */
pharmacistRouter.patch('/orders/:orderId/status', wrapRequestHandler(updateOrderStatusController))

// ========== SETTINGS & PROFILE ROUTES ==========

/**
 * Description: Update pharmacist profile
 * Path: /pharmacist/profile
 * Method: PATCH
 * Body: { firstName?: string, lastName?: string, phoneNumber?: string, dateOfBirth?: string, gender?: number, avatar?: string, lisenseNumber?: string }
 * Headers: { Authorization: Bearer <access_token> }
 */
pharmacistRouter.patch('/profile', wrapRequestHandler(updateProfileController))

/**
 * Description: Update pharmacist password
 * Path: /pharmacist/password
 * Method: PATCH
 * Body: { oldPassword: string, newPassword: string }
 * Headers: { Authorization: Bearer <access_token> }
 */
pharmacistRouter.patch('/password', wrapRequestHandler(updatePasswordController))

/**
 * Description: Get pharmacist working statistics
 * Path: /pharmacist/stats/working
 * Method: GET
 * Query: { startDate?: string, endDate?: string }
 * Headers: { Authorization: Bearer <access_token> }
 */
pharmacistRouter.get('/stats/working', wrapRequestHandler(getWorkingStatsController))

/**
 * Description: Update pharmacist online status
 * Path: /pharmacist/online-status
 * Method: PATCH
 * Body: { isOnline: boolean }
 * Headers: { Authorization: Bearer <access_token> }
 */
pharmacistRouter.patch('/online-status', wrapRequestHandler(updateOnlineStatusController))

export default pharmacistRouter
