import { config } from 'dotenv'
import { MongoClient, ObjectId } from 'mongodb'

config()

const DB_NAME = (process.env.DB_NAME || 'medispacedb').replace(/^['"]|['"]$/g, '')
const PRODUCTS_COLLECTION = (process.env.DB_PRODUCTS_COLLECTION || 'products').replace(/^['"]|['"]$/g, '')
const ORDERS_COLLECTION = (process.env.DB_ORDERS_COLLECTION || 'orders').replace(/^['"]|['"]$/g, '')
const REVIEWS_COLLECTION = (process.env.DB_REVIEWS_COLLECTION || 'reviews').replace(/^['"]|['"]$/g, '')
const USERS_COLLECTION = (process.env.DB_USERS_COLLECTION || 'users').replace(/^['"]|['"]$/g, '')

const MARKER = 'product-review-seed-v1'
const TARGET_PRODUCTS = Number(process.env.REVIEW_SEED_TARGET_PRODUCTS || 180)
const MAX_REVIEWS_PER_PRODUCT = Number(process.env.REVIEW_SEED_MAX_PER_PRODUCT || 4)

const reviewTemplates = [
  { rating: 5, title: 'Hài lòng', comment: 'Sản phẩm đóng gói cẩn thận, dễ sử dụng và đúng như mô tả.' },
  { rating: 5, title: 'Rất ổn', comment: 'Mình dùng thấy phù hợp, giao hàng nhanh và thông tin sản phẩm rõ ràng.' },
  { rating: 4, title: 'Tốt', comment: 'Chất lượng ổn, bao bì nguyên vẹn, giá hợp lý so với nhu cầu.' },
  { rating: 4, title: 'Đáng mua', comment: 'Sản phẩm dùng ổn, sẽ cân nhắc mua lại khi cần.' },
  { rating: 5, title: 'Phù hợp', comment: 'Mua cho gia đình sử dụng, sản phẩm đúng loại và còn hạn dùng xa.' },
  { rating: 4, title: 'Ổn áp', comment: 'Trải nghiệm mua hàng tốt, sản phẩm nhận được giống hình.' },
  { rating: 3, title: 'Tạm ổn', comment: 'Sản phẩm dùng được, đóng gói ổn nhưng mình cần thêm thời gian đánh giá.' }
]

const getMongoUri = () => {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI
  const username = process.env.DB_USERNAME
  const password = process.env.DB_PASSWORD
  if (!username || !password) throw new Error('Missing MONGODB_URI or DB_USERNAME/DB_PASSWORD')
  return `mongodb+srv://${username}:${password}@medispacedb.35qkwso.mongodb.net/?retryWrites=true&w=majority&appName=MediSpaceDB`
}

const stripEnv = (value?: string) => value?.replace(/^['"]|['"]$/g, '')

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const daysAgo = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(11, 0, 0, 0)
  return date
}

const pickPriceVariant = (product: any) => {
  const variants = Array.isArray(product.priceVariants) ? product.priceVariants : []
  return variants.find((variant: any) => variant?.isDefault) || variants[0] || { unit: 'Sản phẩm', price: 0 }
}

const buildOrderItem = (product: any) => {
  const variant = pickPriceVariant(product)
  const unitPrice = asNumber(variant.price, 0)
  return {
    productId: product._id,
    categoryId: product.categoryId,
    name: product.name,
    sku: product.sku || `SKU-${product._id.toString().slice(-8)}`,
    unit: variant.unit || 'Sản phẩm',
    quantity: 1,
    unitPrice,
    originalUnitPrice: asNumber(variant.originalPrice, unitPrice) || unitPrice,
    totalPrice: unitPrice,
    prescriptionRequired: false,
    image: product.featuredImage || ''
  }
}

const shippingAddressFor = (user: any, index: number) => ({
  firstName: user.firstName || `Review${index}`,
  lastName: user.lastName || 'Customer',
  phone: user.phoneNumber || `091000${String(index).padStart(4, '0')}`,
  email: user.email || `review-customer-${index}@medispace.local`,
  address: 'Seed review address',
  ward: 'Phường 1',
  district: 'Quận 1',
  province: 'TP. Hồ Chí Minh',
  postalCode: '700000'
})

const main = async () => {
  const client = new MongoClient(getMongoUri())
  await client.connect()
  const db = client.db(stripEnv(DB_NAME) || 'medispacedb')
  const users = db.collection(USERS_COLLECTION)
  const products = db.collection(PRODUCTS_COLLECTION)
  const orders = db.collection(ORDERS_COLLECTION)
  const reviews = db.collection(REVIEWS_COLLECTION)

  try {
    const customers = await users
      .find({ role: 0, status: { $ne: 2 } }, { projection: { _id: 1, email: 1, firstName: 1, lastName: 1, phoneNumber: 1 } })
      .limit(30)
      .toArray()
    if (customers.length < 5) throw new Error(`Need at least 5 customers, found ${customers.length}`)

    const previousSeedProductIds = [
      ...new Set(
        (await reviews.find({ seedSource: MARKER }, { projection: { productId: 1 } }).toArray())
          .map((review) => review.productId?.toString())
          .filter(Boolean)
      )
    ].map((id) => new ObjectId(id))

    const selectedProducts = await products
      .find(
        {
          isActive: true,
          stockQuantity: { $gt: 0 },
          requiresPrescription: { $ne: true },
          priceVariants: { $exists: true, $ne: [] }
        },
        {
          projection: {
            _id: 1,
            name: 1,
            sku: 1,
            categoryId: 1,
            priceVariants: 1,
            featuredImage: 1
          }
        }
      )
      .sort({ reviewCount: 1, rating: 1, createdAt: -1 })
      .limit(TARGET_PRODUCTS)
      .toArray()
    if (selectedProducts.length === 0) throw new Error('No eligible OTC products found')

    const affectedProductIds = [
      ...new Map(
        [...previousSeedProductIds, ...selectedProducts.map((product) => product._id)]
          .map((productId) => [productId.toString(), productId])
      ).values()
    ]
    await reviews.deleteMany({ seedSource: MARKER })
    await orders.deleteMany({ seedSource: MARKER })

    const proofOrders: any[] = []
    const seededReviews: any[] = []
    const now = new Date()

    selectedProducts.forEach((product, productIndex) => {
      const reviewsForProduct = 2 + (productIndex % Math.max(MAX_REVIEWS_PER_PRODUCT - 1, 1))
      for (let i = 0; i < Math.min(reviewsForProduct, MAX_REVIEWS_PER_PRODUCT); i++) {
        const customer = customers[(productIndex + i) % customers.length]
        const orderId = new ObjectId()
        const reviewId = new ObjectId()
        const orderAge = 120 - ((productIndex * 3 + i * 11) % 105)
        const createdAt = daysAgo(Math.max(orderAge, 7))
        const deliveredAt = new Date(createdAt.getTime() + 2 * 24 * 60 * 60 * 1000)
        const reviewCreatedAt = new Date(deliveredAt.getTime() + (i + 1) * 24 * 60 * 60 * 1000)
        const item = buildOrderItem(product)
        const template = reviewTemplates[(productIndex + i) % reviewTemplates.length]
        const helpfulCount = (productIndex + i) % 8

        proofOrders.push({
          _id: orderId,
          userId: customer._id,
          orderNumber: `REVSEED-${String(productIndex + 1).padStart(4, '0')}-${String(i + 1).padStart(2, '0')}`,
          items: [item],
          itemCount: 1,
          shippingAddress: shippingAddressFor(customer, productIndex + i),
          shippingMethod: 'standard',
          paymentMethod: 'cod',
          paymentStatus: 'paid',
          orderStatus: 'delivered',
          subtotal: item.totalPrice,
          taxAmount: 0,
          shippingFee: 0,
          discountAmount: 0,
          totalAmount: item.totalPrice,
          notes: 'Seeded proof-of-purchase order for review demo data',
          stockRestored: false,
          seedSource: MARKER,
          createdAt,
          updatedAt: deliveredAt,
          paidAt: createdAt,
          shippedAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
          deliveredAt
        })

        seededReviews.push({
          _id: reviewId,
          productId: product._id,
          userId: customer._id,
          orderId,
          rating: template.rating,
          title: template.title,
          comment: template.comment,
          images: [],
          isVerifiedPurchase: true,
          helpfulCount,
          helpfulVotes: [],
          autoApproved: true,
          flagged: false,
          status: 'approved',
          moderatedAt: reviewCreatedAt,
          moderationNotes: 'Seeded approved review for UI demo data',
          aiFlag: false,
          seedSource: MARKER,
          createdAt: reviewCreatedAt,
          updatedAt: reviewCreatedAt
        })
      }
    })

    if (proofOrders.length > 0) await orders.insertMany(proofOrders, { ordered: false })
    if (seededReviews.length > 0) await reviews.insertMany(seededReviews, { ordered: false })

    const reviewStats = await reviews
      .aggregate([
        { $match: { productId: { $in: affectedProductIds }, status: 'approved' } },
        {
          $group: {
            _id: '$productId',
            reviewCount: { $sum: 1 },
            rating: { $avg: '$rating' },
            one: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
            two: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
            three: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
            four: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
            five: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } }
          }
        }
      ])
      .toArray()

    const statsByProductId = new Map(reviewStats.map((stat) => [stat._id.toString(), stat]))
    const updates = affectedProductIds.map((productId) => {
      const stat = statsByProductId.get(productId.toString())
      return {
      updateOne: {
        filter: { _id: productId },
        update: {
          $set: {
            rating: stat ? Math.round(stat.rating * 10) / 10 : 0,
            reviewCount: stat?.reviewCount || 0,
            ratingDistribution: {
              1: stat?.one || 0,
              2: stat?.two || 0,
              3: stat?.three || 0,
              4: stat?.four || 0,
              5: stat?.five || 0
            },
            updatedAt: now
          }
        }
      }
    }
    })
    if (updates.length > 0) await products.bulkWrite(updates, { ordered: false })

    console.log(JSON.stringify({
      marker: MARKER,
      targetProducts: selectedProducts.length,
      insertedProofOrders: proofOrders.length,
      insertedReviews: seededReviews.length,
      productsUpdated: updates.length,
      averageReviewsPerProduct: Number((seededReviews.length / Math.max(selectedProducts.length, 1)).toFixed(2))
    }, null, 2))
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
