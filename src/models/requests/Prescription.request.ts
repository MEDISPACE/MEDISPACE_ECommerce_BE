export interface Medication {
  productName: string
  dosage: string
  quantity: number
  instructions: string
}

export interface UploadPrescriptionReqBody {
  doctorName: string
  hospitalName: string
  prescriptionDate: string // ISO date string
  medications: Medication[]
  images?: string[] // URLs of uploaded images
}

export interface VerifyPrescriptionReqBody {
  status: 'verified' | 'rejected' // lowercase for consistency
  notes?: string
}

export interface PrescriptionQuery {
  status?: string
  page?: number
  limit?: number
  sort?: 'newest' | 'oldest'
}
