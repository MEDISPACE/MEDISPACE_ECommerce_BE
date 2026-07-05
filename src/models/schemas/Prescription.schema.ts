import { ObjectId } from 'mongodb'

export interface PrescriptionMedication {
  productId?: ObjectId
  productName: string
  dosage: string
  quantity: number
  unit?: string
  instructions: string
  matchedName?: string
  image?: string | null
  activeIngredient?: string | null
  confidence?: string
  needsReview?: boolean
  source?: string
  reviewReason?: string
}

export interface PharmacistSnapshot {
  _id: ObjectId
  firstName?: string
  lastName?: string
  fullName?: string
  email?: string
  phoneNumber?: string
  avatar?: string
  lisenseNumber?: string
  licenseNumber?: string
}

export interface PrescriptionType {
  _id?: ObjectId
  prescriptionNumber: string
  customerId: ObjectId

  // Basic Information
  patientName?: string
  patientAge?: string
  patientGender?: string
  phoneNumber?: string
  diagnosis?: string
  specialNotes?: string
  doctorName: string
  hospitalName?: string
  prescriptionDate: Date

  // Prescription Images
  images: string[] // Array of image URLs

  // Medications
  medications: PrescriptionMedication[]

  // Status & Verification
  status: string // 'pending' | 'verified' | 'rejected' | 'expired'
  verifiedBy?: ObjectId // Admin/Pharmacist who verified
  verifiedByInfo?: PharmacistSnapshot
  verifiedAt?: Date
  notes?: string // Verification or rejection notes
  correctedBy?: ObjectId
  correctedByInfo?: PharmacistSnapshot
  correctedAt?: Date

  // Validity
  validUntil?: Date

  // Timestamps
  createdAt?: Date
  updatedAt?: Date

  // Notes added by the pharmacist
  pharmacistNotes?: string // Notes added by the pharmacist

  // OCR metadata
  ocrRawText?: string
  ocrConfidence?: string
  ocrExtractionMethod?: string
  ocrQuality?: Record<string, unknown>
}

export default class Prescription {
  _id?: ObjectId
  prescriptionNumber: string
  customerId: ObjectId

  // Basic Information
  patientName?: string
  patientAge?: string
  patientGender?: string
  phoneNumber?: string
  diagnosis?: string
  specialNotes?: string
  doctorName: string
  hospitalName?: string
  prescriptionDate: Date

  // Prescription Images
  images: string[]

  // Medications
  medications: PrescriptionMedication[]

  // Status & Verification
  status: string
  verifiedBy?: ObjectId
  verifiedByInfo?: PharmacistSnapshot
  verifiedAt?: Date
  notes?: string
  correctedBy?: ObjectId
  correctedByInfo?: PharmacistSnapshot
  correctedAt?: Date

  // Validity
  validUntil?: Date

  // Timestamps
  createdAt?: Date
  updatedAt?: Date

  // Notes added by the pharmacist
  pharmacistNotes?: string

  // OCR metadata
  ocrRawText?: string
  ocrConfidence?: string
  ocrExtractionMethod?: string
  ocrQuality?: Record<string, unknown>

  constructor(prescription: PrescriptionType) {
    const date = new Date()

    this._id = prescription._id
    this.prescriptionNumber = prescription.prescriptionNumber
    this.customerId = prescription.customerId

    this.patientName = prescription.patientName
    this.patientAge = prescription.patientAge
    this.patientGender = prescription.patientGender
    this.phoneNumber = prescription.phoneNumber
    this.diagnosis = prescription.diagnosis
    this.specialNotes = prescription.specialNotes
    this.doctorName = prescription.doctorName
    this.hospitalName = prescription.hospitalName
    this.prescriptionDate = prescription.prescriptionDate

    this.images = prescription.images || []

    this.medications = prescription.medications || []

    this.status = prescription.status || 'pending'
    this.verifiedBy = prescription.verifiedBy
    this.verifiedByInfo = prescription.verifiedByInfo
    this.verifiedAt = prescription.verifiedAt
    this.notes = prescription.notes
    this.correctedBy = prescription.correctedBy
    this.correctedByInfo = prescription.correctedByInfo
    this.correctedAt = prescription.correctedAt
    this.pharmacistNotes = prescription.pharmacistNotes
    this.ocrRawText = prescription.ocrRawText
    this.ocrConfidence = prescription.ocrConfidence
    this.ocrExtractionMethod = prescription.ocrExtractionMethod
    this.ocrQuality = prescription.ocrQuality

    this.validUntil = prescription.validUntil

    this.createdAt = prescription.createdAt || date
    this.updatedAt = prescription.updatedAt || date
  }

  // Generate unique prescription number
  static generatePrescriptionNumber(): string {
    const timestamp = Date.now()
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0')
    return `PRE-${timestamp}-${random}`
  }

  // Check if prescription is valid
  isValid(): boolean {
    if (this.validUntil) {
      return new Date() <= this.validUntil
    }
    return true // If no expiry date, consider valid
  }

  // Update verification status
  updateVerification(verifiedBy: ObjectId, status: string, notes?: string) {
    this.verifiedBy = verifiedBy
    this.status = status
    this.verifiedAt = new Date()
    this.notes = notes
    this.updatedAt = new Date()
  }
}
