import { Router } from 'express'
import {
  uploadPrescriptionController,
  getPrescriptionsController,
  getPrescriptionByIdController,
  getPendingPrescriptionsController,
  verifyPrescriptionController,
  getPrescriptionStatsController,
  scanPrescriptionController
} from '~/controllers/prescriptions.controllers'
import { wrapRequestHandler } from '~/utils/handlers'
import { accessTokenValidator } from '~/middlewares/users.middlewares'
import { authenticatePharmacist, checkLicense } from '~/middlewares/pharmacists.middlewares'

const prescriptionsRouter = Router()

/**
 * Description: Upload a new prescription
 * Path: /prescriptions
 * Method: POST
 * Body: UploadPrescriptionReqBody
 * Headers: { Authorization: Bearer <access_token> } (Customer)
 */
prescriptionsRouter.post('/', accessTokenValidator, wrapRequestHandler(uploadPrescriptionController))

/**
 * Description: Get user's prescriptions with pagination and filters
 * Path: /prescriptions
 * Method: GET
 * Query: { page?, limit?, status?, sort? }
 * Headers: { Authorization: Bearer <access_token> } (Customer)
 */
prescriptionsRouter.get('/', accessTokenValidator, wrapRequestHandler(getPrescriptionsController))

/**
 * Description: Get prescription statistics
 * Path: /prescriptions/stats
 * Method: GET
 * Headers: { Authorization: Bearer <access_token> } (Pharmacist)
 * IMPORTANT: This route MUST be before /:prescriptionId to avoid matching "stats" as an ID
 */
prescriptionsRouter.get(
  '/stats',
  accessTokenValidator,
  authenticatePharmacist,
  wrapRequestHandler(getPrescriptionStatsController)
)

/**
 * Description: Get pending prescriptions for verification
 * Path: /prescriptions/pending
 * Method: GET
 * Query: { page?, limit?, sort? }
 * Headers: { Authorization: Bearer <access_token> } (Pharmacist)
 * IMPORTANT: This route MUST be before /:prescriptionId to avoid matching "pending" as an ID
 */
prescriptionsRouter.get(
  '/pending',
  accessTokenValidator,
  authenticatePharmacist,
  wrapRequestHandler(getPendingPrescriptionsController)
)

/**
 * Description: Get pharmacist prescription management list across statuses
 * Path: /prescriptions/pharmacist
 * Method: GET
 * Query: { page?, limit?, status?, sort? }
 * Headers: { Authorization: Bearer <access_token> } (Pharmacist)
 */
prescriptionsRouter.get(
  '/pharmacist',
  accessTokenValidator,
  authenticatePharmacist,
  wrapRequestHandler(getPendingPrescriptionsController)
)

/**
 * Description: Scan prescription image via OCR Service
 * Path: /prescriptions/scan
 * Method: POST
 * Body: { imageUrl: string }
 * Headers: { Authorization: Bearer <access_token> }
 */
prescriptionsRouter.post('/scan', accessTokenValidator, wrapRequestHandler(scanPrescriptionController))

/**
 * Description: Get prescription by ID
 * Path: /prescriptions/:prescriptionId
 * Method: GET
 * Params: { prescriptionId: string }
 * Headers: { Authorization: Bearer <access_token> } (Customer)
 */
prescriptionsRouter.get('/:prescriptionId', accessTokenValidator, wrapRequestHandler(getPrescriptionByIdController))

/**
 * Description: Verify prescription (approve/reject)
 * Path: /prescriptions/:prescriptionId/verify
 * Method: PUT
 * Params: { prescriptionId: string }
 * Body: VerifyPrescriptionReqBody
 * Headers: { Authorization: Bearer <access_token> } (Pharmacist)
 */
prescriptionsRouter.put(
  '/:prescriptionId/verify',
  accessTokenValidator,
  authenticatePharmacist,
  checkLicense,
  wrapRequestHandler(verifyPrescriptionController)
)

export default prescriptionsRouter
