import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const makeId = () => new ObjectId().toString()
const USER_ID = makeId()
const ORDER_ID = makeId()

// ─── Mock environment ─────────────────────────────────────────────────────────
process.env.POINTS_PER_VND = '1000'
process.env.POINTS_MAX_REDEEM_RATIO = '0.3'

// ─── Mock databaseService ─────────────────────────────────────────────────────
const mockAccountFindOne = vi.fn()
const mockAccountInsertOne = vi.fn()
const mockAccountUpdateOne = vi.fn()
const mockAccountFindOneAndUpdate = vi.fn()
const mockAccountFind = vi.fn()

const mockTransactionFindOne = vi.fn()
const mockTransactionInsertOne = vi.fn()
const mockTransactionUpdateOne = vi.fn()
const mockTransactionFind = vi.fn()

vi.mock('~/services/database.services', () => {
  return {
    default: {
      loyaltyAccounts: {
        findOne: mockAccountFindOne,
        insertOne: mockAccountInsertOne,
        updateOne: mockAccountUpdateOne,
        findOneAndUpdate: mockAccountFindOneAndUpdate,
        find: mockAccountFind
      },
      loyaltyTransactions: {
        findOne: mockTransactionFindOne,
        insertOne: mockTransactionInsertOne,
        updateOne: mockTransactionUpdateOne,
        find: mockTransactionFind
      }
    }
  }
})

vi.mock('~/services/cache.services', () => ({
  default: {
    getOrSet: vi.fn((_key: string, fn: () => unknown) => fn()),
    invalidatePattern: vi.fn(),
    del: vi.fn()
  }
}))

const { default: loyaltyService } = await import('~/services/loyalty.services')

// ─── Factories ────────────────────────────────────────────────────────────────
const makeAccount = (overrides = {}) => ({
  _id: new ObjectId(),
  userId: new ObjectId(USER_ID),
  pointsBalance: 10000,
  totalPointsEarned: 10000,
  totalPointsRedeemed: 0,
  totalPointsExpired: 0,
  tier: 'member',
  totalSpent: 500000,
  ...overrides
})

describe('LoyaltyService', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('getOrCreateAccount()', () => {
    it('Trả về account hiện có', async () => {
      const acc = makeAccount()
      mockAccountFindOne.mockResolvedValueOnce(acc)
      const result = await loyaltyService.getOrCreateAccount(acc.userId)
      expect(result).toEqual(acc)
      expect(mockAccountInsertOne).not.toHaveBeenCalled()
    })

    it('Tạo account mới nếu chưa có', async () => {
      mockAccountFindOne.mockResolvedValueOnce(null)
      mockAccountInsertOne.mockResolvedValueOnce({ insertedId: new ObjectId() })
      
      const result = await loyaltyService.getOrCreateAccount(new ObjectId(USER_ID))
      expect(result.pointsBalance).toBe(0)
      expect(result.tier).toBe('member')
      expect(mockAccountInsertOne).toHaveBeenCalledTimes(1)
    })
  })

  describe('earnPointsFromOrder()', () => {
    it('Tích điểm thành công theo tier member (1x)', async () => {
      const acc = makeAccount({ tier: 'member' })
      mockTransactionFindOne.mockResolvedValueOnce(null) // idempotency
      mockAccountFindOne.mockResolvedValueOnce(acc) // getOrCreate
      mockTransactionInsertOne.mockResolvedValueOnce({ insertedId: new ObjectId() }) // transaction
      mockAccountUpdateOne.mockResolvedValueOnce({ modifiedCount: 1 }) // account update
      
      const orderTotal = 1500000 // 1.5M VNĐ
      // Formula: 1.5M / 1000 * 1 = 1500 điểm
      await loyaltyService.earnPointsFromOrder(new ObjectId(USER_ID), new ObjectId(ORDER_ID), orderTotal, 'ORD-123')

      // Check transaction insert
      expect(mockTransactionInsertOne.mock.calls[0][0]).toMatchObject({
        type: 'earn',
        points: 1500
      })
      // Check account update
      expect(mockAccountUpdateOne.mock.calls[0][1]).toEqual(
         expect.objectContaining({
            $inc: { totalPointsEarned: 1500 },
            $set: expect.objectContaining({ pointsBalance: 11500, tier: 'silver', totalSpent: 2000000 })
         })
      )
    })

    it('Tích điểm phụ thuộc vào tier multiplier (Platinum 2x)', async () => {
      const acc = makeAccount({ tier: 'platinum' })
      mockTransactionFindOne.mockResolvedValueOnce(null)
      mockAccountFindOne.mockResolvedValueOnce(acc)
      
      const orderTotal = 1000000 // 1M VNĐ
      // Formula: 1M / 1000 * 2 = 2000 điểm
      await loyaltyService.earnPointsFromOrder(new ObjectId(USER_ID), new ObjectId(ORDER_ID), orderTotal, 'ORD-123')

      expect(mockTransactionInsertOne.mock.calls[0][0]).toMatchObject({ points: 2000 })
    })

    it('Tự động up tier (checkAndUpgradeTier)', async () => {
      // User ban đầu member, nhưng cộng thêm 2 triệu tổng chi tiêu sẽ lên silver
      const acc = makeAccount({ tier: 'member', totalSpent: 0 })
      mockTransactionFindOne.mockResolvedValueOnce(null)
      mockAccountFindOne.mockResolvedValueOnce(acc)
      
      await loyaltyService.earnPointsFromOrder(new ObjectId(USER_ID), new ObjectId(ORDER_ID), 2000000, 'ORD-123')

      // 1 atomic update
      expect(mockAccountUpdateOne).toHaveBeenCalledTimes(1)
      // Check the $set object contains tier: silver
      expect(mockAccountUpdateOne.mock.calls[0][1].$set).toEqual(
         expect.objectContaining({ tier: 'silver' })
      )
    })
  })

  describe('redeemPoints()', () => {
    it('Lỗi nếu redeeem vượt quá số điểm cho phép (> 30% order total)', async () => {
      const acc = makeAccount({ pointsBalance: 500000 }) // So balance is enough

      // Total order = 1,000,000 -> Max points redeem = 300,000 điểm
      // Nhưng user muốn redeem 400,000
      await expect(loyaltyService.redeemPoints(
         new ObjectId(USER_ID), new ObjectId(ORDER_ID),
         400000, 1000000, 'ORD-123'
      )).rejects.toThrow('Chỉ được đổi tối đa')
    })

    it('Lỗi nếu không đủ điểm', async () => {
      mockAccountFindOneAndUpdate.mockResolvedValueOnce(null)

      // Trying to redeem 20k points
      await expect(loyaltyService.redeemPoints(
         new ObjectId(USER_ID), new ObjectId(ORDER_ID),
         20000, 1000000, 'ORD-123'
      )).rejects.toThrow('Không đủ điểm hoặc đang xử lý giao dịch khác. Vui lòng thử lại.')
    })

    it('Trừ điểm thành công', async () => {
      const acc = makeAccount({ pointsBalance: 50000 })
      mockAccountFindOneAndUpdate.mockResolvedValueOnce({ ...acc, pointsBalance: 0 })
      
      const res = await loyaltyService.redeemPoints(
         new ObjectId(USER_ID), new ObjectId(ORDER_ID),
         50000, 200000, 'ORD-123' // 50k points = 50k VNĐ (< 30% của 200k = 60k VNĐ)
      )

      expect(res).toBe(50000)
      
      expect(mockTransactionInsertOne.mock.calls[0][0]).toMatchObject({
         type: 'redeem',
         points: -50000
      })
      expect(mockAccountFindOneAndUpdate.mock.calls[0][1]).toEqual(
         expect.objectContaining({
            $inc: { pointsBalance: -50000, totalPointsRedeemed: 50000 },
            $set: expect.objectContaining({ updatedAt: expect.any(Date) })
         })
      )
    })

    it('Không rollback điểm nếu insert redeem transaction bị duplicate do retry', async () => {
      const acc = makeAccount({ pointsBalance: 50000 })
      mockTransactionFindOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ type: 'redeem', points: -50000 })
      mockAccountFindOneAndUpdate.mockResolvedValueOnce({ ...acc, pointsBalance: 0 })
      mockTransactionInsertOne.mockRejectedValueOnce({ code: 11000 })

      const res = await loyaltyService.redeemPoints(
        new ObjectId(USER_ID), new ObjectId(ORDER_ID),
        50000, 200000, 'ORD-123'
      )

      expect(res).toBe(50000)
      expect(mockAccountUpdateOne).not.toHaveBeenCalled()
    })

    it('Rollback điểm nếu insert redeem transaction lỗi thật không phải duplicate', async () => {
      const acc = makeAccount({ pointsBalance: 50000 })
      mockTransactionFindOne.mockResolvedValueOnce(null)
      mockAccountFindOneAndUpdate.mockResolvedValueOnce({ ...acc, pointsBalance: 0 })
      mockTransactionInsertOne.mockRejectedValueOnce(new Error('insert failed'))

      await expect(loyaltyService.redeemPoints(
        new ObjectId(USER_ID), new ObjectId(ORDER_ID),
        50000, 200000, 'ORD-123'
      )).rejects.toThrow('insert failed')

      expect(mockAccountUpdateOne).toHaveBeenCalledWith(
        { userId: new ObjectId(USER_ID) },
        {
          $inc: { pointsBalance: 50000, totalPointsRedeemed: -50000 },
          $set: { updatedAt: expect.any(Date) }
        }
      )
    })
  })

  describe('revokePointsForReturn()', () => {
    it('Thu hồi điểm khi trả hàng', async () => {
      const acc = makeAccount({ pointsBalance: 1500, totalSpent: 1500000 })
      // First is find account
      // Then check existing revoke, then find transaction earn
      mockAccountFindOne.mockResolvedValueOnce(acc)
      mockTransactionFindOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ type: 'earn', points: 1500 })
      
      const orderTotal = 1500000 // earns 1500
      await loyaltyService.revokePointsForReturn(new ObjectId(USER_ID), new ObjectId(ORDER_ID), orderTotal, 'ORD-123')

      expect(mockTransactionInsertOne.mock.calls[0][0]).toMatchObject({
         type: 'revoke',
         points: -1500,
         description: 'Thu hồi 1500 điểm do hoàn trả đơn ORD-123'
      })
      expect(mockAccountUpdateOne.mock.calls[0][1]).toEqual(
         expect.objectContaining({
            $set: expect.objectContaining({ pointsBalance: 0, totalSpent: 0, tier: 'member' })
         })
      )
    })
  })

  describe('refundRedeemedPointsForOrder()', () => {
    it('Hoàn lại điểm đã đổi nếu order bị hủy/thanh toán fail', async () => {
      const acc = makeAccount({ pointsBalance: 20000, totalPointsRedeemed: 50000 })
      mockTransactionFindOne
        .mockResolvedValueOnce({ type: 'redeem', points: -50000 })
        .mockResolvedValueOnce(null)
      mockAccountFindOneAndUpdate.mockResolvedValueOnce({ ...acc, pointsBalance: 70000 })

      await loyaltyService.refundRedeemedPointsForOrder(
        new ObjectId(USER_ID),
        new ObjectId(ORDER_ID),
        'ORD-123'
      )

      expect(mockAccountFindOneAndUpdate).toHaveBeenCalledWith(
        { userId: new ObjectId(USER_ID) },
        {
          $inc: {
            pointsBalance: 50000,
            totalPointsRedeemed: -50000
          },
          $set: { updatedAt: expect.any(Date) }
        },
        { returnDocument: 'after' }
      )
      expect(mockTransactionInsertOne.mock.calls[0][0]).toMatchObject({
        type: 'adjust',
        points: 50000,
        balanceAfter: 70000,
        description: 'Hoàn điểm đã đổi do đơn ORD-123 không hoàn tất'
      })
    })

    it('Không hoàn trùng nếu đã có transaction adjust hoàn điểm', async () => {
      mockTransactionFindOne
        .mockResolvedValueOnce({ type: 'redeem', points: -50000 })
        .mockResolvedValueOnce({ type: 'adjust', points: 50000 })

      await loyaltyService.refundRedeemedPointsForOrder(
        new ObjectId(USER_ID),
        new ObjectId(ORDER_ID),
        'ORD-123'
      )

      expect(mockAccountFindOneAndUpdate).not.toHaveBeenCalled()
      expect(mockTransactionInsertOne).not.toHaveBeenCalled()
    })

    it('Không rollback điểm nếu insert adjust bị duplicate do retry', async () => {
      const acc = makeAccount({ pointsBalance: 20000, totalPointsRedeemed: 50000 })
      mockTransactionFindOne
        .mockResolvedValueOnce({ type: 'redeem', points: -50000 })
        .mockResolvedValueOnce(null)
      mockAccountFindOneAndUpdate.mockResolvedValueOnce({ ...acc, pointsBalance: 70000 })
      mockTransactionInsertOne.mockRejectedValueOnce({ code: 11000 })

      await loyaltyService.refundRedeemedPointsForOrder(
        new ObjectId(USER_ID),
        new ObjectId(ORDER_ID),
        'ORD-123'
      )

      expect(mockAccountFindOneAndUpdate).toHaveBeenCalledTimes(1)
      expect(mockAccountUpdateOne).not.toHaveBeenCalled()
    })

    it('Rollback hoàn điểm nếu insert adjust lỗi thật không phải duplicate', async () => {
      const acc = makeAccount({ pointsBalance: 20000, totalPointsRedeemed: 50000 })
      mockTransactionFindOne
        .mockResolvedValueOnce({ type: 'redeem', points: -50000 })
        .mockResolvedValueOnce(null)
      mockAccountFindOneAndUpdate.mockResolvedValueOnce({ ...acc, pointsBalance: 70000 })
      mockTransactionInsertOne.mockRejectedValueOnce(new Error('insert failed'))

      await expect(loyaltyService.refundRedeemedPointsForOrder(
        new ObjectId(USER_ID),
        new ObjectId(ORDER_ID),
        'ORD-123'
      )).rejects.toThrow('insert failed')

      expect(mockAccountUpdateOne).toHaveBeenCalledWith(
        { userId: new ObjectId(USER_ID) },
        {
          $inc: {
            pointsBalance: -50000,
            totalPointsRedeemed: 50000
          },
          $set: { updatedAt: expect.any(Date) }
        }
      )
    })
  })
})
