import { ObjectId } from 'mongodb'

interface PatientMedicalInfoType {
  _id?: ObjectId
  customer_id: ObjectId
  blood_type?: string
  allergies: string[]
  chronic_diseases: string[]
  current_medications: Array<{
    drug_name: string
    dosage: string
    frequency: string
    start_date: Date
    end_date?: Date
  }>
  created_at?: Date
  updated_at?: Date
}

export default class PatientMedicalInfo {
  _id?: ObjectId
  customer_id: ObjectId
  blood_type?: string
  allergies: string[]
  chronic_diseases: string[]
  current_medications: Array<{
    drug_name: string
    dosage: string
    frequency: string
    start_date: Date
    end_date?: Date
  }>
  created_at?: Date
  updated_at?: Date

  constructor(medicalInfo: PatientMedicalInfoType) {
    const date = new Date()
    this._id = medicalInfo._id
    this.customer_id = medicalInfo.customer_id
    this.blood_type = medicalInfo.blood_type || ''
    this.allergies = medicalInfo.allergies || []
    this.chronic_diseases = medicalInfo.chronic_diseases || []
    this.current_medications = medicalInfo.current_medications || []
    this.created_at = medicalInfo.created_at || date
    this.updated_at = medicalInfo.updated_at || date
  }
}
