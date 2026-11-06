// Per-key asynchronous mutex (single-process).
//
// The app runs as one Node server (standalone output), so serializing
// concurrent handler bodies per key closes check-then-act races (free-tier
// limit checks, duplicate payment/subscription creation, ...) that plain
// read-then-write sequences lose to under parallel requests.
// DB-level guards (conditional updateMany / unique constraints) stay in
// place as the second line of defense for cross-process callers (scripts).

const locks = new Map<string, Promise<unknown>>()

/**
 * Run `fn` while holding the exclusive lock for `key`.
 * Concurrent calls with the same key queue behind each other; different keys
 * run in parallel. The returned promise resolves with fn's result and never
 * rejects because of queueing itself — fn's own rejection propagates as-is.
 */
export function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve()
  const run = prev.then(fn, fn) // run regardless of whether the previous holder succeeded
  // keep the chain alive even if fn rejects, but drop the tail once idle so
  // the map cannot grow unbounded
  const tail = run.catch(() => {})
  locks.set(key, tail)
  void tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key)
  })
  return run
}
