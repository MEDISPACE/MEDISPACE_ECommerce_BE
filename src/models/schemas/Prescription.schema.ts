import { ObjectId } from 'mongodb'

export interface PrescriptionMedication {
  productName: string
  dosage: string
  quantity: number
  instructions: string
}

export interface PrescriptionType {
  _id?: ObjectId
  prescriptionNumber: string
  customerId: ObjectId

  // Basic Information
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
  verifiedAt?: Date
  notes?: string // Verification or rejection notes

  // Validity
  validUntil?: Date

  // Timestamps
  createdAt?: Date
  updatedAt?: Date

  // Notes added by the pharmacist
  pharmacistNotes?: string // Notes added by the pharmacist
}

export default class Prescription {
  _id?: ObjectId
  prescriptionNumber: string
  customerId: ObjectId

  // Basic Information
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
  verifiedAt?: Date
  notes?: string

  // Validity
  validUntil?: Date

  // Timestamps
  createdAt?: Date
  updatedAt?: Date

  // Notes added by the pharmacist
  pharmacistNotes?: string

  constructor(prescription: PrescriptionType) {
    const date = new Date()

    this._id = prescription._id
    this.prescriptionNumber = prescription.prescriptionNumber
    this.customerId = prescription.customerId

    this.doctorName = prescription.doctorName
    this.hospitalName = prescription.hospitalName
    this.prescriptionDate = prescription.prescriptionDate

    this.images = prescription.images || []

    this.medications = prescription.medications || []

    this.status = prescription.status || 'pending'
    this.verifiedBy = prescription.verifiedBy
    this.verifiedAt = prescription.verifiedAt
    this.notes = prescription.notes
    this.pharmacistNotes = prescription.pharmacistNotes

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
