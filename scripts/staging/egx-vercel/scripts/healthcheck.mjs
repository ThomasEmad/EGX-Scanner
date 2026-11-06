// External health check for EGX Scanner. Designed for a cron job or an
// uptime monitor: it exits non-zero when a critical surface is unhealthy.
//
// Usage:
//   node scripts/healthcheck.mjs
//   BASE_URL=https://egx-scanner.com node scripts/healthcheck.mjs
//
// Writes a small JSON report to reports/healthcheck.json (no secrets).

import fs from "node:fs"

const BASE = (process.env.BASE_URL || "http://localhost:3100").replace(/\/$/, "")
const timeoutMs = Number(process.env.HEALTHCHECK_TIMEOUT_MS || 15000)

const checks = [
  { name: "health", path: "/api/v1/health", expect: 200 },
  { name: "market-ticker", path: "/api/v1/market/ticker", expect: 200 },
  { name: "company", path: "/api/v1/companies/COMI", expect: 200 },
  { name: "home", path: "/", expect: 200 },
]

async function check(c) {
  const t0 = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(BASE + c.path, { signal: controller.signal })
    return { name: c.name, path: c.path, status: res.status, ok: res.status === c.expect, ms: Date.now() - t0 }
  } catch (e) {
    return { name: c.name, path: c.path, status: 0, ok: false, ms: Date.now() - t0, error: e.message }
  } finally {
    clearTimeout(timer)
  }
}

const startedAt = new Date().toISOString()
const results = []
for (const c of checks) results.push(await check(c))
const ok = results.every((r) => r.ok)
const report = { startedAt, base: BASE, ok, results }

fs.mkdirSync("reports", { recursive: true })
fs.writeFileSync("reports/healthcheck.json", JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
process.exit(ok ? 0 : 1)
