import { Db, ObjectId } from 'mongodb'

export interface BackfillCouponUsageOptions {
  couponsCollection: string
  couponRedemptionsCollection: string
}

export async function backfillCouponUserUsageCounts(
  db: Db,
  {
    couponsCollection,
    couponRedemptionsCollection
  }: BackfillCouponUsageOptions
) {
  const coupons = db.collection(couponsCollection)
  const couponRedemptions = db.collection(couponRedemptionsCollection)

  const grouped = await couponRedemptions
    .aggregate<{
      _id: { couponId: ObjectId; userId: ObjectId }
      count: number
    }>([
      {
        $group: {
          _id: { couponId: '$couponId', userId: '$userId' },
          count: { $sum: 1 }
        }
      }
    ])
    .toArray()

  const usageByCoupon = new Map<string, Record<string, number>>()
  const totalsByCoupon = new Map<string, number>()

  for (const row of grouped) {
    const couponId = row._id.couponId.toString()
    const userId = row._id.userId.toString()
    const usage = usageByCoupon.get(couponId) || {}
    usage[userId] = row.count
    usageByCoupon.set(couponId, usage)
    totalsByCoupon.set(couponId, (totalsByCoupon.get(couponId) || 0) + row.count)
  }

  const couponIdsWithRedemptions = Array.from(usageByCoupon.keys()).map((id) => new ObjectId(id))

  const resetResult = await coupons.updateMany(
    couponIdsWithRedemptions.length > 0 ? { _id: { $nin: couponIdsWithRedemptions } } : {},
    {
      $set: {
        userUsageCounts: {},
        currentUsageCount: 0,
        updatedAt: new Date()
      }
    }
  )

  let couponsUpdatedWithRedemptions = 0
  for (const [couponId, userUsageCounts] of usageByCoupon.entries()) {
    const result = await coupons.updateOne(
      { _id: new ObjectId(couponId) },
      {
        $set: {
          userUsageCounts,
          currentUsageCount: totalsByCoupon.get(couponId) || 0,
          updatedAt: new Date()
        }
      }
    )
    couponsUpdatedWithRedemptions += result.modifiedCount
  }

  const couponsMissingCounters = await coupons.countDocuments({
    $or: [{ userUsageCounts: { $exists: false } }, { currentUsageCount: { $exists: false } }]
  })

  if (couponsMissingCounters > 0) {
    throw new Error(`Backfill verification failed: ${couponsMissingCounters} coupons still miss usage counters`)
  }

  return {
    couponsResetWithoutRedemptions: resetResult.modifiedCount,
    couponsUpdatedWithRedemptions,
    redemptionGroups: grouped.length
  }
}
