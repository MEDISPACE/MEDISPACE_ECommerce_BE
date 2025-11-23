import { Router } from 'express'
import {
  uploadPrescriptionController,
  getPrescriptionsController,
  getPrescriptionByIdController,
  getPendingPrescriptionsController,
  verifyPrescriptionController
} from '~/controllers/prescriptions.controllers'
import { wrapRequestHandler } from '~/utils/handlers'
import { accessTokenValidator } from '~/middlewares/users.middlewares'
import { authenticatePharmacist } from '~/middlewares/pharmacists.middlewares'

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
 * Description: Get prescription by ID
 * Path: /prescriptions/:prescriptionId
 * Method: GET
 * Params: { prescriptionId: string }
 * Headers: { Authorization: Bearer <access_token> } (Customer)
 */
prescriptionsRouter.get('/:prescriptionId', accessTokenValidator, wrapRequestHandler(getPrescriptionByIdController))

/**
 * Description: Get pending prescriptions for verification
 * Path: /prescriptions/pending
 * Method: GET
 * Query: { page?, limit?, sort? }
 * Headers: { Authorization: Bearer <access_token> } (Pharmacist)
 */
prescriptionsRouter.get(
  '/pending',
  accessTokenValidator,
  authenticatePharmacist,
  wrapRequestHandler(getPendingPrescriptionsController)
)

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
  wrapRequestHandler(verifyPrescriptionController)
)

export default prescriptionsRouter
