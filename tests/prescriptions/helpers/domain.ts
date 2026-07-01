import { ObjectId } from 'mongodb'

export type PrescriptionStatus = 'pending' | 'verified' | 'rejected' | 'expired'
export type UrgencyLevel = 'low' | 'medium' | 'high'

export interface DrugItem {
  productName: string
  dosage?: string
  quantity: number
  instructions?: string
  productId?: ObjectId | string
  confidence?: number
}

export interface PrescriptionLike {
  _id?: ObjectId
  prescriptionNumber: string
  customerId: ObjectId
  doctorName: string
  hospitalName?: string
  patientName?: string
  patientAge?: string | number
  patientGender?: string
  diagnosis?: string
  images: string[]
  medications: DrugItem[]
  status: PrescriptionStatus
  createdAt: Date
  updatedAt?: Date
  validUntil?: Date
  verifiedAt?: Date
  verifiedBy?: ObjectId
  pharmacistNotes?: string
}

export const MIN_REJECT_REASON_LENGTH = 5

export function canTransition(from: PrescriptionStatus, to: PrescriptionStatus) {
  return from === 'pending' && (to === 'verified' || to === 'rejected')
}

export function isExpired(prescription: Pick<PrescriptionLike, 'status' | 'validUntil'>, now = new Date()) {
  return prescription.status === 'pending' && !!prescription.validUntil && prescription.validUntil.getTime() < now.getTime()
}

export function formatStatus(status: PrescriptionStatus) {
  return ({ pending: 'Chờ xử lý', verified: 'Đã duyệt', rejected: 'Từ chối', expired: 'Hết hạn' } as const)[status]
}

export function getUrgencyLevel(createdAt: Date, now = new Date()): UrgencyLevel {
  const diffHours = (now.getTime() - createdAt.getTime()) / 3600000
  if (diffHours > 24) return 'high'
  if (diffHours > 4) return 'medium'
  return 'low'
}

export function validateRejectReason(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return { ok: false, message: 'Rejection reason is required' }
  if (trimmed.length < MIN_REJECT_REASON_LENGTH) return { ok: false, message: 'Rejection reason is too short' }
  return { ok: true as const, value: trimmed }
}

export function validatePatientAge(value: number) {
  if (!Number.isFinite(value) || value < 0) return { ok: false, message: 'Invalid patient age' }
  if (value > 150) return { ok: false, message: 'Unrealistic patient age' }
  return { ok: true as const, value }
}

export function validateApproveAction(prescription: Pick<PrescriptionLike, 'status' | 'medications'>) {
  if (prescription.status !== 'pending') return { ok: false, message: 'Only pending prescriptions can be approved' }
  if (!prescription.medications || prescription.medications.length === 0) {
    return { ok: false, message: 'Prescription must contain at least one drug item' }
  }
  return { ok: true as const }
}

export function validateCorrectionPayload(corrections: Partial<Pick<PrescriptionLike, 'patientName' | 'patientAge' | 'patientGender' | 'diagnosis' | 'doctorName' | 'hospitalName' | 'medications'>>) {
  if (corrections.patientAge !== undefined) {
    const age = Number(corrections.patientAge)
    const ageValidation = validatePatientAge(age)
    if (!ageValidation.ok) return ageValidation
  }
  if (corrections.medications !== undefined) {
    if (!Array.isArray(corrections.medications) || corrections.medications.length === 0) {
      return { ok: false, message: 'Corrected medications must contain at least one item' }
    }
    for (const medication of corrections.medications) {
      if (!medication.productName?.trim()) return { ok: false, message: 'Medication name is required' }
      if (!Number.isFinite(Number(medication.quantity)) || Number(medication.quantity) <= 0) {
        return { ok: false, message: 'Medication quantity must be positive' }
      }
    }
  }
  return { ok: true as const }
}

export function validateOrderItemsAgainstPrescription(prescription: Pick<PrescriptionLike, 'medications'>, items: Array<{ productId: string; quantity: number }>) {
  const mapped = new Map(
    (prescription.medications || [])
      .filter((medication) => medication.productId)
      .map((medication) => [medication.productId!.toString(), Number(medication.quantity)])
  )
  for (const item of items) {
    if (!mapped.has(item.productId)) return { ok: false, message: 'Product is not mapped to this prescription' }
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) return { ok: false, message: 'Quantity must be positive' }
    if (item.quantity > mapped.get(item.productId)!) return { ok: false, message: 'Quantity exceeds prescription' }
  }
  return { ok: true as const }
}

export function vietnamDayRange(now = new Date()) {
  const offsetMs = 7 * 60 * 60 * 1000
  const vn = new Date(now.getTime() + offsetMs)
  const startUtc = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - offsetMs
  return { startDate: new Date(startUtc), endDate: new Date(startUtc + 24 * 60 * 60 * 1000) }
}

export function dateRangeFilter(kind: 'today' | '7days' | '30days', now = new Date()) {
  if (kind === 'today') return vietnamDayRange(now)
  const { endDate } = vietnamDayRange(now)
  const days = kind === '7days' ? 7 : 30
  return { startDate: new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000), endDate }
}

export function buildFilterQuery(params: { status?: PrescriptionStatus | 'all'; search?: string; dateRange?: { startDate: Date; endDate: Date } }) {
  const query: Record<string, unknown> = {}
  if (params.status && params.status !== 'all') query.status = params.status
  if (params.dateRange) query.createdAt = { $gte: params.dateRange.startDate, $lt: params.dateRange.endDate }
  if (params.search?.trim()) {
    const term = params.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    query.$or = [
      { prescriptionNumber: { $regex: term, $options: 'i' } },
      { doctorName: { $regex: term, $options: 'i' } },
      { customerId: { $regex: term, $options: 'i' } }
    ]
  }
  return query
}

export function buildAnchoredPatientSearchRegex(term: string) {
  return `^${term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
}

export function searchPrescriptions(items: PrescriptionLike[], term: string) {
  const q = term.trim().toLowerCase()
  return items.filter((item) => {
    return (
      item.prescriptionNumber.toLowerCase().includes(q) ||
      item.doctorName.toLowerCase().includes(q) ||
      item.customerId.toString().toLowerCase().includes(q)
    )
  })
}

export function runExpiryJob(items: PrescriptionLike[], now = new Date()) {
  let processed = 0
  for (const item of items) {
    if (isExpired(item, now)) {
      item.status = 'expired'
      item.updatedAt = now
      processed += 1
    }
  }
  return processed
}

export interface ProductLike {
  _id: ObjectId
  name: string
  dosage?: string
  stockQuantity: number
}

export function normalizeDrugName(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

export function extractDosage(value: string) {
  return value.match(/\b\d+(?:\.\d+)?\s*(?:mg|g|ml|mcg|iu|%)\b/i)?.[0].replace(/\s+/g, '').toLowerCase()
}

export function mapDrugToProduct(drug: { productName: string; dosage?: string }, products: ProductLike[], threshold = 0.75) {
  const drugDosage = drug.dosage?.replace(/\s+/g, '').toLowerCase() || extractDosage(drug.productName)
  const drugName = normalizeDrugName(drug.productName.replace(/\b\d+(?:\.\d+)?\s*(?:mg|g|ml|mcg|iu|%)\b/gi, ''))
  let best: { product: ProductLike; confidence: number; confidenceLevel: 'high' | 'low' } | null = null
  for (const product of products) {
    const productDosage = product.dosage?.replace(/\s+/g, '').toLowerCase() || extractDosage(product.name)
    if (drugDosage && productDosage && drugDosage !== productDosage) continue
    if (drugDosage && !productDosage) continue
    const productName = normalizeDrugName(product.name.replace(/\b\d+(?:\.\d+)?\s*(?:mg|g|ml|mcg|iu|%)\b/gi, ''))
    const exactName = productName === drugName
    const tokenMatch = productName.split(' ').every((token) => drugName.split(' ').includes(token))
    const partialName = productName.includes(drugName) || drugName.includes(productName)
    const confidence = exactName || tokenMatch ? 0.95 : partialName ? 0.65 : 0.4
    if (!best || confidence > best.confidence) best = { product, confidence, confidenceLevel: confidence >= 0.9 ? 'high' : 'low' }
  }
  return best && best.confidence >= threshold ? best : null
}

export function getDrugStockStatus(product: ProductLike) {
  return product.stockQuantity > 0 ? 'in_stock' : 'out_of_stock'
}
