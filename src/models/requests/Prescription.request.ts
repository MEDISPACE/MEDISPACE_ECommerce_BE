export interface Medication {
  productId?: string
  productName: string
  dosage: string
  quantity: number
  unit?: string
  instructions: string
  matchedName?: string
  slug?: string
  image?: string | null
  price?: number | null
  stockQuantity?: number
  requiresPrescription?: boolean
  activeIngredient?: string | null
  confidence?: string
  needsReview?: boolean
  source?: string
  reviewReason?: string
  equivalentProducts?: Array<{
    productId: string
    name: string
    slug: string
    image?: string | null
    price?: number | null
    unit?: string
    stockQuantity?: number
    requiresPrescription?: boolean
    activeIngredients?: string
    strength?: string
    dosageForm?: string
    reason?: string
  }>
}

export interface UploadPrescriptionReqBody {
  patientName?: string
  patientAge?: string
  patientGender?: string
  phoneNumber?: string
  diagnosis?: string
  specialNotes?: string
  doctorName: string
  hospitalName: string
  prescriptionDate: string // ISO date string
  medications: Medication[]
  images?: string[] // URLs of uploaded images
  ocrRawText?: string
  ocrConfidence?: string
  ocrExtractionMethod?: string
  ocrQuality?: Record<string, unknown>
}

export interface VerifyPrescriptionReqBody {
  status: 'verified' | 'rejected' // lowercase for consistency
  notes?: string
  corrections?: Partial<{
    patientName: string
    patientAge: string | number
    patientGender: string
    diagnosis: string
    doctorName: string
    hospitalName: string
    prescriptionDate: string
    medications: Medication[]
  }>
}

export interface PrescriptionQuery {
  status?: string
  page?: number
  limit?: number
  sort?: 'newest' | 'oldest'
}
