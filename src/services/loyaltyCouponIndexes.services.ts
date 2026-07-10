import type { Db, IndexSpecification } from 'mongodb'

export interface CriticalIndexDefinition {
  collection: string
  keys: IndexSpecification
  options?: Record<string, unknown>
}

export const CRITICAL_LOYALTY_COUPON_INDEXES: CriticalIndexDefinition[] = [
  {
    collection: process.env.DB_COUPON_REDEMPTIONS_COLLECTION || 'coupon_redemptions',
    keys: { couponCode: 1, userId: 1, orderId: 1 },
    options: {
      name: 'uniq_coupon_redemption_order_user_code',
      unique: true
    }
  },
  {
    collection: process.env.DB_COUPON_REDEMPTIONS_COLLECTION || 'coupon_redemptions',
    keys: { couponId: 1, userId: 1 }
  },
  {
    collection: process.env.DB_COUPON_REDEMPTIONS_COLLECTION || 'coupon_redemptions',
    keys: { orderId: 1 }
  },
  {
    collection: process.env.DB_LOYALTY_TRANSACTIONS_COLLECTION || 'loyalty_transactions',
    keys: { userId: 1, orderId: 1, type: 1 },
    options: {
      name: 'uniq_loyalty_transaction_order_type',
      unique: true,
      partialFilterExpression: {
        orderId: { $type: 'objectId' },
        type: { $in: ['earn', 'redeem', 'revoke', 'adjust'] }
      }
    }
  },
  {
    collection: process.env.DB_LOYALTY_ACCOUNTS_COLLECTION || 'loyalty_accounts',
    keys: { userId: 1 },
    options: {
      name: 'uniq_loyalty_account_user',
      unique: true
    }
  }
]

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function indexMatches(actual: Record<string, any>, expected: CriticalIndexDefinition) {
  if (canonical(actual.key) !== canonical(expected.keys)) return false

  if (expected.options?.unique && actual.unique !== true) return false

  if (expected.options?.partialFilterExpression) {
    return canonical(actual.partialFilterExpression) === canonical(expected.options.partialFilterExpression)
  }

  return true
}

async function listCollectionIndexes(db: Db, collectionName: string) {
  try {
    return await db.collection(collectionName).listIndexes().toArray()
  } catch (error: any) {
    if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') {
      return []
    }
    throw error
  }
}

export async function ensureCriticalLoyaltyCouponIndexes(db: Db) {
  for (const definition of CRITICAL_LOYALTY_COUPON_INDEXES) {
    const indexes = await listCollectionIndexes(db, definition.collection)
    if (indexes.some((index) => indexMatches(index, definition))) {
      continue
    }

    const expectedName = typeof definition.options?.name === 'string' ? definition.options.name : null
    const staleIndex = expectedName
      ? indexes.find((index) => index.name === expectedName && !indexMatches(index, definition))
      : null

    if (staleIndex?.name) {
      await db.collection(definition.collection).dropIndex(staleIndex.name)
    }

    await db.collection(definition.collection).createIndex(definition.keys, {
      background: true,
      ...definition.options
    })
  }
}

export async function verifyCriticalLoyaltyCouponIndexes(db: Db) {
  const missing: CriticalIndexDefinition[] = []

  for (const definition of CRITICAL_LOYALTY_COUPON_INDEXES) {
    const indexes = await listCollectionIndexes(db, definition.collection)
    if (!indexes.some((index) => indexMatches(index, definition))) {
      missing.push(definition)
    }
  }

  if (missing.length > 0) {
    const details = missing
      .map((definition) => `${definition.collection}: ${JSON.stringify(definition.keys)}`)
      .join('; ')
    throw new Error(`Missing critical loyalty/coupon indexes: ${details}`)
  }

  return { verifiedCount: CRITICAL_LOYALTY_COUPON_INDEXES.length }
}
