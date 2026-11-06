import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { periodOrder, selectLatestByCompany, type PeriodRef } from "@/lib/financial/latest-period"
import { moverMap, readMarketSnapshot } from "@/lib/market/snapshot"
import { cached } from "@/lib/server-cache"

interface SectorAgg {
  sector: string
  companyCount: number
  avgRoe: number | null
  avgRoa: number | null
  avgNetMargin: number | null
  avgPe: number | null
  avgPb: number | null
  totalMarketCap: number | null
  totalRevenue: number | null
  totalNetProfit: number | null
  medianRoe: number | null
  medianPe: number | null
  medianPb: number | null
  periodLabel: string | null
  periodType: string | null
  fiscalYear: number | null
  /** Equal-weighted 1-day price change for the sector (fraction, e.g. 1.7 = +1.7%). */
  dayChangePct: number | null
  advancing: number
  declining: number
  unchanged: number
  pricedCompanyCount: number
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function emptySector(sector: string): SectorAgg {
  return {
    sector,
    companyCount: 0,
    avgRoe: null,
    avgRoa: null,
    avgNetMargin: null,
    avgPe: null,
    avgPb: null,
    totalMarketCap: null,
    totalRevenue: null,
    totalNetProfit: null,
    medianRoe: null,
    medianPe: null,
    medianPb: null,
    periodLabel: null,
    periodType: null,
    fiscalYear: null,
    dayChangePct: null,
    advancing: 0,
    declining: 0,
    unchanged: 0,
    pricedCompanyCount: 0,
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const basis = (url.searchParams.get("basis") ?? "latest") as "latest" | "annual" | "ttm"
  const rawYear = url.searchParams.get("year")
  const year = rawYear && /^\d{4}$/.test(rawYear) ? Number(rawYear) : null

  // Aggregating every active company's latest metrics is a heavy full-table
  // computation (~6s cold). Sector aggregates move only when the pipeline
  // recomputes or a market snapshot refreshes — serve from the stale-while-
  // revalidate cache and refresh in the background.
  const payload = await cached(`sectors:${basis}:${year ?? "auto"}`, 5 * 60_000, () => computeSectorAggregates(basis, year))
  return Response.json(payload)
}

async function computeSectorAggregates(basis: "latest" | "annual" | "ttm", year: number | null = null) {

  const companies = await db.company.findMany({
    where: { isActive: true },
    select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true, sharesOutstanding: true },
  })
  if (companies.length === 0) {
    return Response.json({ sectors: [] })
  }

  const companyIds = companies.map((c) => c.id)
  const codes = ["roe", "roa", "net_margin", "p_e", "p_b", "market_cap", "revenue", "net_profit"] as const

  const rows = await db.calculatedMetric.findMany({
    where: {
      companyId: { in: companyIds },
      code: { in: [...codes] },
      valueStatus: "OK",
      value: { not: null },
    },
  })

  // Flow totals (revenue / net profit) must never mix a quarter with a full
  // year. `latest` therefore means the latest FULL YEAR for totals, while
  // `ttm` uses the trailing-twelve-month window. A pinned `year` scopes both
  // flows and ratios to ONE fiscal year — the like-for-like historical view.
  const flowRowsAll = rows.filter((r) => r.periodType === (basis === "ttm" ? "TTM" : "ANNUAL"))
  const flowRows = year ? flowRowsAll.filter((r) => r.fiscalYear === year) : flowRowsAll
  const latestFlows = selectLatestByCompany(flowRows, ["revenue", "net_profit", "market_cap"])

  // Ratios use the requested basis. ROE/ROA/margin compare a flow with a
  // balance-sheet base, so a Q1 ratio is not annualised and must not be mixed
  // with TTM/annual values; only full periods are eligible for those three.
  const ratioRowsAll = basis === "latest"
    ? rows
    : rows.filter((r) => r.periodType === (basis === "annual" ? "ANNUAL" : "TTM"))
  const ratioRows = year ? ratioRowsAll.filter((r) => r.fiscalYear === year) : ratioRowsAll

  // Fiscal years this basis actually covers (sector-independent, pin-free) —
  // the UI period dropdown renders exactly this list.
  const years = [...new Set([...flowRowsAll, ...ratioRowsAll].map((r) => r.fiscalYear))].sort((a, b) => b - a)

  const latestRatios = selectLatestByCompany(
    ratioRows,
    ["roe", "roa", "net_margin", "p_e", "p_b"],
    { fullPeriodCodes: ["roe", "roa", "net_margin"] },
  )

  const snapshot = readMarketSnapshot()
  const movers = moverMap(snapshot)

  const sectorMap = new Map<string, SectorAgg>()
  for (const c of companies) {
    if (!sectorMap.has(c.sector)) sectorMap.set(c.sector, emptySector(c.sector))
  }

  const metricsBySector: Record<string, {
    roe: number[]
    roa: number[]
    netMargin: number[]
    pe: number[]
    pb: number[]
    marketCap: number[]
    revenue: number[]
    netProfit: number[]
    changes: number[]
  }> = {}

  const considerAnchor = (sector: string, period: PeriodRef | null) => {
    if (!period) return
    const agg = sectorMap.get(sector)
    if (!agg) return
    const currentOrder = agg.periodLabel
      ? periodOrder(agg.periodType ?? "ANNUAL", agg.fiscalYear ?? 0, agg.periodLabel)
      : -1
    const candidateOrder = periodOrder(period.type, period.fiscalYear, period.label)
    if (candidateOrder > currentOrder) {
      agg.periodLabel = period.label
      agg.periodType = period.type
      agg.fiscalYear = period.fiscalYear
    }
  }

  for (const c of companies) {
    const agg = sectorMap.get(c.sector)
    if (!agg) continue
    agg.companyCount++

    const m = (metricsBySector[c.sector] ??= {
      roe: [], roa: [], netMargin: [], pe: [], pb: [],
      marketCap: [], revenue: [], netProfit: [], changes: [],
    })

    const flow = latestFlows.get(c.id)
    const ratio = latestRatios.get(c.id)

    const push = (arr: number[], value: number | null | undefined) => {
      if (typeof value === "number" && Number.isFinite(value)) arr.push(value)
    }

    push(m.revenue, flow?.values.revenue)
    push(m.netProfit, flow?.values.net_profit)
    push(m.roe, ratio?.values.roe)
    push(m.roa, ratio?.values.roa)
    push(m.netMargin, ratio?.values.net_margin)
    push(m.pe, ratio?.values.p_e)
    push(m.pb, ratio?.values.p_b)

    considerAnchor(c.sector, flow?.periods.revenue ?? null)
    considerAnchor(c.sector, flow?.periods.net_profit ?? null)
    considerAnchor(c.sector, ratio?.periods.roe ?? null)
    considerAnchor(c.sector, ratio?.periods.roa ?? null)

    // Current market cap from the freshest snapshot price × shares, falling
    // back to the stored market_cap metric only when the snapshot has no row.
    const mover = movers.get(c.ticker.toUpperCase())
    if (mover) {
      push(m.changes, mover.changePct)
      agg.pricedCompanyCount++
      if (mover.changePct > 0) agg.advancing++
      else if (mover.changePct < 0) agg.declining++
      else agg.unchanged++
      if (c.sharesOutstanding && c.sharesOutstanding > 0) {
        push(m.marketCap, mover.price * c.sharesOutstanding)
      }
    } else {
      push(m.marketCap, flow?.values.market_cap)
    }
  }

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)
  const sum = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) : null)

  const results: SectorAgg[] = []
  for (const [sector, agg] of sectorMap) {
    const m = metricsBySector[sector] ?? {
      roe: [], roa: [], netMargin: [], pe: [], pb: [],
      marketCap: [], revenue: [], netProfit: [], changes: [],
    }
    agg.avgRoe = avg(m.roe)
    agg.avgRoa = avg(m.roa)
    agg.avgNetMargin = avg(m.netMargin)
    agg.avgPe = avg(m.pe)
    agg.avgPb = avg(m.pb)
    agg.totalMarketCap = sum(m.marketCap)
    agg.totalRevenue = sum(m.revenue)
    agg.totalNetProfit = sum(m.netProfit)
    agg.medianRoe = median(m.roe)
    agg.medianPe = median(m.pe)
    agg.medianPb = median(m.pb)
    agg.dayChangePct = avg(m.changes)
    results.push(agg)
  }

  results.sort((a, b) => b.companyCount - a.companyCount)

  return { sectors: results, basis, year, years }
}
