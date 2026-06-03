import { config } from 'dotenv'
config()

import { MongoClient, ObjectId } from 'mongodb'
import { createHash } from 'crypto'

function sha256(content: string) {
  return createHash('sha256').update(content).digest('hex')
}

function hashPassword(password: string) {
  const secret = process.env.PASSWORD_SECRET
  if (!secret) throw new Error('Missing PASSWORD_SECRET in env')
  return sha256(password + secret)
}

function requireEnv(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing ${name} in env`)
  return v
}

async function main() {
  const DB_USERNAME = requireEnv('DB_USERNAME')
  const DB_PASSWORD = requireEnv('DB_PASSWORD')
  const DB_NAME = requireEnv('DB_NAME')

  const uri = `mongodb+srv://${encodeURIComponent(DB_USERNAME)}:${encodeURIComponent(
    DB_PASSWORD
  )}@medispacedb.35qkwso.mongodb.net/?retryWrites=true&w=majority&appName=MediSpaceDB`

  const client = new MongoClient(uri)
  await client.connect()

  try {
    const db = client.db(DB_NAME)
    const users = db.collection('users')

    const now = new Date()
    const stamp = Date.now()

    const email = process.env.DEV_ADMIN_EMAIL || `dev.admin.${stamp}@medispace.local`
    const password = process.env.DEV_ADMIN_PASSWORD || `Admin${stamp.toString().slice(-6)}!aA1`

    const existing = await users.findOne({ email })
    if (existing) {
      // eslint-disable-next-line no-console
      console.log(`[create-dev-admin] User already exists: ${email}`)
      // eslint-disable-next-line no-console
      console.log(`[create-dev-admin] Password (env or generated): ${password}`)
      return
    }

    const doc = {
      _id: new ObjectId(),
      email,
      password: hashPassword(password),
      role: 2, // Admin
      status: 1, // Verified
      firstName: 'Dev',
      lastName: 'Admin',
      phoneNumber: '0900000000',
      dateOfBirth: new Date('1990-01-01'),
      gender: 1,
      avatar: '',
      addresses: [],
      medicalProfile: {},
      lisenseNumber: '',
      isOnline: false,
      onlineCount: 0,
      emailVerifyToken: '',
      forgotPasswordToken: '',
      createdAt: now,
      updatedAt: now,
      wishlist: [],
      created_by: new ObjectId()
    }

    await users.insertOne(doc)

    // eslint-disable-next-line no-console
    console.log(`[create-dev-admin] ✅ Created admin: ${email}`)
    // eslint-disable-next-line no-console
    console.log(`[create-dev-admin] ✅ Password: ${password}`)
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[create-dev-admin] ❌ Error:', err)
  process.exit(1)
})
