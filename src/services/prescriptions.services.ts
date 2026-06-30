import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import { PrescriptionStatus } from '~/constants/enum'
import {
  UploadPrescriptionReqBody,
  VerifyPrescriptionReqBody,
  PrescriptionQuery
} from '~/models/requests/Prescription.request'
import { PRESCRIPTIONS_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'
import notificationService from './notifications.services'
import { getIO } from '~/sockets/chat.socket'

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
      medications: body.medications.map((medication) => ({
        ...medication,
        productId:
          medication.productId && ObjectId.isValid(medication.productId)
            ? new ObjectId(medication.productId)
            : undefined
      })),
      status: 'pending', // lowercase for consistency
      verifiedBy: undefined,
      verifiedAt: undefined,
      rejectionReason: undefined,
      notes: undefined,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      createdAt: new Date(),
      updatedAt: new Date(),
      updateVerification: undefined, // Required by schema
      pharmacistNotes: undefined // Field for pharmacist notes
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await databaseService.prescriptions.insertOne(prescriptionData as any)

    // Notify all pharmacists: new prescription needs review (fire-and-forget)
    let io
    try {
      io = getIO()
    } catch {
      io = undefined
    }
    Promise.resolve(
      (notificationService as any).broadcastToRole?.(
        'pharmacist',
        {
          type: 'prescription',
          title: 'Đơn thuốc mới cần duyệt',
          message: `Đơn thuốc ${prescriptionNumber} vừa được tải lên, cần dược sĩ xem xét và xác nhận.`,
          actionUrl: '/pharmacist/prescriptions',
          metadata: { prescriptionNumber },
          eventKey: `prescription:${prescriptionData._id.toString()}:pharmacist:new`
        },
        io
      )
    ).catch(() => {})

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

      const filter: Record<string, string | ObjectId> = {}
      if (status) filter.status = status
      if (customerId) {
        // Validate ObjectId
        if (!ObjectId.isValid(customerId)) {
          throw new ErrorWithStatus({
            message: 'Invalid customer ID',
            status: HTTP_STATUS.BAD_REQUEST
          })
        }
        filter.customerId = new ObjectId(customerId)
      }

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
      throw error
    }
  }

  // Get prescription by ID with user info populated
  async getPrescriptionById(prescriptionId: string) {
    const prescriptions = await databaseService.prescriptions
      .aggregate([
        {
          $match: { _id: new ObjectId(prescriptionId) }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'customerId',
            foreignField: '_id',
            as: 'customerInfo'
          }
        },
        {
          $addFields: {
            customer: { $arrayElemAt: ['$customerInfo', 0] }
          }
        },
        {
          $project: {
            customerInfo: 0, // Remove the array field
            'customer.password': 0, // Remove sensitive fields
            'customer.forgotPasswordToken': 0,
            'customer.emailVerifyToken': 0
          }
        }
      ])
      .toArray()

    const prescription = prescriptions[0]

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

      // This endpoint is named /pending, so default to pending. Use status=all for the
      // pharmacist management page that intentionally needs the full list.
      const filter: Record<string, string> = {}
      if (status && status !== 'all') {
        filter.status = status
      } else if (!status) {
        filter.status = PrescriptionStatus.Pending
      }

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
      throw error
    }
  }

  // Verify prescription
  async verifyPrescription(prescriptionId: string, pharmacistId: ObjectId, body: VerifyPrescriptionReqBody) {
    const { status, notes } = body

    if (![PrescriptionStatus.Verified, PrescriptionStatus.Rejected].includes(status as PrescriptionStatus)) {
      throw new ErrorWithStatus({
        message: 'Invalid prescription verification status',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (status === PrescriptionStatus.Rejected && !notes?.trim()) {
      throw new ErrorWithStatus({
        message: 'Rejection reason is required',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (!ObjectId.isValid(prescriptionId)) {
      throw new ErrorWithStatus({
        message: PRESCRIPTIONS_MESSAGES.PRESCRIPTION_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    const updateData: Record<string, unknown> = {
      status: status === PrescriptionStatus.Verified ? PrescriptionStatus.Verified : PrescriptionStatus.Rejected,
      verifiedBy: pharmacistId,
      verifiedAt: new Date(),
      updatedAt: new Date()
    }

    if (notes) {
      updateData.pharmacistNotes = notes.trim() // Save notes to pharmacistNotes field
    }

    const updateResult = await databaseService.prescriptions.findOneAndUpdate(
      { _id: new ObjectId(prescriptionId), status: PrescriptionStatus.Pending },
      { $set: updateData },
      { returnDocument: 'after' }
    )

    if (!updateResult) {
      const existing = await databaseService.prescriptions.findOne({ _id: new ObjectId(prescriptionId) })
      throw new ErrorWithStatus({
        message: existing
          ? PRESCRIPTIONS_MESSAGES.PRESCRIPTION_ALREADY_VERIFIED
          : PRESCRIPTIONS_MESSAGES.PRESCRIPTION_NOT_FOUND,
        status: existing ? HTTP_STATUS.BAD_REQUEST : HTTP_STATUS.NOT_FOUND
      })
    }

    // Return the updated prescription with all fields including pharmacistNotes
    const updatedPrescription = await this.getPrescriptionById(prescriptionId)

    // Notify customer about prescription status (fire-and-forget)
    const customerId = updateResult.customerId
    if (customerId) {
      let io
      try {
        io = getIO()
      } catch {
        io = undefined
      }
      Promise.resolve(
        (notificationService as any).notifyPrescriptionStatus?.(
          customerId,
          new ObjectId(prescriptionId),
          status as 'verified' | 'rejected',
          io
        )
      ).catch(() => {})
    }

    return updatedPrescription
  }

  // Get prescription statistics
  async getPrescriptionStats() {
    try {
      // Use aggregation for efficient counting
      const stats = await databaseService.prescriptions
        .aggregate([
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ])
        .toArray()

      // Initialize counters
      const result = {
        pending: 0,
        verified: 0,
        rejected: 0,
        expired: 0,
        total: 0
      }

      // Map aggregation results to result object
      stats.forEach((stat) => {
        const status = stat._id.toLowerCase()
        const count = stat.count

        if (status === 'pending') result.pending = count
        else if (status === 'verified') result.verified = count
        else if (status === 'rejected') result.rejected = count
        else if (status === 'expired') result.expired = count

        result.total += count
      })

      return result
    } catch (error) {
      throw error
    }
  }
}

const prescriptionsService = new PrescriptionsService()
export default prescriptionsService
