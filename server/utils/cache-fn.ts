import { createStorage } from 'unstorage'
import cloudflareKVBindingDriver from 'unstorage/drivers/cloudflare-kv-binding'
import memoryDriver from 'unstorage/drivers/memory'
import { env } from 'cloudflare:workers'

interface CacheEntry<T> {
  value: T
  mtime: number // timestamp in ms
}

type CachedKey<TArgs extends unknown[]> = string | ((...args: TArgs) => string | Promise<string>)
type CachedMaxAge<TArgs extends unknown[]> = number | ((...args: TArgs) => number)
type CachedEvent = 'hit' | 'miss' | 'stale' | 'store' | 'skip-store'

export interface CachedFunctionOptions<TArgs extends unknown[], TResult> {
  key: CachedKey<TArgs>
  maxAge: CachedMaxAge<TArgs> // seconds
  shouldCache?: (value: TResult, ...args: TArgs) => boolean
  onCacheEvent?: (event: CachedEvent, details: { key: string, maxAge: number }, ...args: TArgs) => void
}

let _storage: ReturnType<typeof createStorage> | null = null

function getStorage() {
  if (_storage)
    return _storage

  // Use KV if available, otherwise fall back to memory (for tests)
  const hasKVBinding = env.CACHE !== undefined
  _storage = createStorage({
    driver: hasKVBinding
      ? cloudflareKVBindingDriver({ binding: env.CACHE })
      : memoryDriver(),
  })

  return _storage
}

/**
 * Create a cached function with maxAge-based expiration.
 * @param fn - The async function to cache
 * @param options - { key: cache key, maxAge: seconds }
 * @returns A function that returns cached or fresh data
 */
export function createCachedFunction<T>(
  fn: () => Promise<T>,
  options: CachedFunctionOptions<[], T>,
): () => Promise<T>

export function createCachedFunction<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: CachedFunctionOptions<TArgs, TResult>,
): (...args: TArgs) => Promise<TResult>

export function createCachedFunction<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: CachedFunctionOptions<TArgs, TResult>,
) {
  const storage = getStorage()

  const resolveKey = async (...args: TArgs): Promise<string> => {
    if (typeof options.key === 'function') {
      return options.key(...args)
    }

    return options.key
  }

  const resolveMaxAge = (...args: TArgs): number => {
    if (typeof options.maxAge === 'function') {
      return options.maxAge(...args)
    }

    return options.maxAge
  }

  return async (...args: TArgs): Promise<TResult> => {
    const key = await resolveKey(...args)
    const maxAge = resolveMaxAge(...args)

    // Try to get cached entry
    const cachedEntry = await storage.getItem<CacheEntry<TResult>>(key)

    // Check if cache is still valid
    if (cachedEntry && cachedEntry.mtime) {
      const ageSeconds = (Date.now() - cachedEntry.mtime) / 1000

      if (ageSeconds < maxAge) {
        options.onCacheEvent?.('hit', { key, maxAge }, ...args)
        return cachedEntry.value
      }

      options.onCacheEvent?.('stale', { key, maxAge }, ...args)
      await storage.removeItem(key)
    }

    if (!cachedEntry) {
      options.onCacheEvent?.('miss', { key, maxAge }, ...args)
    }

    // Cache miss or stale - fetch fresh data
    const value = await fn(...args)

    if (options.shouldCache && !options.shouldCache(value, ...args)) {
      options.onCacheEvent?.('skip-store', { key, maxAge }, ...args)
      return value
    }

    // Store entry with mtime
    const entry: CacheEntry<TResult> = {
      value,
      mtime: Date.now(),
    }

    await storage.setItem(key, entry)
    options.onCacheEvent?.('store', { key, maxAge }, ...args)

    return value
  }
}
