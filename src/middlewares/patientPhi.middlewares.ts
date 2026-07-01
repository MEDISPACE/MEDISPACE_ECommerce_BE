import { NextFunction, Request, Response } from 'express'
import { ObjectId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { PrescriptionStatus } from '~/constants/enum'
import databaseService from '~/services/database.services'
import { ErrorWithStatus } from '~/models/Error'
import { TokenPayload } from '~/models/requests/User.request'

const PHI_WINDOW_MS = 60 * 1000
const PHI_MAX_REQUESTS = Number(process.env.PHARMACIST_PHI_RATE_LIMIT_PER_MINUTE || 60)
const buckets = new Map<string, { count: number; resetAt: number }>()

function currentPharmacistId(req: Request) {
  const token = req.decoded_authorization as TokenPayload | undefined
  return token?.userId ? new ObjectId(token.userId) : undefined
}

export const rateLimitPatientPhi = (req: Request, _res: Response, next: NextFunction) => {
  const pharmacistId = currentPharmacistId(req)
  if (!pharmacistId) return next()

  const key = `${pharmacistId.toString()}:${req.method}:${req.route?.path || req.path}`
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + PHI_WINDOW_MS })
    return next()
  }

  bucket.count += 1
  if (bucket.count > PHI_MAX_REQUESTS) {
    return next(
      new ErrorWithStatus({
        message: 'Too many patient PHI requests. Please slow down and retry shortly.',
        status: HTTP_STATUS.TOO_MANY_REQUESTS
      })
    )
  }

  return next()
}

export async function canAccessPatientPhi(pharmacistId: ObjectId, customerId: ObjectId) {
  const [activeConversation, relatedPrescription, createdOrder] = await Promise.all([
    databaseService.conversations.findOne({ customerId, pharmacistId, type: 'pharmacist', status: 'active' }, { projection: { _id: 1 } }),
    databaseService.prescriptions.findOne(
      {
        customerId,
        $or: [
          { status: PrescriptionStatus.Pending },
          { verifiedBy: pharmacistId }
        ]
      },
      { projection: { _id: 1 } }
    ),
    databaseService.orders.findOne({ userId: customerId, createdBy: pharmacistId }, { projection: { _id: 1 } })
  ])

  return Boolean(activeConversation || relatedPrescription || createdOrder)
}

export async function writePatientPhiAudit(req: Request, action: string, customerId?: ObjectId, extra: Record<string, unknown> = {}) {
  const pharmacistId = currentPharmacistId(req)
  if (!pharmacistId) return
  await databaseService.patientPhiAuditLogs.insertOne({
    pharmacistId,
    customerId,
    action,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent') || '',
    createdAt: new Date(),
    ...extra
  })
}

export const requirePatientPhiAccess = async (req: Request<{ customerId: string }>, _res: Response, next: NextFunction) => {
  try {
    const pharmacistId = currentPharmacistId(req)
    if (!pharmacistId || !ObjectId.isValid(req.params.customerId)) {
      return next(new ErrorWithStatus({ message: 'Patient not found', status: HTTP_STATUS.NOT_FOUND }))
    }

    const customerId = new ObjectId(req.params.customerId)
    const allowed = await canAccessPatientPhi(pharmacistId, customerId)
    await writePatientPhiAudit(req, 'patient_phi_access_attempt', customerId, { allowed })

    if (!allowed) {
      return next(new ErrorWithStatus({ message: 'Patient PHI access is not authorized for this pharmacist', status: HTTP_STATUS.FORBIDDEN }))
    }

    return next()
  } catch (error) {
    return next(error)
  }
}
