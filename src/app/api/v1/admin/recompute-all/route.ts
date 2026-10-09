import { NextRequest } from "next/server"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"

// POST /api/v1/admin/recompute-all — re-run the calculation + event engines for
// every active company. Useful after bulk data imports (egx-data pipeline) or
// formula upgrades. Admin-gated; reports per-company results.

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) {
    return await unauthorizedResponse()
  }

  const { recomputeAll } = await import("@/lib/financial/recompute")
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

  await audit("RECOMPUTE_ALL", {
    actor: "admin",
    entityType: "Company",
    details: `Recomputed ${totals.calculatedMetrics} calculated metrics + ${totals.events} events across ${totals.companies} companies`,
  })

  return Response.json({ ok: true, totals, results })
}
