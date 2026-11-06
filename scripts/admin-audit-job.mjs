// Admin ops job wrapper — triggers the in-process integrity audit engine via
// the local cron endpoint (bearer CRON_SECRET inherited from the server env)
// and prints the run summary as this job's log.
//
// Why an HTTP wrapper: the audit engine is TypeScript inside the Next.js
// server (src/lib/audit/audit-runner.ts) and cannot be spawned as a plain
// node script. The cron endpoint already runs runFullAudit with persistence,
// so we reuse it — the Next server keeps serving traffic while it runs.

const PORT = process.env.PORT || "3000"
const SECRET = process.env.CRON_SECRET
const BASE = `http://127.0.0.1:${PORT}`

if (!SECRET) {
  console.error("CRON_SECRET is not set in the server environment — cannot trigger the audit.")
  process.exit(1)
}

const type = process.env.AUDIT_TYPE === "weekly" ? "weekly" : "daily"
console.log(`[audit_run] triggering the integrity audit (${type}) on ${BASE} ...`)
console.log(`[audit_run] the engine checks every company: balance-sheet identity, TTM coherence, cross-period coherence, provenance, coverage, pricing sanity.`)

const started = Date.now()
try {
  const res = await fetch(`${BASE}/api/v1/cron/audit?type=${type}`, {
    headers: { authorization: `Bearer ${SECRET}` },
  })
  const body = await res.text()
  const secs = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`[audit_run] HTTP ${res.status} in ${secs}s`)
  console.log(body)
  if (!res.ok) {
    console.error(`[audit_run] FAILED (HTTP ${res.status})`)
    process.exit(1)
  }
  console.log(`[audit_run] done — results are visible in Admin → Data quality.`)
} catch (err) {
  console.error(`[audit_run] request failed:`, err?.message ?? err)
  process.exit(1)
}
