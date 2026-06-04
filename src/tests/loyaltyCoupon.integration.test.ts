import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MongoClient, ObjectId, type Db } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import {
  ensureCriticalLoyaltyCouponIndexes,
  verifyCriticalLoyaltyCouponIndexes
} from '~/services/loyaltyCouponIndexes.services'
import { backfillCouponUserUsageCounts } from '~/services/couponUsageBackfill.services'

describe('loyalty/coupon MongoDB integration', () => {
  let mongod: MongoMemoryServer
  let client: MongoClient
  let db: Db

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create()
    client = new MongoClient(mongod.getUri())
    await client.connect()
    db = client.db('medispace_loyalty_coupon_test')
  }, 30000)

  afterAll(async () => {
    await client.close()
    await mongod.stop()
  })

  it('creates and verifies critical unique indexes with real MongoDB semantics', async () => {
    await ensureCriticalLoyaltyCouponIndexes(db)
    await expect(verifyCriticalLoyaltyCouponIndexes(db)).resolves.toEqual({ verifiedCount: 5 })

    const couponId = new ObjectId()
    const userId = new ObjectId()
    const orderId = new ObjectId()

    await db.collection('coupon_redemptions').insertOne({
      couponId,
      couponCode: 'SAVE10',
      userId,
      orderId,
      discountAmount: 10000
    })

    await expect(
      db.collection('coupon_redemptions').insertOne({
        couponId,
        couponCode: 'SAVE10',
        userId,
        orderId,
        discountAmount: 10000
      })
    ).rejects.toMatchObject({ code: 11000 })

    await db.collection('loyalty_transactions').insertOne({
      userId,
      orderId,
      type: 'redeem',
      points: -10000,
      balanceAfter: 90000,
      description: 'redeem'
    })

    await expect(
      db.collection('loyalty_transactions').insertOne({
        userId,
        orderId,
        type: 'redeem',
        points: -10000,
        balanceAfter: 90000,
        description: 'redeem retry'
      })
    ).rejects.toMatchObject({ code: 11000 })
  })

  it('backfills coupon userUsageCounts and currentUsageCount from redemptions', async () => {
    await db.collection('coupons').deleteMany({})
    await db.collection('coupon_redemptions').deleteMany({})

    const couponA = new ObjectId()
    const couponB = new ObjectId()
    const user1 = new ObjectId()
    const user2 = new ObjectId()

    await db.collection('coupons').insertMany([
      { _id: couponA, code: 'A', currentUsageCount: 999, userUsageCounts: { stale: 999 } },
      { _id: couponB, code: 'B', currentUsageCount: 999, userUsageCounts: { stale: 999 } }
    ])
    await db.collection('coupon_redemptions').insertMany([
      { couponId: couponA, couponCode: 'A', userId: user1, orderId: new ObjectId(), discountAmount: 1000 },
      { couponId: couponA, couponCode: 'A', userId: user1, orderId: new ObjectId(), discountAmount: 1000 },
      { couponId: couponA, couponCode: 'A', userId: user2, orderId: new ObjectId(), discountAmount: 1000 }
    ])

    await expect(
      backfillCouponUserUsageCounts(db, {
        couponsCollection: 'coupons',
        couponRedemptionsCollection: 'coupon_redemptions'
      })
    ).resolves.toEqual({
      couponsResetWithoutRedemptions: 1,
      couponsUpdatedWithRedemptions: 1,
      redemptionGroups: 2
    })

    const updatedCouponA = await db.collection('coupons').findOne({ _id: couponA })
    const updatedCouponB = await db.collection('coupons').findOne({ _id: couponB })

    expect(updatedCouponA).toMatchObject({
      currentUsageCount: 3,
      userUsageCounts: {
        [user1.toString()]: 2,
        [user2.toString()]: 1
      }
    })
    expect(updatedCouponB).toMatchObject({
      currentUsageCount: 0,
      userUsageCounts: {}
    })
  })
})
