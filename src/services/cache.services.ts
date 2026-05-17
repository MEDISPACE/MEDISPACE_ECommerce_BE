import Redis from 'ioredis'
import crypto from 'crypto'
import { config } from 'dotenv'

config()

// ── Redis Connection ────────────────────────────────────────────────────────
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 10) return null // Stop retrying after 10 attempts
    return Math.min(times * 200, 2000)
  },
  lazyConnect: true
})

let isConnected = false

redis.on('error', (err) => {
  if (isConnected) console.warn('[Redis] Connection lost:', err.message)
  isConnected = false
})

redis.on('connect', () => {
  isConnected = true
  console.log('[Redis] ✅ Connected')
})

// Attempt connection (non-blocking)
redis.connect().catch((err) => {
  console.warn('[Redis] ⚠️ Could not connect, running without cache:', err.message)
})

// ── Cache Service ────────────────────────────────────────────────────────────

class CacheService {
  /**
   * Get cached value by key.
   * Returns null if key doesn't exist or Redis is down (graceful degradation).
   */
  async get<T>(key: string): Promise<T | null> {
    if (!isConnected) return null
    try {
      const data = await redis.get(key)
      return data ? JSON.parse(data) : null
    } catch {
      return null
    }
  }

  /**
   * Set a cache value with TTL (seconds).
   */
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!isConnected) return
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)
    } catch {
      /* graceful degradation — app works without cache */
    }
  }

  /**
   * Cache-aside pattern: get from cache, or fetch + store.
   * If Redis is down, fetcher is called directly (transparent fallback).
   */
  async getOrSet<T>(key: string, fetcher: () => Promise<T>, ttlSeconds: number): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached !== null) return cached

    const data = await fetcher()
    // Fire-and-forget: don't await cache write to keep response fast
    this.set(key, data, ttlSeconds).catch(() => {})
    return data
  }

  /**
   * Invalidate one or more keys. Supports glob patterns (e.g. "products:*").
   */
  async invalidate(...patterns: string[]): Promise<void> {
    if (!isConnected) return
    try {
      for (const pattern of patterns) {
        if (pattern.includes('*')) {
          // Scan-based deletion (safer than KEYS for large datasets)
          let cursor = '0'
          do {
            const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
            cursor = nextCursor
            if (keys.length > 0) {
              await redis.del(...keys)
            }
          } while (cursor !== '0')
        } else {
          await redis.del(pattern)
        }
      }
    } catch {
      /* graceful */
    }
  }

  /**
   * Generate a short hash from query params for cache keys.
   */
  hashQuery(params: Record<string, unknown>): string {
    const str = JSON.stringify(params)
    return crypto.createHash('md5').update(str).digest('hex').slice(0, 12)
  }

  /**
   * Get Redis connection stats (for admin/debug endpoint).
   */
  async getStats() {
    if (!isConnected) return { connected: false, dbSize: 0 }
    try {
      const dbSize = await redis.dbsize()
      const info = await redis.info('memory')
      const usedMemory = info.match(/used_memory_human:(.+)/)?.[1]?.trim()
      return { connected: true, dbSize, usedMemory }
    } catch {
      return { connected: false, dbSize: 0 }
    }
  }

  /**
   * Flush all cache (admin only).
   */
  async flushAll(): Promise<void> {
    if (!isConnected) return
    try {
      await redis.flushdb()
    } catch {
      /* graceful */
    }
  }
}

const cacheService = new CacheService()
export { redis }
export default cacheService
