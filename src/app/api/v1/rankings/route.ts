import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { CALC_METRIC_MAP } from "@/lib/financial/registry"
import {
  isStalePeriod,
  periodOrder,
  selectLatestByCompany,
  type PeriodRef,
} from "@/lib/financial/latest-period"

// GET /api/v1/rankings?metric=roe&sector=Banks&order=desc&basis=latest
//
// basis=latest → each company's LATEST AVAILABLE value for the metric, with
//                 the period that supplied it. There is deliberately NO shared
//                 "2025 window": companies file on different calendars, and
//                 forcing everyone onto one year either hides a Q2 2026 filing
//                 or compares a stale annual ROE with a current quarter.
//                 For ROE/ROA, "latest" means the latest FULL period (TTM or
//                 annual): a Q1 return is not annualised, so it cannot be
//                 ranked against a TTM/annual return.
//                 Rows older than the market's freshest period by more than
//                 four quarters are flagged `stale` (shown with a badge) rather
//                 than silently dropped.
// basis=annual → each company's latest ANNUAL value.
// basis=ttm    → each company's latest TTM value (full-period, like-for-like
//                 for flow metrics such as ROE / margins / revenue).
//
// Every row displays its own periodLabel, so the basis of each figure is visible.

interface RankRow {
  companyId: string
  ticker: string
  nameEn: string
  nameAr: string | null
  sector: string
  value: number
  fiscalYear: number
  periodLabel: string
  periodType: string
  stale: boolean
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const metric = url.searchParams.get("metric") ?? "roe"
  if (!CALC_METRIC_MAP[metric]) {
    return Response.json({ error: "UNKNOWN_METRIC", message: "metric must be one of the calculated metric codes" }, { status: 400 })
  }
  const sector = url.searchParams.get("sector")
  const order = url.searchParams.get("order") === "asc" ? "ASC" : "DESC"
  const rawBasis = url.searchParams.get("basis")
  const basis: "latest" | "annual" | "ttm" = rawBasis === "annual" || rawBasis === "ttm" ? rawBasis : "latest"

  const companies = await db.company.findMany({
    where: { isActive: true, ...(sector ? { sector } : {}) },
    select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true },
  })
  if (companies.length === 0) {
    return Response.json({ metric: metricInfo(metric), basis, results: [], sectors: await sectors(), total: 0 })
  }

  const rows = await db.calculatedMetric.findMany({
    where: {
      companyId: { in: companies.map((c) => c.id) },
      code: metric,
      valueStatus: "OK",
      value: { not: null },
    },
  })

  const filtered = basis === "latest"
    ? rows
    : rows.filter((r) => r.periodType === (basis === "annual" ? "ANNUAL" : "TTM"))

  const latest = selectLatestByCompany(filtered, [metric], {
    fullPeriodCodes: ["roe", "roa", "roic", "roce"],
  })
  const anchors = [...latest.values()]
    .map((v) => v.periods[metric])
    .filter((p): p is PeriodRef => p !== null)
  const freshestOrder = anchors.reduce((m, p) => Math.max(m, periodOrder(p.type, p.fiscalYear, p.label)), 0)

  const results: RankRow[] = []
  for (const c of companies) {
    const row = latest.get(c.id)
    const value = row?.values[metric]
    const period = row?.periods[metric]
    if (value === null || value === undefined || !period) continue
    results.push({
      companyId: c.id,
      ticker: c.ticker,
      nameEn: c.nameEn,
      nameAr: c.nameAr,
      sector: c.sector,
      value,
      fiscalYear: period.fiscalYear,
      periodLabel: period.label,
      periodType: period.type,
      stale: isStalePeriod(period, freshestOrder),
    })
  }
  results.sort((a, b) =>
    Number(a.stale) - Number(b.stale) ||
    (order === "ASC" ? a.value - b.value : b.value - a.value)
  )

  return Response.json({
    metric: metricInfo(metric),
    basis,
    results,
    sectors: await sectors(),
    total: results.length,
  })
}

function metricInfo(code: string) {
  const def = CALC_METRIC_MAP[code]
  return { code, labelEn: def.labelEn, labelAr: def.labelAr, unit: def.unit }
}

async function sectors(): Promise<string[]> {
  const rows = await db.company.findMany({
    where: { isActive: true },
    select: { sector: true },
    distinct: ["sector"],
    orderBy: { sector: "asc" },
  })
  return rows.map((s) => s.sector)
}
