/**
 * Simple in-memory TTL cache utility.
 * Use this for expensive, rarely-changing endpoints like dashboard stats.
 *
 * Usage:
 *   import cache from './cache';
 *   const result = await cache.getOrSet('my-key', 60, () => expensiveQuery());
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class SimpleCache {
  private store = new Map<string, CacheEntry<any>>();

  /** Get a value from cache, or compute + store it if missing/expired. */
  async getOrSet<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const entry = this.store.get(key);
    if (entry && entry.expiresAt > now) {
      return entry.value as T;
    }
    const value = await fn();
    this.store.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
    return value;
  }

  /** Manually invalidate a cache key (e.g. after a write operation). */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Invalidate all keys matching a prefix. */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  /** Clear everything. */
  clear(): void {
    this.store.clear();
  }

  /** Number of live entries. */
  get size(): number {
    const now = Date.now();
    let count = 0;
    for (const e of this.store.values()) {
      if (e.expiresAt > now) count++;
    }
    return count;
  }
}

const cache = new SimpleCache();
export default cache;
