/**
 * Script kiểm tra data statistics trong MongoDB
 * Mục đích: xác định threshold phù hợp cho ML recommendation
 * Chạy: npx ts-node src/scripts/check-db-stats.ts
 */
import { MongoClient } from 'mongodb'
import { config } from 'dotenv'

config()

const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@medispacedb.35qkwso.mongodb.net/?retryWrites=true&w=majority&appName=MediSpaceDB`

async function checkStats() {
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db(process.env.DB_NAME)

  console.log('\n===== MEDISPACE DATABASE STATS =====\n')

  // 1. Counts
  const [users, products, orders, reviews, carts, prescriptions] = await Promise.all([
    db.collection('users').countDocuments(),
    db.collection('products').countDocuments(),
    db.collection('orders').countDocuments(),
    db.collection('reviews').countDocuments(),
    db.collection('carts').countDocuments(),
    db.collection('prescriptions').countDocuments(),
  ])

  console.log('📊 Collection Counts:')
  console.log(`  users:         ${users}`)
  console.log(`  products:      ${products}`)
  console.log(`  orders:        ${orders}`)
  console.log(`  reviews:       ${reviews}`)
  console.log(`  carts:         ${carts}`)
  console.log(`  prescriptions: ${prescriptions}`)

  // 2. Users with ≥1 order (for SVD threshold)
  const usersWithOrders = await db.collection('orders').distinct('userId')
  console.log(`\n🎯 SVD Threshold Check:`)
  console.log(`  Users with ≥1 order: ${usersWithOrders.length} (need ≥10 for SVD)`)
  console.log(`  SVD ready: ${usersWithOrders.length >= 10 ? '✅ YES' : '❌ NO — will use Trending fallback'}`)

  // 3. Unique transactions for FP-Growth
  const uniqueOrders = await db.collection('orders').countDocuments()
  console.log(`\n🛒 FP-Growth Threshold Check:`)
  console.log(`  Total transactions: ${uniqueOrders} (need ≥50 for FP-Growth)`)
  console.log(`  FP-Growth ready: ${uniqueOrders >= 50 ? '✅ YES' : '❌ NO — will use TF-IDF fallback'}`)

  // 4. Avg items per order
  const avgItemsResult = await db.collection('orders').aggregate([
    { $project: { itemCount: { $size: '$items' } } },
    { $group: { _id: null, avg: { $avg: '$itemCount' }, max: { $max: '$itemCount' } } }
  ]).toArray()
  const avgItems = avgItemsResult[0]
  if (avgItems) {
    console.log(`\n📦 Order Basket Analysis:`)
    console.log(`  Avg items/order: ${avgItems.avg?.toFixed(1)}`)
    console.log(`  Max items/order: ${avgItems.max}`)
    console.log(`  FP-Growth meaningful: ${avgItems.avg >= 1.5 ? '✅ YES' : '⚠️  Low — mostly single-item orders'}`)
  }

  // 5. Products per category
  const categoryStats = await db.collection('products').aggregate([
    { $group: { _id: '$categoryId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 }
  ]).toArray()
  console.log(`\n🏷️  Top 5 Categories by Product Count:`)
  categoryStats.forEach((c, i) => console.log(`  ${i+1}. ${c._id?.toString().slice(-6)} → ${c.count} products`))

  // 6. Reviews quality
  const approvedReviews = await db.collection('reviews').countDocuments({ status: 'approved' })
  console.log(`\n⭐ Reviews:`)
  console.log(`  Approved reviews: ${approvedReviews}`)
  console.log(`  Useful for SVD: ${approvedReviews >= 20 ? '✅ YES' : '⚠️  Limited'}`)

  // 7. Product details available
  const productDetails = await db.collection('productDetails').countDocuments()
  console.log(`\n💊 Content-Based Readiness:`)
  console.log(`  Products with details: ${productDetails}/${products}`)
  console.log(`  TF-IDF quality: ${productDetails >= products * 0.5 ? '✅ Good' : '⚠️  Many products missing details'}`)

  console.log('\n===== RECOMMENDATION READINESS SUMMARY =====')
  console.log(`  ① SVD Personalized:     ${usersWithOrders.length >= 10 ? '✅ READY' : '⏳ FALLBACK (Trending)'}`)
  console.log(`  ② TF-IDF Related:       ✅ ALWAYS READY`)
  console.log(`  ③ FP-Growth BoughtWith: ${uniqueOrders >= 50 ? '✅ READY' : '⏳ FALLBACK (TF-IDF)'}`)
  console.log(`  ④ NMF Trending:         ${orders >= 10 ? '✅ READY' : '⏳ FALLBACK (Rating sort)'}`)
  console.log('\n')

  await client.close()
}

checkStats().catch(console.error)
