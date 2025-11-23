import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import { ObjectId } from 'mongodb'
import { TokenPayload } from '~/models/requests/User.request'
import {
  UploadPrescriptionReqBody,
  VerifyPrescriptionReqBody,
  PrescriptionQuery
} from '~/models/requests/Prescription.request'
import { PRESCRIPTIONS_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'
import prescriptionsService from '~/services/prescriptions.services'

// Upload prescription - Customer
export const uploadPrescriptionController = async (
  req: Request<ParamsDictionary, unknown, UploadPrescriptionReqBody>,
  res: Response
) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const result = await prescriptionsService.uploadPrescription(new ObjectId(userId), req.body)
  return res.status(HTTP_STATUS.CREATED).json({
    message: PRESCRIPTIONS_MESSAGES.UPLOAD_PRESCRIPTION_SUCCESS,
    result
  })
}

// Get user's prescriptions - Customer
export const getPrescriptionsController = async (
  req: Request<ParamsDictionary, unknown, unknown, PrescriptionQuery>,
  res: Response
) => {
  try {
    const { userId } = req.decoded_authorization as TokenPayload
    console.log('getPrescriptionsController - userId:', userId)

    const result = await prescriptionsService.getPrescriptions({
      ...req.query,
      customerId: userId
    })

    return res.status(HTTP_STATUS.OK).json({
      message: PRESCRIPTIONS_MESSAGES.GET_PRESCRIPTIONS_SUCCESS,
      result
    })
  } catch (error) {
    console.error('getPrescriptionsController error:', error)
    throw error
  }
}

// Get prescription by ID - Customer
export const getPrescriptionByIdController = async (req: Request<{ prescriptionId: string }>, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const result = await prescriptionsService.getPrescriptionById(req.params.prescriptionId)

  // Check if prescription belongs to user
  if (result.customerId.toString() !== userId) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      message: 'Access denied'
    })
  }

  return res.status(HTTP_STATUS.OK).json({
    message: PRESCRIPTIONS_MESSAGES.GET_PRESCRIPTION_SUCCESS,
    result
  })
}

// Get pending prescriptions - Pharmacist
export const getPendingPrescriptionsController = async (
  req: Request<ParamsDictionary, unknown, unknown, PrescriptionQuery>,
  res: Response
) => {
  console.log('🔵 getPendingPrescriptionsController called')
  console.log('Query params:', req.query)
  console.log('User role:', req.decoded_authorization?.role)

  try {
    const result = await prescriptionsService.getPendingPrescriptions(req.query)
    return res.status(HTTP_STATUS.OK).json({
      message: PRESCRIPTIONS_MESSAGES.GET_PENDING_PRESCRIPTIONS_SUCCESS,
      result
    })
  } catch (error) {
    console.error('❌ getPendingPrescriptionsController error:', error)
    throw error
  }
}

// Verify prescription - Pharmacist
export const verifyPrescriptionController = async (
  req: Request<{ prescriptionId: string }, unknown, VerifyPrescriptionReqBody>,
  res: Response
) => {
  const pharmacist = req.pharmacist as { _id: ObjectId; firstName: string; lastName: string }
  const result = await prescriptionsService.verifyPrescription(req.params.prescriptionId, pharmacist._id, req.body)
  return res.status(HTTP_STATUS.OK).json({
    message: PRESCRIPTIONS_MESSAGES.VERIFY_PRESCRIPTION_SUCCESS,
    result
  })
}
