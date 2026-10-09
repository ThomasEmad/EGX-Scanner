// Tiny in-memory response cache for expensive, rarely-changing computations.
// stale-while-revalidate: an expired entry is served instantly while a
// single-flight background refresh runs. All entries are invalidated whenever
// the data pipeline recomputes (recompute-all, financial-ops edits) — the DB
// stays the source of truth.

const store = new Map<string, { value: unknown; at: number; refreshing?: boolean }>()

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key)
  if (hit) {
    if (Date.now() - hit.at < ttlMs) return hit.value as T
    // stale: serve it and refresh in the background (one refresh at a time)
    if (!hit.refreshing) {
      hit.refreshing = true
      fn()
        .then((value) => store.set(key, { value, at: Date.now(), refreshing: false }))
        .catch(() => {
          hit.refreshing = false
        })
    }
    return hit.value as T
  }
  const value = await fn()
  store.set(key, { value, at: Date.now() })
  return value
}

export function invalidateServerCache(): void {
  store.clear()
}
