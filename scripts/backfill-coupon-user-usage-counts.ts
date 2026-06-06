/**
 * Backfill coupon.userUsageCounts from couponRedemptions.
 *
 * Usage:
 *   npx tsx scripts/backfill-coupon-user-usage-counts.ts
 */

import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'
import { backfillCouponUserUsageCounts } from '../src/services/couponUsageBackfill.services'

dotenv.config()

const MONGODB_URI =
  process.env.MONGODB_URI ||
  `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@medispacedb.35qkwso.mongodb.net/?retryWrites=true&w=majority&appName=MediSpaceDB`
const DB_NAME = process.env.DB_NAME || 'medispace'
const COUPONS_COLLECTION = process.env.DB_COUPONS_COLLECTION || 'coupons'
const COUPON_REDEMPTIONS_COLLECTION = process.env.DB_COUPON_REDEMPTIONS_COLLECTION || 'coupon_redemptions'

async function runBackfillCouponUserUsageCounts() {
  if (!process.env.MONGODB_URI && (!process.env.DB_USERNAME || !process.env.DB_PASSWORD)) {
    throw new Error('Missing MONGODB_URI or DB_USERNAME/DB_PASSWORD environment variables')
  }

  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    const db = client.db(DB_NAME)
    const result = await backfillCouponUserUsageCounts(db, {
      couponsCollection: COUPONS_COLLECTION,
      couponRedemptionsCollection: COUPON_REDEMPTIONS_COLLECTION
    })

    console.log(
      JSON.stringify(
        {
          ok: true,
          ...result
        },
        null,
        2
      )
    )
  } finally {
    await client.close()
  }
}

runBackfillCouponUserUsageCounts().catch((error) => {
  console.error(error)
  process.exit(1)
})
