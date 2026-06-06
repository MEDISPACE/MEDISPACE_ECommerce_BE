// Debug script - xem orders trong MongoDB
const { MongoClient, ObjectId } = require('mongodb')

const username = process.env.DB_USERNAME
const password = process.env.DB_PASSWORD
const dbName   = process.env.DB_NAME
const ordersCol = process.env.DB_ORDERS_COLLECTION || 'orders'
const usersCol  = process.env.USERS_COLLECTION || 'users'
const loyaltyCol = process.env.DB_LOYALTY_ACCOUNTS_COLLECTION || 'loyalty_accounts'

const uri = `mongodb+srv://${username}:${password}@medispacedb.35qkwso.mongodb.net/?retryWrites=true&w=majority&appName=MediSpaceDB`

async function run() {
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db(dbName)

  // 1. Total orders
  const totalOrders = await db.collection(ordersCol).countDocuments()
  console.log('[ORDERS] Total:', totalOrders)

  // 2. Sample order - xem schema
  const sampleOrder = await db.collection(ordersCol).findOne(
    {},
    { projection: { userId: 1, orderNumber: 1, orderStatus: 1, createdAt: 1 } }
  )
  console.log('[ORDERS] Sample:', JSON.stringify(sampleOrder, null, 2))

  // 3. Find user by email (Nguyen Huu Thong)
  const user = await db.collection(usersCol).findOne(
    { email: { $regex: 'thong', $options: 'i' } },
    { projection: { _id: 1, email: 1, name: 1 } }
  )
  console.log('[USER] Found:', JSON.stringify(user))

  if (user) {
    // 4. Orders của user này
    const userOrders = await db.collection(ordersCol)
      .find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(3)
      .toArray()
    console.log('[USER ORDERS] Count:', userOrders.length)
    userOrders.forEach(o => {
      console.log(' -', o.orderNumber, '|', o.orderStatus, '|', o.createdAt)
    })
  }

  // 5. Find the specific order ORD-1767014893436-927
  const specificOrder = await db.collection(ordersCol).findOne({ orderNumber: 'ORD-1767014893436-927' })
  console.log('[SPECIFIC ORDER] ORD-1767014893436-927:', specificOrder ? JSON.stringify({
    _id: specificOrder._id,
    userId: specificOrder.userId,
    orderStatus: specificOrder.orderStatus
  }) : 'NOT FOUND')

  await client.close()
}

run().catch(e => console.error('[ERROR]', e.message))
