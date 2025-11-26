/**
 * Migration script to normalize prescription status values to lowercase
 * Run with: npx tsx scripts/migrate-prescription-status.ts
 */

import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

// Use same connection string as database.services.ts
const MONGODB_URI = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@medispacedb.35qkwso.mongodb.net/?retryWrites=true&w=majority&appName=MediSpaceDB`
const DB_NAME = process.env.DB_NAME || 'medispace'

async function migratePrescriptionStatus() {
  if (!process.env.DB_USERNAME || !process.env.DB_PASSWORD) {
    throw new Error('Missing DB_USERNAME or DB_PASSWORD environment variables')
  }

  const client = new MongoClient(MONGODB_URI)

  try {
    console.log('🔌 Connecting to MongoDB...')
    await client.connect()
    console.log('✅ Connected to MongoDB')

    const db = client.db(DB_NAME)
    const prescriptionsCollection = db.collection('prescriptions')

    // Count documents before migration
    const totalCount = await prescriptionsCollection.countDocuments()
    console.log(`📊 Total prescriptions: ${totalCount}`)

    // Find prescriptions with PascalCase status
    const needMigration = await prescriptionsCollection
      .find({
        status: { $in: ['Pending', 'Verified', 'Rejected', 'Expired'] }
      })
      .toArray()

    console.log(`🔄 Prescriptions to migrate: ${needMigration.length}`)

    if (needMigration.length === 0) {
      console.log('✅ No prescriptions need migration!')
      return
    }

    // Migrate each status
    const statusMapping = {
      Pending: 'pending',
      Verified: 'verified',
      Rejected: 'rejected',
      Expired: 'expired'
    }

    let migratedCount = 0

    for (const [oldStatus, newStatus] of Object.entries(statusMapping)) {
      const result = await prescriptionsCollection.updateMany(
        { status: oldStatus },
        { $set: { status: newStatus, updatedAt: new Date() } }
      )
      console.log(`  ✓ Migrated ${result.modifiedCount} prescriptions from '${oldStatus}' to '${newStatus}'`)
      migratedCount += result.modifiedCount
    }

    console.log(`\n✅ Migration completed! ${migratedCount} prescriptions updated.`)

    // Verify migration
    const afterMigration = await prescriptionsCollection
      .find({
        status: { $in: ['Pending', 'Verified', 'Rejected', 'Expired'] }
      })
      .toArray()

    if (afterMigration.length > 0) {
      console.warn(`⚠️ Warning: ${afterMigration.length} prescriptions still have PascalCase status`)
    } else {
      console.log('✅ All prescriptions now have lowercase status!')
    }
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  } finally {
    await client.close()
    console.log('🔌 Disconnected from MongoDB')
  }
}

// Run migration
migratePrescriptionStatus()
  .then(() => {
    console.log('🎉 Migration script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 Migration script failed:', error)
    process.exit(1)
  })
