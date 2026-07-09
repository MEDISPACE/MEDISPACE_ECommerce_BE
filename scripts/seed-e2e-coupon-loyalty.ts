/**
 * seed-e2e-coupon-loyalty.ts
 *
 * Deterministic seed for E2E Coupon + Loyalty tests.
 * Idempotent: safe to run multiple times — upserts not inserts.
 *
 * What this creates:
 *  - E2E product with known price (100,000đ, stock=50, code=E2E-PROD-001)
 *  - E2E product 2 with known price (200,000đ, stock=50, code=E2E-PROD-002)
 *  - Loyalty account for e2e.customer with 50,000 points (enough to test redeem)
 *  - Loyalty account for e2e.customer2 with 0 points (to test "not enough")
 *  - Default coupon set (see COUPONS array below)
 *
 * Usage: npm run seed:e2e:coupon-loyalty
 */

import { config } from 'dotenv'
config()

import { MongoClient, ObjectId } from 'mongodb'

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env: ${name}`)
  return value
}

// ── Constants (mirror env) ─────────────────────────────────────────────────

const POINTS_PER_VND = parseInt(process.env.POINTS_PER_VND || '1000')
const E2E_PRODUCT_PRICE_1 = 100_000  // 100k
const E2E_PRODUCT_PRICE_2 = 200_000  // 200k
const E2E_SEED_POINTS = 50_000       // 50k điểm = 50k VNĐ khi đổi
const E2E_PRODUCT_STOCK = 100

// ── Coupon fixtures ───────────────────────────────────────────────────────────
// code phải ổn định qua các lần chạy vì E2E test dùng code này trực tiếp

const now = new Date()
const yesterday = new Date(now.getTime() - 86_400_000)
const future30d = new Date(now.getTime() + 30 * 86_400_000)
const expired1d = new Date(now.getTime() - 86_400_000)
const notStarted5d = new Date(now.getTime() + 5 * 86_400_000)

const E2E_COUPONS = [
  // ── Active coupons ─────────────────────────────────────────────────────────
  {
    code: 'E2E-PCT10',
    name: '[E2E] Giảm 10%',
    type: 'percentage',
    value: 10,
    minOrderAmount: 0,
    maxDiscountAmount: null,
    totalUsageLimit: null,
    perUserLimit: 99,
    isActive: true,
    isPublic: true,
    startDate: yesterday,
    endDate: future30d,
    currentUsageCount: 0,
    userUsageCounts: {},
  },
  {
    code: 'E2E-PCT10-CAP50K',
    name: '[E2E] Giảm 10% tối đa 50k',
    type: 'percentage',
    value: 10,
    minOrderAmount: 0,
    maxDiscountAmount: 50_000,
    totalUsageLimit: null,
    perUserLimit: 99,
    isActive: true,
    isPublic: true,
    startDate: yesterday,
    endDate: future30d,
    currentUsageCount: 0,
    userUsageCounts: {},
  },
  {
    code: 'E2E-FIXED30K',
    name: '[E2E] Giảm cố định 30k',
    type: 'fixed_amount',
    value: 30_000,
    minOrderAmount: 0,
    maxDiscountAmount: null,
    totalUsageLimit: null,
    perUserLimit: 99,
    isActive: true,
    isPublic: true,
    startDate: yesterday,
    endDate: future30d,
    currentUsageCount: 0,
    userUsageCounts: {},
  },
  {
    code: 'E2E-FREESHIP',
    name: '[E2E] Miễn phí vận chuyển',
    type: 'free_shipping',
    value: 0,
    minOrderAmount: 0,
    maxDiscountAmount: null,
    totalUsageLimit: null,
    perUserLimit: 99,
    isActive: true,
    isPublic: true,
    startDate: yesterday,
    endDate: future30d,
    currentUsageCount: 0,
    userUsageCounts: {},
  },
  {
    code: 'E2E-MIN200K',
    name: '[E2E] Giảm 20k, đơn tối thiểu 200k',
    type: 'fixed_amount',
    value: 20_000,
    minOrderAmount: 200_000,
    maxDiscountAmount: null,
    totalUsageLimit: null,
    perUserLimit: 99,
    isActive: true,
    isPublic: true,
    startDate: yesterday,
    endDate: future30d,
    currentUsageCount: 0,
    userUsageCounts: {},
  },
  {
    code: 'E2E-NO-RX',
    name: '[E2E] Không áp dụng thuốc kê đơn',
    type: 'fixed_amount',
    value: 15_000,
    minOrderAmount: 0,
    maxDiscountAmount: null,
    totalUsageLimit: null,
    perUserLimit: 99,
    isActive: true,
    isPublic: true,
    excludePrescriptionItems: true,
    startDate: yesterday,
    endDate: future30d,
    currentUsageCount: 0,
    userUsageCounts: {},
  },
  // Per-user limit = 1 (để test giới hạn per-user)
  {
    code: 'E2E-PERUSR1',
    name: '[E2E] Mỗi user chỉ dùng 1 lần',
    type: 'fixed_amount',
    value: 10_000,
    minOrderAmount: 0,
    maxDiscountAmount: null,
    totalUsageLimit: null,
    perUserLimit: 1,
    isActive: true,
    isPublic: true,
    startDate: yesterday,
    endDate: future30d,
    currentUsageCount: 0,
    userUsageCounts: {},
  },
  // Total usage limit = 1 (để test concurrency)
  {
    code: 'E2E-TOTAL1',
    name: '[E2E] Tổng 1 lượt dùng',
    type: 'fixed_amount',
    value: 10_000,
    minOrderAmount: 0,
    maxDiscountAmount: null,
    totalUsageLimit: 1,
    perUserLimit: 99,
    isActive: true,
    isPublic: true,
    startDate: yesterday,
    endDate: future30d,
    currentUsageCount: 0,
    userUsageCounts: {},
  },
  // ── Edge case coupons ──────────────────────────────────────────────────────
  {
    code: 'E2E-EXPIRED',
    name: '[E2E] Đã hết hạn',
    type: 'fixed_amount',
    value: 10_000,
    minOrderAmount: 0,
    maxDiscountAmount: null,
    totalUsageLimit: null,
    perUserLimit: 99,
    isActive: true,
    isPublic: false,
    startDate: expired1d,
    endDate: expired1d,
    currentUsageCount: 0,
    userUsageCounts: {},
  },
  {
    code: 'E2E-NOTYET',
    name: '[E2E] Chưa đến ngày',
    type: 'fixed_amount',
    value: 10_000,
    minOrderAmount: 0,
    maxDiscountAmount: null,
    totalUsageLimit: null,
    perUserLimit: 99,
    isActive: true,
    isPublic: false,
    startDate: notStarted5d,
    endDate: future30d,
    currentUsageCount: 0,
    userUsageCounts: {},
  },
  {
    code: 'E2E-INACTIVE',
    name: '[E2E] Vô hiệu hóa',
    type: 'fixed_amount',
    value: 10_000,
    minOrderAmount: 0,
    maxDiscountAmount: null,
    totalUsageLimit: null,
    perUserLimit: 99,
    isActive: false,
    isPublic: false,
    startDate: yesterday,
    endDate: future30d,
    currentUsageCount: 0,
    userUsageCounts: {},
  },
]

// ── Product fixtures ──────────────────────────────────────────────────────────

const E2E_PRODUCTS = [
  {
    sku: 'E2E-PROD-001',
    name: '[E2E] Vitamin C 1000mg',
    slug: 'e2e-vitamin-c-1000mg',
    price: E2E_PRODUCT_PRICE_1,
    stockQuantity: E2E_PRODUCT_STOCK,
    isActive: true,
    requiresPrescription: false,
    priceVariants: [
      { unit: 'Viên', price: E2E_PRODUCT_PRICE_1, quantityPerUnit: 1 },
      { unit: 'Hộp 30 Viên', price: E2E_PRODUCT_PRICE_1 * 28, quantityPerUnit: 30 },
    ],
  },
  {
    sku: 'E2E-PROD-002',
    name: '[E2E] Omega-3 Fish Oil',
    slug: 'e2e-omega-3-fish-oil',
    price: E2E_PRODUCT_PRICE_2,
    stockQuantity: E2E_PRODUCT_STOCK,
    isActive: true,
    requiresPrescription: false,
    priceVariants: [
      { unit: 'Viên', price: E2E_PRODUCT_PRICE_2, quantityPerUnit: 1 },
    ],
  },
]

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const username = encodeURIComponent(requireEnv('DB_USERNAME'))
  const password = encodeURIComponent(requireEnv('DB_PASSWORD'))
  const dbName = requireEnv('DB_NAME')
  const uri = `mongodb+srv://${username}:${password}@medispacedb.35qkwso.mongodb.net/?retryWrites=true&w=majority&appName=MediSpaceDB`

  const client = new MongoClient(uri)
  await client.connect()
  console.log('[seed-e2e-coupon-loyalty] Connected to MongoDB')

  try {
    const db = client.db(dbName)
    const users = db.collection('users')
    const coupons = db.collection(process.env.DB_COUPONS_COLLECTION || 'coupons')
    const products = db.collection(process.env.DB_PRODUCTS_COLLECTION || 'products')
    const loyaltyAccounts = db.collection(process.env.DB_LOYALTY_ACCOUNTS_COLLECTION || 'loyaltyAccounts')
    const loyaltyTransactions = db.collection(process.env.DB_LOYALTY_TRANSACTIONS_COLLECTION || 'loyaltyTransactions')
    const couponRedemptions = db.collection(process.env.DB_COUPON_REDEMPTIONS_COLLECTION || 'couponRedemptions')
    const orders = db.collection(process.env.DB_ORDERS_COLLECTION || 'orders')
    const carts = db.collection(process.env.DB_CARTS_COLLECTION || 'carts')

    // ── 1. Upsert coupons ──────────────────────────────────────────────────
    console.log('[seed] Upserting coupons...')
    for (const coupon of E2E_COUPONS) {
      await coupons.updateOne(
        { code: coupon.code },
        {
          $set: {
            ...coupon,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            _id: new ObjectId(),
            createdAt: new Date(),
          },
        },
        { upsert: true },
      )
    }
    console.log(`[seed] ${E2E_COUPONS.length} coupons upserted`)

    // ── 2. Upsert products ─────────────────────────────────────────────────
    console.log('[seed] Upserting products...')
    const categories = db.collection('categories')
    let defaultCategory = await categories.findOne({})
    if (!defaultCategory) {
      const categoryId = new ObjectId()
      await categories.insertOne({
        _id: categoryId,
        name: 'Thực phẩm chức năng',
        slug: 'thuc-pham-chuc-nang',
        description: 'Các loại thực phẩm bổ sung, vitamin...',
        path: '/thuc-pham-chuc-nang',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      defaultCategory = await categories.findOne({ _id: categoryId })
    }
    const defaultCategoryId = defaultCategory!._id

    const productIds: Record<string, ObjectId> = {}
    for (const product of E2E_PRODUCTS) {
      const result = await products.findOneAndUpdate(
        { sku: product.sku },
        {
          $set: {
            ...product,
            categoryId: defaultCategoryId,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            _id: new ObjectId(),
            createdAt: new Date(),
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      if (result) {
        productIds[product.sku] = result._id as ObjectId
        console.log(`[seed] Product ${product.sku} → ${result._id}`)
      }
    }

    // ── 3. Setup loyalty accounts ──────────────────────────────────────────
    const customerUser = await users.findOne({
      email: process.env.E2E_CUSTOMER_EMAIL || 'e2e.customer@medispace.local',
    })
    const customer2User = await users.findOne({
      email: process.env.E2E_CUSTOMER2_EMAIL || 'e2e.customer2@medispace.local',
    })

    if (!customerUser) throw new Error('E2E customer user not found — run npm run seed:e2e first')
    if (!customer2User) throw new Error('E2E customer2 user not found — run npm run seed:e2e first')

    console.log(`[seed] Customer userId: ${customerUser._id}`)
    console.log(`[seed] Customer2 userId: ${customer2User._id}`)

    // Customer: reset to 50k points (known-good state)
    await loyaltyAccounts.updateOne(
      { userId: customerUser._id },
      {
        $set: {
          userId: customerUser._id,
          pointsBalance: E2E_SEED_POINTS,
          totalPointsEarned: E2E_SEED_POINTS + 10_000,  // some historical
          totalPointsRedeemed: 10_000,                    // some historical
          totalPointsExpired: 0,
          tier: 'member',
          totalSpent: 0,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          _id: new ObjectId(),
          createdAt: new Date(),
        },
      },
      { upsert: true },
    )
    console.log(`[seed] Customer loyalty account: ${E2E_SEED_POINTS} points`)

    // Customer2: reset to 0 points
    await loyaltyAccounts.updateOne(
      { userId: customer2User._id },
      {
        $set: {
          userId: customer2User._id,
          pointsBalance: 0,
          totalPointsEarned: 0,
          totalPointsRedeemed: 0,
          totalPointsExpired: 0,
          tier: 'member',
          totalSpent: 0,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          _id: new ObjectId(),
          createdAt: new Date(),
        },
      },
      { upsert: true },
    )
    console.log(`[seed] Customer2 loyalty account: 0 points`)

    // ── 4. Reset per-test coupons usage counts ─────────────────────────────
    // Reset E2E-TOTAL1 and E2E-PERUSR1 back to 0 so tests start clean
    await coupons.updateMany(
      { code: { $in: ['E2E-TOTAL1', 'E2E-PERUSR1'] } },
      {
        $set: {
          currentUsageCount: 0,
          userUsageCounts: {},
          updatedAt: new Date(),
        },
      },
    )

    // ── 5. Clear E2E test orders / cart / redemptions from previous runs ──
    // Only wipe records belonging to E2E users to avoid affecting real data
    const e2eUserIds = [customerUser._id, customer2User._id]
    const deletedOrders = await orders.deleteMany({
      userId: { $in: e2eUserIds },
      orderNumber: { $regex: /^ORD-/ },
      // Only delete test orders that are pending or cancelled (safety)
      orderStatus: { $in: ['pending', 'pending_payment', 'cancelled'] },
    })
    if (deletedOrders.deletedCount > 0) {
      console.log(`[seed] Cleaned ${deletedOrders.deletedCount} old E2E test orders`)
    }

    const deletedRedemptions = await couponRedemptions.deleteMany({
      userId: { $in: e2eUserIds },
      couponCode: { $regex: /^E2E-/ },
    })
    if (deletedRedemptions.deletedCount > 0) {
      console.log(`[seed] Cleaned ${deletedRedemptions.deletedCount} old E2E coupon redemptions`)
    }

    // Also reset per-user counts in coupon documents for E2E users
    for (const userId of e2eUserIds) {
      await coupons.updateMany(
        { code: { $regex: /^E2E-/ } },
        { $unset: { [`userUsageCounts.${userId.toString()}`]: '' } },
      )
    }
    await coupons.updateMany(
      { code: { $regex: /^E2E-/, $nin: ['E2E-EXPIRED', 'E2E-NOTYET', 'E2E-INACTIVE'] } },
      { $set: { currentUsageCount: 0, updatedAt: new Date() } },
    )

    // Clear carts for E2E users
    await carts.deleteMany({ userId: { $in: e2eUserIds } })
    console.log('[seed] E2E carts cleared')

    // ── Output manifest ────────────────────────────────────────────────────
    const manifest = {
      customerUserId: customerUser._id.toString(),
      customer2UserId: customer2User._id.toString(),
      products: Object.fromEntries(
        Object.entries(productIds).map(([sku, id]) => [sku, id.toString()])
      ),
      coupons: E2E_COUPONS.map((c) => c.code),
      loyaltyPoints: {
        customer: E2E_SEED_POINTS,
        customer2: 0,
      },
      config: {
        POINTS_PER_VND,
        POINTS_MAX_REDEEM_RATIO: parseFloat(process.env.POINTS_MAX_REDEEM_RATIO || '0.3'),
        POINTS_EXPIRY_DAYS: parseInt(process.env.POINTS_EXPIRY_DAYS || '365'),
        POINTS_MIN_REDEEM: parseInt(process.env.POINTS_MIN_REDEEM || '0'),
        E2E_PRODUCT_PRICE_1,
        E2E_PRODUCT_PRICE_2,
      },
    }

    // Write manifest for E2E tests to read
    const { writeFileSync, mkdirSync } = await import('fs')
    const { resolve } = await import('path')
    const manifestPath = resolve('../MEDISPACE_ECommerce_FE/tests/e2e/.auth/coupon-loyalty-seed.json')
    try {
      mkdirSync(resolve('../MEDISPACE_ECommerce_FE/tests/e2e/.auth'), { recursive: true })
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
      console.log(`[seed] Manifest written to ${manifestPath}`)
    } catch {
      // Fallback: write locally
      const localPath = resolve('./tests/e2e-coupon-loyalty-seed.json')
      writeFileSync(localPath, JSON.stringify(manifest, null, 2))
      console.log(`[seed] Manifest written locally to ${localPath}`)
    }

    console.log('\n[seed-e2e-coupon-loyalty] ✅ Done!')
    console.log(JSON.stringify(manifest, null, 2))
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  console.error('[seed-e2e-coupon-loyalty] ❌ Failed:', err)
  process.exit(1)
})
