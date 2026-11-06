import { NextRequest } from "next/server"
import { secureBearerMatch } from "@/lib/secure-compare"

// GET /api/v1/cron/recompute — re-run the calculation + event engines for
// every active company. Protected with `Authorization: Bearer $CRON_SECRET`
// (timing-safe comparison). Used by the admin ops runner
// (scripts/admin-recompute-job.mjs) so a full recompute runs as a background
// job with a log instead of a long synchronous HTTP request through the
// admin UI.

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // disabled unless explicitly configured
  return secureBearerMatch(req.headers.get("authorization"), secret)
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }

  try {
    const { recomputeAll, isRecomputeAllBusy, RecomputeBusyError } = await import("@/lib/financial/recompute")
    // Single-flight: recomputeAll() itself throws RecomputeBusyError when a
    // run is already in progress (admin route or another cron tick).
    if (isRecomputeAllBusy()) {
      return Response.json(
        { ok: false, error: "BUSY", message: "A full recompute is already running — retry later." },
        { status: 503, headers: { "Retry-After": "60" } }
      )
    }
    const results = await recomputeAll()
    // scan contexts + dashboard scanner cards are stale the moment metrics change
    const { invalidateServerCache } = await import("@/lib/server-cache")
    invalidateServerCache()
    // warm the heavy caches in the background so the next page load is instant
    void (async () => {
      try {
        const { getPresetScannerCards, buildScanContextsCached } = await import("@/lib/financial/scan-service")
        await Promise.allSettled([
          getPresetScannerCards(),
          buildScanContextsCached("LATEST_ANNUAL"),
          buildScanContextsCached("LATEST_QUARTERLY"),
          buildScanContextsCached("LATEST_TTM"),
        ])
      } catch {}
    })()

    const totals = results.reduce(
      (acc, r) => ({
        companies: acc.companies + 1,
        calculatedMetrics: acc.calculatedMetrics + r.calculatedMetrics,
        events: acc.events + r.events.length,
        periods: acc.periods + r.periods.length,
      }),
      { companies: 0, calculatedMetrics: 0, events: 0, periods: 0 }
    )

    const { audit } = await import("@/lib/audit")
    await audit("RECOMPUTE_ALL", {
      actor: "ops-runner",
      entityType: "Company",
      details: `Recomputed ${totals.calculatedMetrics} calculated metrics + ${totals.events} events across ${totals.companies} companies`,
    })

    return Response.json({ ok: true, totals })
  } catch (error) {
    if (error instanceof Error && error.name === "RECOMPUTE_BUSY") {
      return Response.json(
        { ok: false, error: "BUSY", message: "A full recompute is already running — retry later." },
        { status: 503, headers: { "Retry-After": "60" } }
      )
    }
    return Response.json(
      { ok: false, error: "RECOMPUTE_FAILED", message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
