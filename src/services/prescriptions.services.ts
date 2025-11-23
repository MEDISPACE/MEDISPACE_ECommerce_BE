import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import {
  UploadPrescriptionReqBody,
  VerifyPrescriptionReqBody,
  PrescriptionQuery,
  Medication
} from '~/models/requests/Prescription.request'
import { PRESCRIPTIONS_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'

// Type for database document (without methods)
type PrescriptionDocument = {
  _id: ObjectId
  prescriptionNumber: string
  customerId: ObjectId
  doctorName: string
  hospitalName: string
  prescriptionDate: Date
  images: string[]
  medications: any[]
  status: string
  verifiedBy: ObjectId | null
  verifiedAt: Date | null
  rejectionReason: string | null
  notes: string | null
  validUntil: Date
  createdAt: Date
  updatedAt: Date
}

class PrescriptionsService {
  // Generate unique prescription number
  private generatePrescriptionNumber(): string {
    const timestamp = Date.now()
    const randomNum = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0')
    return `PRE-${timestamp}-${randomNum}`
  }

  // Upload prescription
  async uploadPrescription(customerId: ObjectId, body: UploadPrescriptionReqBody) {
    const prescriptionNumber = this.generatePrescriptionNumber()

    const prescriptionData = {
      _id: new ObjectId(),
      prescriptionNumber,
      customerId,
      doctorName: body.doctorName,
      hospitalName: body.hospitalName,
      prescriptionDate: new Date(body.prescriptionDate),
      images: body.images || [],
      medications: body.medications,
      status: 'Pending',
      verifiedBy: null,
      verifiedAt: null,
      rejectionReason: null,
      notes: null,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const result = await databaseService.prescriptions.insertOne(prescriptionData as any)
    return {
      _id: result.insertedId,
      prescriptionNumber
    }
  }

  // Get prescriptions with pagination and filters
  async getPrescriptions(query: PrescriptionQuery & { customerId?: string }) {
    try {
      // Parse page and limit to ensure they're numbers
      const page = Number(query.page) || 1
      const limit = Number(query.limit) || 10
      const { status, sort = 'newest', customerId } = query

      console.log('getPrescriptions called with:', { page, limit, status, sort, customerId })

      const filter: Record<string, any> = {}
      if (status) filter.status = status
      if (customerId) {
        // Validate ObjectId
        if (!ObjectId.isValid(customerId)) {
          console.error('Invalid customerId:', customerId)
          throw new ErrorWithStatus({
            message: 'Invalid customer ID',
            status: HTTP_STATUS.BAD_REQUEST
          })
        }
        filter.customerId = new ObjectId(customerId)
      }

      console.log('Query filter:', filter)

      const sortOption: Record<string, 1 | -1> = sort === 'newest' ? { createdAt: -1 } : { createdAt: 1 }

      const skip = (page - 1) * limit

      const [prescriptions, total] = await Promise.all([
        databaseService.prescriptions.find(filter).sort(sortOption).skip(skip).limit(limit).toArray(),
        databaseService.prescriptions.countDocuments(filter)
      ])

      return {
        prescriptions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    } catch (error) {
      console.error('getPrescriptions error:', error)
      throw error
    }
  }

  // Get prescription by ID
  async getPrescriptionById(prescriptionId: string) {
    const prescription = await databaseService.prescriptions.findOne({
      _id: new ObjectId(prescriptionId)
    })

    if (!prescription) {
      throw new ErrorWithStatus({
        message: PRESCRIPTIONS_MESSAGES.PRESCRIPTION_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    return prescription
  }

  // Get pending prescriptions for pharmacist (now supports status filter)
  async getPendingPrescriptions(query: PrescriptionQuery) {
    try {
      const page = Number(query.page) || 1
      const limit = Number(query.limit) || 10
      const { status, sort = 'newest' } = query

      console.log('getPendingPrescriptions called with:', { page, limit, status, sort })

      // If status is provided, filter by it; otherwise show all prescriptions
      const filter: Record<string, any> = {}
      if (status) {
        filter.status = status
      }

      console.log('getPendingPrescriptions filter:', filter)

      const sortOption: Record<string, 1 | -1> = sort === 'newest' ? { createdAt: -1 } : { createdAt: 1 }

      const skip = (page - 1) * limit

      const [prescriptions, total] = await Promise.all([
        databaseService.prescriptions.find(filter).sort(sortOption).skip(skip).limit(limit).toArray(),
        databaseService.prescriptions.countDocuments(filter)
      ])

      console.log('getPendingPrescriptions result:', { total, count: prescriptions.length })

      return {
        prescriptions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    } catch (error) {
      console.error('❌ getPendingPrescriptions error:', error)
      throw error
    }
  }

  // Verify prescription
  async verifyPrescription(prescriptionId: string, pharmacistId: ObjectId, body: VerifyPrescriptionReqBody) {
    const { status, notes } = body

    // Check if prescription exists
    const prescription = await this.getPrescriptionById(prescriptionId)

    // Check if already verified
    if (prescription.status !== 'Pending') {
      throw new ErrorWithStatus({
        message: PRESCRIPTIONS_MESSAGES.PRESCRIPTION_ALREADY_VERIFIED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const updateData: Record<string, any> = {
      status: status === 'verified' ? 'Verified' : 'Rejected',
      verifiedBy: pharmacistId,
      verifiedAt: new Date(),
      updatedAt: new Date()
    }

    if (notes) {
      updateData.notes = notes
    }

    await databaseService.prescriptions.updateOne({ _id: new ObjectId(prescriptionId) }, { $set: updateData })

    return {
      prescriptionId,
      status: updateData.status,
      verifiedBy: pharmacistId,
      verifiedAt: updateData.verifiedAt
    }
  }
}

const prescriptionsService = new PrescriptionsService()
export default prescriptionsService
