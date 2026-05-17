import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import { ObjectId } from 'mongodb'
import axios from 'axios'
import FormData from 'form-data'
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

// ★ Scan prescription via OCR Service proxy
const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://localhost:8001'

export const scanPrescriptionController = async (req: Request, res: Response) => {
  try {
    const { imageUrl } = req.body as { imageUrl: string }

    if (!imageUrl) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'imageUrl is required'
      })
    }

    // 1. Download image from the URL (e.g. S3)
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    })

    const contentType = imageResponse.headers['content-type'] || 'image/jpeg'
    const buffer = Buffer.from(imageResponse.data as ArrayBuffer)

    // Determine file extension from content-type
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp'
    }
    const ext = extMap[contentType] || 'jpg'

    // 2. Forward to OCR service as multipart upload
    const formData = new FormData()
    formData.append('file', buffer, {
      filename: `prescription.${ext}`,
      contentType: contentType
    })

    const ocrResponse = await axios.post(
      `${OCR_SERVICE_URL}/api/ocr/extract-prescription`,
      formData,
      {
        headers: formData.getHeaders(),
        timeout: 150000, // OCR + LLM can take up to ~50s
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    )

    const ocrData = ocrResponse.data

    // Map OCR medications to actual products in Database
    if (ocrData && Array.isArray(ocrData.medications)) {
      const enrichedMedications = await Promise.all(
        ocrData.medications.map(async (med: any) => {
          if (!med.productName) return med

          try {
            // Create a regex to match the product name
            // Escape special characters and create a case-insensitive, partial match regex
            const searchPattern = med.productName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const product = await databaseService.products.findOne({
              name: { $regex: new RegExp(searchPattern, 'i') },
              isActive: true
            })

            if (product) {
              return {
                ...med,
                productId: product._id,
                matchedName: product.name,
                image: product.featuredImage || (product.images && product.images.length > 0 ? product.images[0] : null)
              }
            }
          } catch (e) {
            console.error(`[OCR Map Product] Error mapping ${med.productName}:`, e)
          }
          return med
        })
      )
      ocrData.medications = enrichedMedications
    }

    return res.status(HTTP_STATUS.OK).json({
      message: 'Prescription scanned successfully',
      result: ocrData
    })
  } catch (error: any) {
    console.error('[scanPrescription] Error:', error?.message || error)

    // Forward OCR service errors
    if (error?.response?.data) {
      return res.status(error.response.status || HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        message: 'OCR service error',
        detail: error.response.data
      })
    }

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to scan prescription',
      detail: error?.message || 'Unknown error'
    })
  }
}
