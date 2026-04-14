import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import { ObjectId } from 'mongodb'
import { UserRole } from '~/constants/enum'
import { TokenPayload } from '~/models/requests/User.request'
import {
  UploadPrescriptionReqBody,
  VerifyPrescriptionReqBody,
  PrescriptionQuery
} from '~/models/requests/Prescription.request'
import { PRESCRIPTIONS_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'
import prescriptionsService from '~/services/prescriptions.services'
import databaseService from '~/services/database.services'

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

    const result = await prescriptionsService.getPrescriptions({
      ...req.query,
      customerId: userId
    })

    return res.status(HTTP_STATUS.OK).json({
      message: PRESCRIPTIONS_MESSAGES.GET_PRESCRIPTIONS_SUCCESS,
      result
    })
  } catch (error) {
    throw error
  }
}

// Get prescription by ID - Customer (owner) or Pharmacist
export const getPrescriptionByIdController = async (req: Request<{ prescriptionId: string }>, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const result = await prescriptionsService.getPrescriptionById(req.params.prescriptionId)

  // Allow access if:
  // 1. User is the prescription owner (customer)
  // 2. User is a pharmacist (check via req.pharmacist set by authenticatePharmacist middleware)
  const isOwner = result.customerId.toString() === userId
  // If accessing as pharmacist, the pharmacist middleware would have set req.pharmacist
  // But since we don't require that middleware for this route, we check the user's role
  const pharmacist = req.pharmacist
  const isPharmacist = !!pharmacist

  if (!isOwner && !isPharmacist) {
    // If not owner, try to check if user is pharmacist by looking up in database
    const user = await databaseService.users.findOne({ _id: new ObjectId(userId) })
    const userIsPharmacist = user?.role === UserRole.Pharmacist

    if (!userIsPharmacist) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: PRESCRIPTIONS_MESSAGES.ACCESS_DENIED
      })
    }
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
  try {
    const result = await prescriptionsService.getPendingPrescriptions(req.query)
    return res.status(HTTP_STATUS.OK).json({
      message: PRESCRIPTIONS_MESSAGES.GET_PENDING_PRESCRIPTIONS_SUCCESS,
      result
    })
  } catch (error) {
    throw error
  }
}

// Verify prescription - Pharmacist
export const verifyPrescriptionController = async (
  req: Request<{ prescriptionId: string }, unknown, VerifyPrescriptionReqBody>,
  res: Response
) => {
  try {
    const pharmacist = req.pharmacist as { _id: ObjectId; firstName: string; lastName: string }
    const result = await prescriptionsService.verifyPrescription(req.params.prescriptionId, pharmacist._id, req.body)
    return res.status(HTTP_STATUS.OK).json({
      message: PRESCRIPTIONS_MESSAGES.VERIFY_PRESCRIPTION_SUCCESS,
      result
    })
  } catch (error) {
    throw error
  }
}

// Get prescription statistics - Pharmacist
export const getPrescriptionStatsController = async (req: Request, res: Response) => {
  try {
    const result = await prescriptionsService.getPrescriptionStats()

    return res.status(HTTP_STATUS.OK).json({
      message: PRESCRIPTIONS_MESSAGES.GET_PRESCRIPTION_STATS_SUCCESS,
      result
    })
  } catch (error) {
    throw error
  }
}
