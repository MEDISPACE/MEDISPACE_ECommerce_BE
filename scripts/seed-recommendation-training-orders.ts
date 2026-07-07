import { config } from 'dotenv'
import { MongoClient, ObjectId } from 'mongodb'

config()

const DB_NAME = (process.env.DB_NAME || 'medispacedb').replace(/^['"]|['"]$/g, '')
const PRODUCTS_COLLECTION = (process.env.DB_PRODUCTS_COLLECTION || 'products').replace(/^['"]|['"]$/g, '')
const ORDERS_COLLECTION = (process.env.DB_ORDERS_COLLECTION || 'orders').replace(/^['"]|['"]$/g, '')
const USERS_COLLECTION = (process.env.DB_USERS_COLLECTION || 'users').replace(/^['"]|['"]$/g, '')
const MARKER = 'recommendation-training-seed-v1'

const getMongoUri = () => {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI
  const username = process.env.DB_USERNAME
  const password = process.env.DB_PASSWORD
  if (!username || !password) throw new Error('Missing MONGODB_URI or DB_USERNAME/DB_PASSWORD')
  return `mongodb+srv://${username}:${password}@medispacedb.35qkwso.mongodb.net/?retryWrites=true&w=majority&appName=MediSpaceDB`
}

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const pickPriceVariant = (product: any) => {
  const variants = Array.isArray(product.priceVariants) ? product.priceVariants : []
  return variants.find((variant: any) => variant?.isDefault) || variants[0] || { unit: 'Sản phẩm', price: 0 }
}

const shippingAddressFor = (user: any, index: number) => {
  const address = Array.isArray(user.addresses) ? user.addresses[0] : undefined
  return {
    firstName: user.firstName || `Seed${index}`,
    lastName: user.lastName || 'Customer',
    phone: user.phoneNumber || `090000${String(index).padStart(4, '0')}`,
    email: user.email || `seed-customer-${index}@medispace.local`,
    address: address?.address || 'Seed recommendation address',
    ward: address?.ward || 'Phường 1',
    district: address?.district || 'Quận 1',
    province: address?.province || 'TP. Hồ Chí Minh',
    postalCode: address?.postalCode || '700000'
  }
}

const buildOrderItem = (product: any, quantity: number) => {
  const variant = pickPriceVariant(product)
  const unitPrice = asNumber(variant.price, 0)
  return {
    productId: product._id,
    categoryId: product.categoryId,
    name: product.name,
    sku: product.sku || `SKU-${product._id.toString().slice(-8)}`,
    unit: variant.unit || 'Sản phẩm',
    quantity,
    unitPrice,
    originalUnitPrice: asNumber(variant.originalPrice, unitPrice) || unitPrice,
    totalPrice: unitPrice * quantity,
    prescriptionRequired: false,
    image: product.featuredImage || ''
  }
}

const daysAgo = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(10, 0, 0, 0)
  return date
}

const main = async () => {
  const client = new MongoClient(getMongoUri())
  await client.connect()
  const db = client.db(DB_NAME)
  const users = db.collection(USERS_COLLECTION)
  const products = db.collection(PRODUCTS_COLLECTION)
  const orders = db.collection(ORDERS_COLLECTION)
  const recommendationEvents = db.collection('recommendationEvents')

  try {
    const customers = await users
      .find({ role: 0, status: { $ne: 2 } }, { projection: { _id: 1, email: 1, firstName: 1, lastName: 1, phoneNumber: 1, addresses: 1 } })
      .limit(20)
      .toArray()

    if (customers.length < 5) throw new Error(`Need at least 5 customer users, found ${customers.length}`)

    const otcProducts = await products
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
            featuredImage: 1,
            requiresPrescription: 1
          }
        }
      )
      .limit(300)
      .toArray()

    if (otcProducts.length < 40) throw new Error(`Need at least 40 OTC products, found ${otcProducts.length}`)

    const byCategory = new Map<string, any[]>()
    for (const product of otcProducts) {
      const key = product.categoryId?.toString() || 'uncategorized'
      byCategory.set(key, [...(byCategory.get(key) || []), product])
    }

    const categoryGroups = [...byCategory.values()].filter((group) => group.length >= 4)
    const sourceGroups = categoryGroups.length >= 4 ? categoryGroups : [otcProducts]
    const bundles = Array.from({ length: 18 }, (_, bundleIndex) => {
      const group = sourceGroups[bundleIndex % sourceGroups.length]
      const start = (bundleIndex * 2) % Math.max(group.length - 3, 1)
      return [group[start], group[start + 1], group[start + 2]].filter(Boolean)
    }).filter((bundle) => bundle.length >= 2)

    await orders.deleteMany({ seedSource: MARKER })
    await recommendationEvents.deleteMany({ seedSource: MARKER })

    const seededOrders: any[] = []
    const seededEvents: any[] = []
    const selectedCustomers = customers.slice(0, Math.min(customers.length, 12))

    selectedCustomers.forEach((customer, userIndex) => {
      const favoriteBundle = bundles[userIndex % bundles.length]
      const schedule = [170, 130, 90, 55, 25, 8]

      schedule.forEach((ageInDays, orderIndex) => {
        const bundle = orderIndex % 2 === 0 ? favoriteBundle : bundles[(userIndex + orderIndex) % bundles.length]
        const createdAt = daysAgo(ageInDays)
        const deliveredAt = new Date(createdAt.getTime() + 2 * 24 * 60 * 60 * 1000)
        const items = bundle.slice(0, orderIndex % 3 === 0 ? 3 : 2).map((product, itemIndex) =>
          buildOrderItem(product, itemIndex === 0 && orderIndex % 2 === 0 ? 2 : 1)
        )
        const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0)
        const orderId = new ObjectId()
        const orderNumber = `RECSEED-${String(userIndex + 1).padStart(2, '0')}-${String(orderIndex + 1).padStart(2, '0')}`

        seededOrders.push({
          _id: orderId,
          userId: customer._id,
          orderNumber,
          items,
          itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
          shippingAddress: shippingAddressFor(customer, userIndex),
          shippingMethod: 'standard',
          paymentMethod: 'cod',
          paymentStatus: 'paid',
          orderStatus: 'delivered',
          subtotal,
          taxAmount: 0,
          shippingFee: 0,
          discountAmount: 0,
          totalAmount: subtotal,
          notes: 'Seeded historical order for recommendation training',
          stockRestored: false,
          seedSource: MARKER,
          createdAt,
          updatedAt: deliveredAt,
          paidAt: createdAt,
          shippedAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
          deliveredAt
        })

        items.forEach((item, position) => {
          seededEvents.push({
            userId: customer._id,
            productId: item.productId,
            algorithm: 'seeded_order_history',
            section: 'recommendation',
            position,
            eventType: 'purchase',
            requestId: null,
            attributionToken: null,
            modelVersion: 'seed',
            experimentId: 'recommendation-training-seed',
            experimentVariant: 'seed',
            value: item.totalPrice,
            timestamp: deliveredAt,
            seedSource: MARKER
          })
        })
      })
    })

    if (seededOrders.length > 0) await orders.insertMany(seededOrders, { ordered: false })
    if (seededEvents.length > 0) await recommendationEvents.insertMany(seededEvents, { ordered: false })

    const multiItemOrders = seededOrders.filter((order) => order.items.length >= 2).length
    const repeatedUsers = selectedCustomers.length
    console.log(JSON.stringify({
      marker: MARKER,
      insertedOrders: seededOrders.length,
      insertedRecommendationEvents: seededEvents.length,
      multiItemOrders,
      usersWithRepeatedPurchases: repeatedUsers,
      otcProductsUsed: new Set(seededOrders.flatMap((order) => order.items.map((item: any) => item.productId.toString()))).size
    }, null, 2))
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
