export interface Medication {
  productId?: string
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
