import { createStorage } from 'unstorage'
import cloudflareKVBindingDriver from 'unstorage/drivers/cloudflare-kv-binding'
import { env } from 'cloudflare:workers'

interface CacheEntry<T> {
  value: T
  mtime: number // timestamp in ms
}

export interface CachedFunctionOptions {
  key: string
  maxAge: number // seconds
}

/**
 * Create a cached function with maxAge-based expiration.
 * @param fn - The async function to cache
 * @param options - { key: cache key, maxAge: seconds }
 * @returns A function that returns cached or fresh data
 */
export function createCachedFunction<T>(
  fn: () => Promise<T>,
  options: CachedFunctionOptions,
) {
  return async (): Promise<T> => {
    const storage = createStorage({
      driver: cloudflareKVBindingDriver({ binding: env.CACHE }),
    })

    // Try to get cached entry
    const cachedEntry = await storage.getItem<CacheEntry<T>>(options.key)

    // Check if cache is still valid
    if (cachedEntry && cachedEntry.mtime) {
      const ageSeconds = (Date.now() - cachedEntry.mtime) / 1000

      if (ageSeconds < options.maxAge) {
        return cachedEntry.value
      }
    }

    // Cache miss or stale - fetch fresh data
    const value = await fn()

    // Store entry with mtime
    const entry: CacheEntry<T> = {
      value,
      mtime: Date.now(),
    }

    await storage.setItem(options.key, entry)

    return value
  }
}
