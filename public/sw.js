// Meza service worker — deliberately conservative.
//
// Rules (in order):
//   1. /api/*            → NETWORK ONLY. Never cached, ever. Financial data
//                          must never be served stale from a cache.
//   2. /_next/static/*   → cache-first (content-hashed URLs are immutable).
//   3. page navigations  → network-first (3s timeout), fall back to the last
//                          cached copy, then to /offline.
//   4. everything else   → network, no caching.
//
// Updates: skipWaiting + clientsClaim so a new deployment takes effect on the
// next reload without a stuck old worker.

const VERSION = "egx-v1"
const STATIC_CACHE = `${VERSION}-static`
const PAGE_CACHE = `${VERSION}-pages`
const OFFLINE_URL = "/offline"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

function withTimeout(request, ms) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ])
}

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/api/")) return // network only, never cache

  // immutable build assets — cache-first
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/logo")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy))
            }
            return res
          })
      )
    )
    return
  }

  // page navigations — network-first with a cache + offline fallback
  if (req.mode === "navigate") {
    event.respondWith(
      withTimeout(req, 3000)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(PAGE_CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(OFFLINE_URL)))
    )
  }
  // everything else: plain network (default)
})
