import { marketValuationScreen } from "@/lib/financial/scores"
import { cached } from "@/lib/server-cache"

// GET /api/v1/dashboard/valuation — market-wide valuation screen:
// companies ranked by discount vs their sector median P/E & P/B.
//
// marketValuationScreen calls computeCompanyScores per active filer
// (~250 companies × several queries each) — uncached this took ~14s and
// dominated every dashboard visit. The screen changes only when filings,
// metric recompute or market snapshots change, so a 5-minute stale-while-
// revalidate cache (invalidated by the pipeline via invalidateServerCache)
// keeps first paint fast and data honest.
export async function GET() {
  const results = await cached("dashboard:valuation", 5 * 60_000, () => marketValuationScreen(24))
  return Response.json({ results })
}
