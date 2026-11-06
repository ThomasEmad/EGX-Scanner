import { db } from "@/lib/db"

// GET /api/v1/health — system health for monitoring/load balancers.
// Checks the database round-trip and reports process vitals so an external
// watchdog can distinguish "up" from "up but starving".
const BOOT = Date.now()

export async function GET() {
  const t0 = Date.now()
  try {
    const [companies] = await Promise.all([db.company.count()])
    const dbMs = Date.now() - t0
    const mem = process.memoryUsage()
    return Response.json(
      {
        ok: true,
        service: "egx-financial-scanner",
        database: "connected",
        dbLatencyMs: dbMs,
        companies,
        uptimeSec: Math.round((Date.now() - BOOT) / 1000),
        memoryRssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        version: process.env.npm_package_version ?? "unknown",
        time: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return Response.json(
      { ok: false, database: "error", message: e instanceof Error ? e.message : "unknown" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    )
  }
}
