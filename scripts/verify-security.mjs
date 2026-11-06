// Verify security hardening on the running EGX-Scanner server.
// Usage: node scripts/verify-security.mjs [baseUrl]
import { execFileSync } from "node:child_process"

const base = process.argv[2] || "http://localhost:3000"

function curl(args) {
  return execFileSync("curl", ["-s", ...args], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 })
}

// 1) security headers
const headers = execFileSync("curl", ["-sI", `${base}/`], { encoding: "utf8" })
const wanted = ["x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy", "strict-transport-security", "content-security-policy"]
console.log("— security headers —")
for (const w of wanted) {
  const found = headers.toLowerCase().includes(w)
  console.log(found ? "  ✓" : "  ✗ MISSING", w)
}

// 2) pick a company ticker from the rankings API
let ticker = "COMI"
try {
  const raw = curl([`${base}/api/v1/companies?page=1&pageSize=1`])
  const j = JSON.parse(raw)
  const first = j.companies?.[0] ?? j.items?.[0] ?? j.data?.[0]
  if (first?.ticker) ticker = first.ticker
} catch {}
console.log("— JSON-LD check on", ticker, "—")
const html = curl([`${base}/company/${ticker}`])
const blocks = html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) || []
let ok = 0, bad = 0
for (const b of blocks) {
  const inner = b.replace(/^<script type="application\/ld\+json">/, "").replace(/<\/script>$/, "")
  try { JSON.parse(inner); ok++ } catch { bad++; console.log("  broken block:", inner.slice(0, 120)) }
}
console.log(`  blocks=${blocks.length} parsed-ok=${ok} failed=${bad}`)

// 3) protection probes
async function probe(method, path, body, extra = []) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { "content-type": "application/json", ...Object.fromEntries([extra]) } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.status
}

console.log("— endpoint protection —")
console.log("  POST /market/refresh anon:", await probe("POST", "/api/v1/market/refresh"), "(expect 401)")
console.log("  GET  /market/refresh     :", await probe("GET", "/api/v1/market/refresh"), "(expect 405)")
console.log("  POST /scanners anon      :", await probe("POST", "/api/v1/scanners", { name: "x", conditions: [{ metric: "revenue", op: "gt", value: 1 }] }), "(expect 401)")
console.log("  POST /admin/login wrong  :", await probe("POST", "/api/v1/admin/login", { passcode: "definitely-wrong" }), "(expect 401/429)")
console.log("  GET  /cron/recompute anon:", await probe("GET", "/api/v1/cron/recompute"), "(expect 401)")
console.log("  GET  /data-quality anon  :", await probe("GET", "/api/v1/data-quality"), "(expect 401)")
