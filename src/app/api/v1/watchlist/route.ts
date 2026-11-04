import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { CALC_METRIC_MAP } from "@/lib/financial/registry"
import { fetchCalcMany } from "@/lib/financial/statement-pref"

// GET /api/v1/watchlist?ids=a,b,c — snapshot per watched company: latest recorded
// price + 1Y change, latest verified ANNUAL metrics. The ids come from the
// client-side watchlist store (a user preference, not server state).
//
// Calculated metrics are fetched through the shared statement-preference helper
// (CONSOLIDATED when a company has consolidated rows, otherwise STANDALONE), so
// the watchlist can never mix the two bases. Prices are fetched in one query
// instead of one query per company.

const METRICS = ["revenue", "net_profit", "net_margin", "roe", "p_e", "dividend_yield"] as const

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

  // latest ANNUAL metrics per company (each company's own latest year, one
  // statement basis per company)
  const { filtered } = await fetchCalcMany(ids, {
    periodType: "ANNUAL",
    code: { in: [...METRICS] },
  })
  const metricByCompany = new Map<string, { fiscalYear: number; periodLabel: string; metrics: Record<string, number> }>()
  for (const r of filtered) {
    if (r.valueStatus !== "OK" || r.value === null) continue
    let e = metricByCompany.get(r.companyId)
    if (!e || r.fiscalYear > e.fiscalYear) {
      e = { fiscalYear: r.fiscalYear, periodLabel: r.periodLabel, metrics: {} }
      metricByCompany.set(r.companyId, e)
    }
    if (r.fiscalYear === e.fiscalYear && e.metrics[r.code] === undefined) {
      e.metrics[r.code] = r.value
    }
  }

  // prices: latest + ~1y-ago for the change badge, in one query
  const priceRows = await db.marketPrice.findMany({
    where: { companyId: { in: ids }, asOf: { lte: new Date() } },
    orderBy: [{ companyId: "asc" }, { asOf: "asc" }],
    select: { companyId: true, price: true, asOf: true },
  })
  const pricesByCompany = new Map<string, { price: number; asOf: Date }[]>()
  for (const p of priceRows) {
    if (!pricesByCompany.has(p.companyId)) pricesByCompany.set(p.companyId, [])
    pricesByCompany.get(p.companyId)!.push({ price: p.price, asOf: p.asOf })
  }

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
    const prices = pricesByCompany.get(c.id) ?? []
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
