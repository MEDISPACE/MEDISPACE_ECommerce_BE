/**
 * Ensure and verify critical loyalty/coupon indexes.
 *
 * Usage:
 *   npx tsx scripts/verify-loyalty-coupon-indexes.ts
 */

import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'
import {
  ensureCriticalLoyaltyCouponIndexes,
  verifyCriticalLoyaltyCouponIndexes
} from '../src/services/loyaltyCouponIndexes.services'

dotenv.config()

const MONGODB_URI =
  process.env.MONGODB_URI ||
  `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@medispacedb.35qkwso.mongodb.net/?retryWrites=true&w=majority&appName=MediSpaceDB`
const DB_NAME = process.env.DB_NAME || 'medispace'

async function verifyIndexes() {
  if (!process.env.MONGODB_URI && (!process.env.DB_USERNAME || !process.env.DB_PASSWORD)) {
    throw new Error('Missing MONGODB_URI or DB_USERNAME/DB_PASSWORD environment variables')
  }

  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    const db = client.db(DB_NAME)

    await ensureCriticalLoyaltyCouponIndexes(db)
    const result = await verifyCriticalLoyaltyCouponIndexes(db)

    console.log(JSON.stringify({ ok: true, ...result }, null, 2))
  } finally {
    await client.close()
  }
}

verifyIndexes().catch((error) => {
  console.error(error)
  process.exit(1)
})
