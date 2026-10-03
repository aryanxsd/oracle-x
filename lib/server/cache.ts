import "server-only"

/**
 * Tiny in-process read-through cache for slow, read-only Snowflake views. Concurrent callers share
 * one in-flight promise; failures are not cached. Values are reused only for `ttlMs`, so the UI
 * never shows data meaningfully older than the backend's own daily scoring.
 */
type Entry = { at: number; value: Promise<unknown> }
// Kept on globalThis so pages and route handlers (bundled separately by Next.js) share one cache.
const g = globalThis as typeof globalThis & { __oracleXCache?: Map<string, Entry> }
const store = (g.__oracleXCache ??= new Map<string, Entry>())
const MAX_ENTRIES = 200

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>
  const value = load()
  store.set(key, { at: Date.now(), value })
  value.catch(() => {
    if (store.get(key)?.value === value) store.delete(key)
  })
  if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value!)
  return value
}

export function invalidate(key: string) {
  store.delete(key)
}

export function _clearCache() {
  store.clear()
}
