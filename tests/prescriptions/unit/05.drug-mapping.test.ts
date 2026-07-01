import { describe, expect, it } from 'vitest'
import { getDrugStockStatus, mapDrugToProduct } from '../helpers/domain'
import { productFixtures } from '../fixtures/products'

describe('Drug-to-product mapping', () => {
  it('returns match above confidence threshold', () => {
    const match = mapDrugToProduct({ productName: 'Amoxicillin 500mg', dosage: '500mg' }, [productFixtures.amoxicillin500 as any])
    expect(match?.product._id).toEqual(productFixtures.amoxicillin500._id)
    expect(match?.confidenceLevel).toBe('high')
  })

  it('returns null below confidence threshold', () => {
    expect(mapDrugToProduct({ productName: 'Unknown Drug 10mg', dosage: '10mg' }, [productFixtures.amoxicillin500 as any])).toBeNull()
  })

  it('flags low confidence distinctly when allowed by threshold', () => {
    const match = mapDrugToProduct({ productName: 'Amox 500mg', dosage: '500mg' }, [productFixtures.amoxicillin500 as any], 0.3)
    expect(match?.confidenceLevel).toBe('low')
  })

  it('does not silently exact-match different dosage variants', () => {
    expect(mapDrugToProduct({ productName: 'Amoxicillin 650mg', dosage: '650mg' }, [productFixtures.amoxicillin500 as any])).toBeNull()
  })

  it('matches equivalent names with accents/casing normalized', () => {
    const product = { ...(productFixtures.amoxicillin500 as any), name: 'ÁMOXICILLIN 500mg' }
    const match = mapDrugToProduct({ productName: 'amoxicillin 500mg', dosage: '500mg' }, [product])
    expect(match?.confidenceLevel).toBe('high')
  })

  it('does not match when product has no dosage but drug requires a different explicit dosage', () => {
    const product = { ...(productFixtures.amoxicillin500 as any), name: 'Amoxicillin', dosage: undefined }
    expect(mapDrugToProduct({ productName: 'Amoxicillin 650mg', dosage: '650mg' }, [product])).toBeNull()
  })

  it('getDrugStockStatus reflects current stock, not cached state', () => {
    const product = { ...(productFixtures.amoxicillin500 as any), stockQuantity: 1 }
    expect(getDrugStockStatus(product)).toBe('in_stock')
    product.stockQuantity = 0
    expect(getDrugStockStatus(product)).toBe('out_of_stock')
  })
})
