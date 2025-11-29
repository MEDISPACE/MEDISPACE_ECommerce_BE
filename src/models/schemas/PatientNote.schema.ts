import { ObjectId } from 'mongodb'

interface PatientNoteType {
  _id?: ObjectId
  customer_id: ObjectId
  pharmacist_id: ObjectId
  note_type: 'consultation' | 'prescription_verification' | 'general'
  content: string
  related_prescription_id?: ObjectId
  created_at?: Date
  updated_at?: Date
}

export default class PatientNote {
  _id?: ObjectId
  customer_id: ObjectId
  pharmacist_id: ObjectId
  note_type: 'consultation' | 'prescription_verification' | 'general'
  content: string
  related_prescription_id?: ObjectId
  created_at?: Date
  updated_at?: Date

  constructor(note: PatientNoteType) {
    const date = new Date()
    this._id = note._id
    this.customer_id = note.customer_id
    this.pharmacist_id = note.pharmacist_id
    this.note_type = note.note_type
    this.content = note.content
    this.related_prescription_id = note.related_prescription_id
    this.created_at = note.created_at || date
    this.updated_at = note.updated_at || date
  }
}
