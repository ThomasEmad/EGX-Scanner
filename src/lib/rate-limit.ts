// Production-ready rate limiter.
// Uses an in-memory store by default, with a swappable interface for Redis.
// Safe IP extraction respects trusted proxy configuration.

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

export interface RateLimiter {
  check(key: string, maxRequests: number, windowMs: number): Promise<RateLimitResult>
}

// In-memory implementation with cleanup
class InMemoryRateLimiter implements RateLimiter {
  private store = new Map<string, { count: number; resetAt: number }>()

  async check(key: string, maxRequests: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now()
    const existing = this.store.get(key)

    if (existing && now < existing.resetAt) {
      if (existing.count >= maxRequests) {
        return { allowed: false, remaining: 0, resetAt: existing.resetAt }
      }
      existing.count++
      return { allowed: true, remaining: maxRequests - existing.count, resetAt: existing.resetAt }
    }

    this.store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs }
  }

  startCleanup(intervalMs = 60_000): () => void {
    const timer = setInterval(() => {
      const now = Date.now()
      for (const [key, entry] of this.store) {
        if (now >= entry.resetAt) this.store.delete(key)
      }
    }, intervalMs)
    return () => clearInterval(timer)
  }
}

// Default in-memory limiter with periodic cleanup
const limiter = new InMemoryRateLimiter()
limiter.startCleanup()

export function getRateLimiter(): RateLimiter {
  return limiter
}

// Trusted proxy configuration
// TRUSTED_PROXIES: comma-separated list of trusted proxy IPs/CIDRs, or "*" to
// trust the edge reverse proxy's x-forwarded-for (single known gateway in
// front of this server). If empty, x-forwarded-for is ignored entirely and
// every client shares the "local" bucket — which would let one attacker lock
// every legitimate user out of the login endpoints (and makes per-IP limits
// meaningless).
const TRUSTED_PROXIES = (process.env.TRUSTED_PROXIES || "").split(",").map((s) => s.trim()).filter(Boolean)
const TRUST_EDGE_PROXY = TRUSTED_PROXIES.includes("*")

function isTrustedProxy(ip: string): boolean {
  if (TRUSTED_PROXIES.length === 0) return false
  return TRUSTED_PROXIES.some((proxy) => {
    if (proxy.includes("/")) {
      // CIDR notation
      const [network, bits] = proxy.split("/").map(Number)
      const mask = -1 << (32 - bits)
      return (ipToNumber(ip) & mask) === (network & mask)
    }
    return ip === proxy
  })
}

function ipToNumber(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
}

export function getClientIp(req: { headers: Headers }): string {
  const forwardedFor = req.headers.get("x-forwarded-for")
  const realIp = req.headers.get("x-real-ip")

  // "*" mode: exactly one trusted reverse proxy (the sandbox gateway) sits in
  // front of this server — the first entry of x-forwarded-for is the original
  // client IP set by that proxy.
  if (TRUST_EDGE_PROXY && forwardedFor) {
    const ips = forwardedFor.split(",").map((ip) => ip.trim()).filter(Boolean)
    if (ips.length > 0) return ips[0]
  }

  // Only trust x-forwarded-for when the hop is a specifically configured proxy
  if (forwardedFor && isTrustedProxy(realIp || "")) {
    const ips = forwardedFor.split(",").map((ip) => ip.trim()).filter(Boolean)
    if (ips.length > 0) return ips[0]
  }

  if (realIp) return realIp

  return "local"
}

export async function checkRateLimit(key: string, maxRequests: number, windowMs: number): Promise<RateLimitResult> {
  return limiter.check(key, maxRequests, windowMs)
}

// Endpoint-specific rate limit configurations
export const RATE_LIMITS = {
  "auth-login": { key: "login", max: 5, windowMs: 15 * 60 * 1000 },
  "auth-register": { key: "register", max: 3, windowMs: 60 * 60 * 1000 },
  "auth-admin-login": { key: "admin-login", max: 5, windowMs: 15 * 60 * 1000 },
  "auth-forgot-password": { key: "forgot-password", max: 3, windowMs: 60 * 60 * 1000 },
  "auth-reset-password": { key: "reset-password", max: 10, windowMs: 60 * 60 * 1000 },
  "auth-oauth-callback": { key: "oauth-callback", max: 20, windowMs: 10 * 60 * 1000 },
  "auth-change-password": { key: "change-password", max: 5, windowMs: 60 * 60 * 1000 },
  "auth-session": { key: "auth-session", max: 30, windowMs: 10 * 60 * 1000 },
  "watchlist-sync": { key: "watchlist-sync", max: 60, windowMs: 10 * 60 * 1000 },
  "alerts-write": { key: "alerts-write", max: 30, windowMs: 10 * 60 * 1000 },
  "scanner-run": { key: "scanner-run", max: 20, windowMs: 10 * 60 * 1000 },
  "scanner-create": { key: "scanner-create", max: 10, windowMs: 60 * 60 * 1000 },
  "market-refresh": { key: "market-refresh", max: 4, windowMs: 10 * 60 * 1000 },
  "ai-analysis": { key: "ai-analysis", max: 10, windowMs: 10 * 60 * 1000 },
  "ai-chat": { key: "ai-chat", max: 30, windowMs: 10 * 60 * 1000 },
  "report-upload": { key: "report-upload", max: 10, windowMs: 60 * 60 * 1000 },
  "report-analyze": { key: "report-analyze", max: 20, windowMs: 60 * 60 * 1000 },
  "payment-request": { key: "payment-request", max: 5, windowMs: 60 * 60 * 1000 },
  "subscription-request": { key: "subscription-request", max: 5, windowMs: 60 * 60 * 1000 },
} as const

export type RateLimitEndpoint = keyof typeof RATE_LIMITS

export async function checkEndpointRateLimit(endpoint: RateLimitEndpoint, ip: string): Promise<RateLimitResult> {
  const config = RATE_LIMITS[endpoint]
  const key = `${config.key}:${ip}`
  return checkRateLimit(key, config.max, config.windowMs)
}
