import { describe, expect, it } from 'vitest'
import { validateApproveAction, validateCorrectionPayload, validateOrderItemsAgainstPrescription, validatePatientAge, validateRejectReason } from '../helpers/domain'
import { productIds } from '../fixtures/products'

describe('Prescription validation rules', () => {
  it('reject reason fails on empty, whitespace, and too-short strings', () => {
    expect(validateRejectReason('').ok).toBe(false)
    expect(validateRejectReason('   ').ok).toBe(false)
    expect(validateRejectReason('bad').ok).toBe(false)
  })

  it('reject reason passes on valid reason', () => {
    expect(validateRejectReason('Ảnh đơn thuốc bị mờ').ok).toBe(true)
  })

  it('patient age validates medical-safe range', () => {
    expect(validatePatientAge(-1).ok).toBe(false)
    expect(validatePatientAge(151).ok).toBe(false)
    expect(validatePatientAge(32).ok).toBe(true)
  })

  it('approve action requires pending status', () => {
    expect(validateApproveAction({ status: 'verified', medications: [{ productName: 'A', quantity: 1 }] }).ok).toBe(false)
  })

  it('approve action requires at least one drug item', () => {
    expect(validateApproveAction({ status: 'pending', medications: [] }).ok).toBe(false)
    expect(validateApproveAction({ status: 'pending', medications: [{ productName: 'A', quantity: 1 }] }).ok).toBe(true)
  })

  it('correction payload rejects unsafe patient age values', () => {
    expect(validateCorrectionPayload({ patientAge: '-1' }).ok).toBe(false)
    expect(validateCorrectionPayload({ patientAge: '151' }).ok).toBe(false)
    expect(validateCorrectionPayload({ patientAge: '32' }).ok).toBe(true)
  })

  it('correction payload requires at least one valid medication when medications are supplied', () => {
    expect(validateCorrectionPayload({ medications: [] }).ok).toBe(false)
    expect(validateCorrectionPayload({ medications: [{ productName: ' ', quantity: 1 }] }).ok).toBe(false)
    expect(validateCorrectionPayload({ medications: [{ productName: 'Amoxicillin 500mg', quantity: 0 }] }).ok).toBe(false)
    expect(validateCorrectionPayload({ medications: [{ productName: 'Amoxicillin 500mg', quantity: 1 }] }).ok).toBe(true)
  })

  it('order items may include arbitrary products but mapped prescription quantities are capped', () => {
    const prescription = { medications: [{ productName: 'Amoxicillin', quantity: 2, productId: productIds.amoxicillin500 }] }
    expect(validateOrderItemsAgainstPrescription(prescription, [{ productId: productIds.wrongExtra.toString(), quantity: 1 }]).ok).toBe(true)
    expect(validateOrderItemsAgainstPrescription(prescription, [{ productId: productIds.amoxicillin500.toString(), quantity: 0 }]).ok).toBe(false)
    expect(validateOrderItemsAgainstPrescription(prescription, [{ productId: productIds.amoxicillin500.toString(), quantity: 3 }]).ok).toBe(false)
    expect(validateOrderItemsAgainstPrescription(prescription, [{ productId: productIds.amoxicillin500.toString(), quantity: 2 }]).ok).toBe(true)
  })
})
