import { config } from 'dotenv'
config()

import { MongoClient, ObjectId } from 'mongodb'
import { createHash } from 'crypto'

const DEFAULT_USERS = [
  {
    email: process.env.E2E_ADMIN_EMAIL || 'e2e.admin@medispace.local',
    password: process.env.E2E_ADMIN_PASSWORD || 'Admin123!aA',
    firstName: 'E2E',
    lastName: 'Admin',
    role: 2
  },
  {
    email: process.env.E2E_CUSTOMER_EMAIL || 'e2e.customer@medispace.local',
    password: process.env.E2E_CUSTOMER_PASSWORD || 'Customer123!aA',
    firstName: 'E2E',
    lastName: 'Customer',
    role: 0
  },
  {
    email: process.env.E2E_CUSTOMER2_EMAIL || 'e2e.customer2@medispace.local',
    password: process.env.E2E_CUSTOMER2_PASSWORD || 'Customer123!aA',
    firstName: 'E2E',
    lastName: 'Customer Two',
    role: 0
  }
]

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name} in env`)
  return value
}

function hashPassword(password: string) {
  const secret = requireEnv('PASSWORD_SECRET')
  return createHash('sha256').update(password + secret).digest('hex')
}

async function main() {
  const username = encodeURIComponent(requireEnv('DB_USERNAME'))
  const password = encodeURIComponent(requireEnv('DB_PASSWORD'))
  const dbName = requireEnv('DB_NAME')
  const uri = `mongodb+srv://${username}:${password}@medispacedb.35qkwso.mongodb.net/?retryWrites=true&w=majority&appName=MediSpaceDB`

  const client = new MongoClient(uri)
  await client.connect()

  try {
    const users = client.db(dbName).collection('users')
    const now = new Date()

    for (const user of DEFAULT_USERS) {
      const existing = await users.findOne({ email: user.email })
      const baseDoc = {
        email: user.email,
        password: hashPassword(user.password),
        role: user.role,
        status: 1,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.role === 2 ? '0900000000' : '0900000001',
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
        updatedAt: now,
        wishlist: []
      }

      if (existing?._id) {
        await users.updateOne({ _id: existing._id }, { $set: baseDoc })
        // eslint-disable-next-line no-console
        console.log(`[seed-e2e-users] updated ${user.email}`)
      } else {
        await users.insertOne({
          _id: new ObjectId(),
          ...baseDoc,
          createdAt: now,
          created_by: new ObjectId()
        })
        // eslint-disable-next-line no-console
        console.log(`[seed-e2e-users] created ${user.email}`)
      }
    }
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[seed-e2e-users] failed', error)
  process.exit(1)
})
