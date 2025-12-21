/**
 * Script to update pharmacist account with license number
 * Run with: npx tsx scripts/update-pharmacist-license.ts
 */

import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

// Use same connection string as database.services.ts
const MONGODB_URI = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@medispacedb.35qkwso.mongodb.net/?retryWrites=true&w=majority&appName=MediSpaceDB`
const DB_NAME = process.env.DB_NAME || 'medispace'

async function updatePharmacistLicense() {
  if (!process.env.DB_USERNAME || !process.env.DB_PASSWORD) {
    throw new Error('Missing DB_USERNAME or DB_PASSWORD environment variables')
  }

  const client = new MongoClient(MONGODB_URI)

  try {
    console.log('🔌 Connecting to MongoDB...')
    await client.connect()
    console.log('✅ Connected to MongoDB')

    const db = client.db(DB_NAME)
    const usersCollection = db.collection('users')

    // Find all pharmacists (role = 1)
    const pharmacists = await usersCollection.find({ role: 1 }).toArray()
    console.log(`📊 Found ${pharmacists.length} pharmacist(s)`)

    if (pharmacists.length === 0) {
      console.log('⚠️ No pharmacists found in database')
      return
    }

    // Update each pharmacist
    let updatedCount = 0
    for (const pharmacist of pharmacists) {
      const pharmacistId = pharmacist._id as ObjectId
      const email = pharmacist.email as string

      // Generate license number based on email or ID
      const licenseNumber = `PH-${pharmacistId.toString().slice(-8).toUpperCase()}`

      const result = await usersCollection.updateOne(
        { _id: pharmacistId },
        {
          $set: {
            lisenseNumber: licenseNumber,
            isOnline: true, // Set online by default
            updatedAt: new Date()
          }
        }
      )

      if (result.modifiedCount > 0) {
        console.log(`  ✓ Updated pharmacist: ${email}`)
        console.log(`    License Number: ${licenseNumber}`)
        console.log(`    Online Status: true`)
        updatedCount++
      }
    }

    console.log(`\n✅ Updated ${updatedCount} pharmacist(s)`)

    // Verify updates
    const updatedPharmacists = await usersCollection
      .find(
        { role: 1 },
        {
          projection: {
            email: 1,
            lisenseNumber: 1,
            isOnline: 1
          }
        }
      )
      .toArray()

    console.log('\n📋 Current pharmacist licenses:')
    updatedPharmacists.forEach((p) => {
      console.log(`  - ${p.email}: ${p.lisenseNumber} (Online: ${p.isOnline})`)
    })
  } catch (error) {
    console.error('❌ Update failed:', error)
    throw error
  } finally {
    await client.close()
    console.log('🔌 Disconnected from MongoDB')
  }
}

// Run update
updatePharmacistLicense()
  .then(() => {
    console.log('🎉 Update script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 Update script failed:', error)
    process.exit(1)
  })
