import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAxiosGet = vi.fn()
const mockAxiosPost = vi.fn()

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: mockAxiosGet,
      post: mockAxiosPost
    }))
  }
}))

const originalEnv = { ...process.env }

const hcmPayload = {
  toAddress: '01 Vo Van Ngan',
  toWard: 'Phuong Linh Chieu',
  toDistrict: 'Thanh pho Thu Duc',
  toProvince: 'TP. Ho Chi Minh',
  weight: 500,
  orderValue: 100000
}

async function importProviders() {
  vi.resetModules()
  const [{ GHTKShippingProvider }, { AhamoveShippingProvider }] = await Promise.all([
    import('~/services/shipping/ghtk.provider'),
    import('~/services/shipping/ahamove.provider')
  ])
  return { GHTKShippingProvider, AhamoveShippingProvider }
}

describe('shipping providers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
  })

  it('GHTK uses the final fee returned by fee.fee, which includes insurance in current API responses', async () => {
    process.env.GHTK_TOKENS = 'ghtk-token-1'
    process.env.GHTK_PICK_ADDRESS = '01 Vo Van Ngan'
    process.env.GHTK_PICK_WARD = 'Phuong Linh Chieu'
    process.env.GHTK_PICK_DISTRICT = 'Thanh pho Thu Duc'
    process.env.GHTK_PICK_PROVINCE = 'TP. Ho Chi Minh'
    mockAxiosGet.mockResolvedValueOnce({
      data: {
        success: true,
        fee: {
          fee: 56905,
          ship_fee_only: 30000,
          insurance_fee: 25000
        }
      }
    })

    const { GHTKShippingProvider } = await importProviders()
    const rate = await new GHTKShippingProvider().calculateRate({ ...hcmPayload, orderValue: 5000000 }, 'road')

    expect(rate?.price).toBe(56905)
    expect(mockAxiosGet).toHaveBeenCalledWith('/services/shipment/fee', expect.objectContaining({
      headers: { Token: 'ghtk-token-1' },
      params: expect.objectContaining({ weight: 500, value: 5000000, transport: 'road' })
    }))
  })

  it('Ahamove sends unprefixed service codes and maps the city-prefixed service_id from the response', async () => {
    process.env.AHAMOVE_TOKENS = 'ahamove-token-1'
    process.env.AHAMOVE_SERVICES = 'BIKE,ECO'
    process.env.AHAMOVE_SAME_PROVINCE_ONLY = 'true'
    process.env.AHAMOVE_PICK_ADDRESS = '01 Vo Van Ngan'
    process.env.AHAMOVE_PICK_WARD = 'Phuong Linh Chieu'
    process.env.AHAMOVE_PICK_DISTRICT = 'Thanh pho Thu Duc'
    process.env.AHAMOVE_PICK_PROVINCE = 'TP HCM'
    process.env.AHAMOVE_PICK_MOBILE = '84946826098'
    mockAxiosPost
      .mockResolvedValueOnce({ data: { token: 'generated-ahamove-token', expires_in: 3600 } })
      .mockResolvedValueOnce({ data: [{ service_id: 'SGN-BIKE', data: { total_fee: 16000 }, error: null }] })

    const { AhamoveShippingProvider } = await importProviders()
    const rate = await new AhamoveShippingProvider().calculateRate(hcmPayload, 'BIKE')

    expect(rate).toMatchObject({ id: 'ahamove:BIKE', provider: 'ahamove', serviceCode: 'BIKE', price: 16000 })
    expect(mockAxiosPost).toHaveBeenNthCalledWith(1, '/v3/accounts/token', {
      mobile: '84946826098',
      api_key: 'ahamove-token-1'
    })
    expect(mockAxiosPost).toHaveBeenNthCalledWith(2, '/v3/orders/estimates', expect.objectContaining({
      group_services: [{ _id: 'BIKE', group_requests: [] }],
      payment_method: 'CASH'
    }), expect.objectContaining({ headers: { Authorization: 'Bearer generated-ahamove-token' } }))
  })

  it('Ahamove same-province filter accepts common Ho Chi Minh aliases', async () => {
    process.env.AHAMOVE_TOKENS = 'ahamove-token-1'
    process.env.AHAMOVE_PICK_ADDRESS = '01 Vo Van Ngan'
    process.env.AHAMOVE_PICK_WARD = 'Phuong Linh Chieu'
    process.env.AHAMOVE_PICK_DISTRICT = 'Thanh pho Thu Duc'
    process.env.AHAMOVE_PICK_PROVINCE = 'TP HCM'
    process.env.AHAMOVE_PICK_MOBILE = '84946826098'
    mockAxiosPost
      .mockResolvedValueOnce({ data: { token: 'generated-ahamove-token', expires_in: 3600 } })
      .mockResolvedValueOnce({ data: [{ service_id: 'SGN-BIKE', data: { total_fee: 16000 } }] })

    const { AhamoveShippingProvider } = await importProviders()
    const rate = await new AhamoveShippingProvider().calculateRate({ ...hcmPayload, toProvince: 'TP. Ho Chi Minh' }, 'BIKE')

    expect(rate?.price).toBe(16000)
    expect(mockAxiosPost).toHaveBeenCalledTimes(2)
  })

  it('Ahamove same-province filter hides cross-province options before calling Ahamove', async () => {
    process.env.AHAMOVE_TOKENS = 'ahamove-token-1'
    process.env.AHAMOVE_PICK_ADDRESS = '01 Vo Van Ngan'
    process.env.AHAMOVE_PICK_WARD = 'Phuong Linh Chieu'
    process.env.AHAMOVE_PICK_DISTRICT = 'Thanh pho Thu Duc'
    process.env.AHAMOVE_PICK_PROVINCE = 'TP. Ho Chi Minh'
    process.env.AHAMOVE_PICK_MOBILE = '84946826098'

    const { AhamoveShippingProvider } = await importProviders()
    const rate = await new AhamoveShippingProvider().calculateRate({ ...hcmPayload, toProvince: 'Nghe An' }, 'BIKE')

    expect(rate).toBeNull()
    expect(mockAxiosPost).not.toHaveBeenCalled()
  })
})
