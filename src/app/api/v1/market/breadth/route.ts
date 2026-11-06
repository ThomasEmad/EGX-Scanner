import { db } from "@/lib/db"
import { readMarketSnapshot } from "@/lib/market/snapshot"
import { cachedResponse } from "@/lib/public-cache"

// GET /api/v1/market/breadth — today's price breadth, not a fundamental screen.
//
// The previous implementation compared each company's latest NET PROFIT with
// the prior fiscal year and labelled the result "Advancing / Declining". That
// is a fundamental-growth measure, not market breadth, and it made the
// dashboard claim e.g. "124 advancing / 132 declining" while the market was
// actually up. Breadth must come from price changes.
//
// Primary source: the public 15-minute-delayed snapshot (all EGX rows, with
// volume). Fallback: the latest two MarketPrice points per company. Traded
// value is only reported when volume is available; otherwise it is null, never
// fabricated.

interface BreadthData {
  advancing: number
  declining: number
  unchanged: number
  tradedValue: number | null
  asOf: string | null
  pricedCount: number
  tradedValueCoverage: number | null
}

// 30s in-process SWR cache — breadth is hit by the dashboard on every visit;
// at scale the DB-fallback path must not run per request.
export async function GET() {
  return cachedResponse("market-breadth", 30 * 1000, buildBreadth)
}

async function buildBreadth(): Promise<BreadthData> {
  const snapshot = readMarketSnapshot()

  if (snapshot && snapshot.movers.length > 0) {
    const valid = snapshot.movers
    const advancing = valid.filter((m) => m.changePct > 0).length
    const declining = valid.filter((m) => m.changePct < 0).length
    const unchanged = valid.filter((m) => m.changePct === 0).length

    const withVolume = valid.filter((m) => typeof m.volume === "number" && m.volume >= 0)
    const tradedValue = withVolume.length
      ? withVolume.reduce((sum, m) => sum + m.price * (m.volume as number), 0)
      : null

    return {
      advancing,
      declining,
      unchanged,
      tradedValue,
      asOf: snapshot.pricesAsOf ?? snapshot.asOf,
      pricedCount: valid.length,
      tradedValueCoverage: valid.length ? withVolume.length / valid.length : null,
    } satisfies BreadthData
  }

  // Fallback: durable price rows. There is no volume column, so traded value
  // stays null (the UI renders N/A).
  const companies = await db.company.findMany({
    where: { isActive: true },
    select: { id: true, ticker: true },
  })
  if (companies.length === 0) {
    return {
      advancing: 0,
      declining: 0,
      unchanged: 0,
      tradedValue: null,
      asOf: null,
      pricedCount: 0,
      tradedValueCoverage: null,
    } satisfies BreadthData
  }

  const priceRows = await db.marketPrice.findMany({
    where: { companyId: { in: companies.map((c) => c.id) }, isDemoData: false },
    orderBy: [{ companyId: "asc" }, { asOf: "asc" }],
    select: { companyId: true, price: true, asOf: true },
  })

  const byCompany = new Map<string, { price: number; ts: number }[]>()
  for (const row of priceRows) {
    const ts = row.asOf.getTime()
    if (!Number.isFinite(ts)) continue
    const list = byCompany.get(row.companyId) ?? []
    list.push({ price: row.price, ts })
    byCompany.set(row.companyId, list)
  }

  let advancing = 0
  let declining = 0
  let unchanged = 0
  let pricedCount = 0
  let latestTs = 0
  for (const rows of byCompany.values()) {
    if (rows.length === 0) continue
    const last = rows[rows.length - 1]
    latestTs = Math.max(latestTs, last.ts)
    if (rows.length < 2) continue
    const prev = rows[rows.length - 2]
    if (!(prev.price > 0) || !(last.price > 0)) continue
    const changePct = ((last.price - prev.price) / prev.price) * 100
    if (Math.abs(changePct) > 50) continue
    pricedCount++
    if (changePct > 0.01) advancing++
    else if (changePct < -0.01) declining++
    else unchanged++
  }

  return {
    advancing,
    declining,
    unchanged,
    tradedValue: null,
    asOf: latestTs ? new Date(latestTs).toISOString() : null,
    pricedCount,
    tradedValueCoverage: null,
  } satisfies BreadthData
}
