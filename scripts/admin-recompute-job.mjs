// Admin ops job wrapper — triggers the in-process recompute engine (calc
// metrics + events for every active company) via the local cron endpoint
// (bearer CRON_SECRET inherited from the server env) and prints the summary
// as this job's log.
//
// Why an HTTP wrapper: the recompute engine is TypeScript inside the Next.js
// server (src/lib/financial/recompute.ts) and cannot be spawned as a plain
// node script. The cron endpoint already runs recomputeAll with cache
// invalidation + cache warming, so we reuse it.

const PORT = process.env.PORT || "3000"
const SECRET = process.env.CRON_SECRET
const BASE = `http://127.0.0.1:${PORT}`

if (!SECRET) {
  console.error("CRON_SECRET is not set in the server environment — cannot trigger the recompute.")
  process.exit(1)
}

console.log(`[recompute_all] triggering full metric recompute on ${BASE} ...`)

const started = Date.now()
try {
  const res = await fetch(`${BASE}/api/v1/cron/recompute`, {
    headers: { authorization: `Bearer ${SECRET}` },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.ok) {
    console.error(`[recompute_all] failed: HTTP ${res.status}`, JSON.stringify(body))
    process.exit(1)
  }
  const t = body.totals ?? {}
  console.log(`[recompute_all] done in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  console.log(`  companies:          ${t.companies ?? "?"}`)
  console.log(`  calculated metrics: ${t.calculatedMetrics ?? "?"}`)
  console.log(`  periods:            ${t.periods ?? "?"}`)
  console.log(`  events:             ${t.events ?? "?"}`)
} catch (e) {
  console.error(`[recompute_all] request failed: ${e.message}`)
  process.exit(1)
}
