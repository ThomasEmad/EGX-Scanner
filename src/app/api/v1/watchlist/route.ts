import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { CALC_METRIC_MAP } from "@/lib/financial/registry"

// GET /api/v1/watchlist?ids=a,b,c — snapshot per watched company: latest recorded
// price + 1Y change, latest verified ANNUAL metrics. The ids come from the
// client-side watchlist store (a user preference, not server state).

const METRICS = ["revenue", "net_profit", "net_margin", "roe", "profit_growth", "p_e", "dividend_yield"] as const

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 10)
    .slice(0, 50)
  if (ids.length === 0) return Response.json({ companies: [] })

  const companies = await db.company.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true },
  })

  // latest ANNUAL metrics per company (each company's own latest year)
  const metricRows = (await db.$queryRawUnsafe(
    `SELECT cm."companyId", cm.code, cm.value, cm."fiscalYear", cm."periodLabel"
     FROM CalculatedMetric cm
     WHERE cm."companyId" IN (${ids.map(() => "?").join(",")})
       AND cm."periodType" = 'ANNUAL' AND cm."valueStatus" = 'OK' AND cm.value IS NOT NULL
       AND cm.code IN (${METRICS.map(() => "?").join(",")})
     ORDER BY cm."fiscalYear" DESC`,
    ...ids, ...METRICS
  )) as { companyId: string; code: string; value: number; fiscalYear: number; periodLabel: string }[]
  const metricByCompany = new Map<string, { fiscalYear: number; periodLabel: string; metrics: Record<string, number> }>()
  for (const r of metricRows) {
    let e = metricByCompany.get(r.companyId)
    if (!e || r.fiscalYear > e.fiscalYear) {
      e = { fiscalYear: r.fiscalYear, periodLabel: r.periodLabel, metrics: {} }
      metricByCompany.set(r.companyId, e)
    }
    if (r.fiscalYear === e.fiscalYear && !e.metrics[r.code]) e.metrics[r.code] = r.value
  }

  // prices: latest + ~1y-ago for the change badge
  const result: {
    id: string
    ticker: string
    nameEn: string
    nameAr: string | null
    sector: string
    price: number | null
    priceAsOf: string | null
    change1y: number | null
    fiscalYear: number | null
    periodLabel: string | null
    metrics: Record<string, number>
  }[] = []
  for (const c of companies) {
    const prices = await db.marketPrice.findMany({
      where: { companyId: c.id },
      orderBy: { asOf: "asc" },
      select: { price: true, asOf: true },
      take: 400,
    })
    let price: number | null = null
    let asOf: string | null = null
    let change1y: number | null = null
    if (prices.length > 0) {
      const last = prices[prices.length - 1]
      price = last.price
      asOf = last.asOf.toISOString()
      const cutoff = Date.now() - 365 * 24 * 3600 * 1000
      const base = [...prices].reverse().find((p) => p.asOf.getTime() <= cutoff) ?? prices[0]
      if (base.price > 0) change1y = ((last.price - base.price) / base.price) * 100
    }
    const m = metricByCompany.get(c.id)
    result.push({
      ...c,
      price,
      priceAsOf: asOf,
      change1y,
      fiscalYear: m?.fiscalYear ?? null,
      periodLabel: m?.periodLabel ?? null,
      metrics: m?.metrics ?? {},
    })
  }

  const metricDefs = METRICS.map((code) => ({
    code,
    labelEn: CALC_METRIC_MAP[code]?.labelEn ?? code,
    labelAr: CALC_METRIC_MAP[code]?.labelAr ?? code,
    unit: CALC_METRIC_MAP[code]?.unit ?? "RATIO",
  }))

  return Response.json({ companies: result, metricDefs })
}
