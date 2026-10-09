import { db } from "@/lib/db"
import { evaluateUndervaluation, type MetricMap } from "@/lib/analytics/engine"

// GET /api/v1/undervalued — 5-criteria undervaluation screen (spec §4.3) with
// 3-method fair value (spec §4.4). BATCHED: 4 queries total, computed in memory.

const TRUSTED = ["VALIDATED", "APPROVED", "EXTRACTED"]
const NEEDED = ["CURRENT_ASSETS", "INVENTORY", "CURRENT_LIABILITIES", "OPERATING_INCOME", "EBIT", "INTEREST_EXPENSE", "REVENUE", "TOTAL_ASSETS"]

function buildMaps(
  allMetrics: { companyId: string; code: string; value: number | null; fiscalYear: number }[],
  reports: { id: string; companyId: string; fiscalYear: number }[],
  rawVals: { reportId: string; metricCode: string; normalizedValue: number | null }[],
  prices: { companyId: string; price: number }[],
) {
  // latest consolidated metric per company+code
  const cmMap = new Map<string, MetricMap>()
  const cmYear = new Map<string, number>()
  for (const r of allMetrics) {
    if (r.value === null) continue
    const cur = cmYear.get(r.companyId)
    if (cur === undefined || r.fiscalYear > cur) cmYear.set(r.companyId, r.fiscalYear)
    const key = r.companyId + "|" + r.fiscalYear
    if (!cmMap.has(key)) cmMap.set(key, {})
    ;(cmMap.get(key) as MetricMap)[r.code.toUpperCase()] = r.value
  }
  const reportYear = new Map(reports.map((r) => [r.companyId, r.fiscalYear]))
  const rawByReport = new Map<string, MetricMap>()
  for (const v of rawVals) {
    if (!rawByReport.has(v.reportId)) rawByReport.set(v.reportId, {})
    ;(rawByReport.get(v.reportId) as MetricMap)[v.metricCode.toUpperCase()] = v.normalizedValue
  }
  const priceByCo = new Map(prices.map((p) => [p.companyId, p.price]))

  const buildLatest = (companyId: string): MetricMap | null => {
    const year = cmYear.get(companyId)
    const base = year !== undefined ? cmMap.get(companyId + "|" + year) : undefined
    if (!base) return null
    const repId = reports.find((r) => r.companyId === companyId && r.fiscalYear === year)?.id
    const raw = repId ? rawByReport.get(repId) : undefined
    return { ...base, ...(raw ?? {}) }
  }
  const buildPrior = (companyId: string): MetricMap | null => {
    const year = cmYear.get(companyId)
    if (year === undefined) return null
    return cmMap.get(companyId + "|" + (year - 1)) ?? null
  }
  const priceOf = (companyId: string) => priceByCo.get(companyId) ?? null
  return { buildLatest, buildPrior, priceOf, cmYear }
}

export async function GET() {
  const year = new Date().getFullYear()
  const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true, nameAr: true, nameEn: true, sector: true } })
  const ids = companies.map((c) => c.id)

  const [allMetrics, reports, rawVals, prices] = await Promise.all([
    db.calculatedMetric.findMany({
      where: { companyId: { in: ids }, valueStatus: "OK", statementType: "CONSOLIDATED" },
      select: { companyId: true, code: true, value: true, fiscalYear: true },
    }),
    db.financialReport.findMany({
      where: { companyId: { in: ids }, periodType: "ANNUAL", processingStatus: { in: TRUSTED }, statementType: "CONSOLIDATED" },
      select: { id: true, companyId: true, fiscalYear: true },
      orderBy: { version: "desc" },
    }),
    db.financialValue.findMany({
      where: { report: { periodType: "ANNUAL", processingStatus: { in: TRUSTED }, statementType: "CONSOLIDATED" }, metricCode: { in: NEEDED }, validationStatus: "VALID" },
      select: { reportId: true, metricCode: true, normalizedValue: true },
    }),
    db.marketPrice.findMany({
      where: { companyId: { in: ids }, asOf: { gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } },
      orderBy: { asOf: "desc" },
      select: { companyId: true, price: true },
    }),
  ])

  const { buildLatest, buildPrior, priceOf } = buildMaps(allMetrics, reports, rawVals, prices)
  // dedupe reports to latest version per (company, year)
  const seenRep = new Set<string>()
  const latestReports = reports.filter((r) => {
    const k = r.companyId + "|" + r.fiscalYear
    if (seenRep.has(k)) return false
    seenRep.add(k)
    return true
  })
  const { buildLatest: bL, buildPrior: bP } = buildMaps(
    allMetrics, latestReports.map((r) => ({ id: r.id, companyId: r.companyId, fiscalYear: r.fiscalYear })), rawVals, prices,
  )
  void buildLatest
  void buildPrior

  const companyOf = new Map(companies.map((c) => [c.id, c]))
  // per-company maps
  const maps = new Map<string, MetricMap>()
  for (const r of latestReports) {
    const m = bL(r.companyId)
    if (m) maps.set(r.companyId, m)
  }

  // sector medians per metric across companies with data
  const sectorOf = (sector: string) => companies.filter((c) => c.sector === sector).map((c) => c.id)
  const medianFor = (sector: string, code: string, direction = 1): number | null => {
    const vals = sectorOf(sector)
      .map((id) => maps.get(id)?.[code])
      .filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v))
      .sort((a, b) => a * direction - b * direction)
    return vals.length ? vals[Math.floor(vals.length / 2)] : null
  }
  const percentileFor = (sector: string, code: string, p: number): number | null => {
    const vals = sectorOf(sector)
      .map((id) => maps.get(id)?.[code])
      .filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v))
      .sort((a, b) => a - b)
    return vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * p))] : null
  }

  const out: unknown[] = []
  const sectors = [...new Set(companies.map((c) => c.sector))]
  for (const sector of sectors) {
    for (const co of companies.filter((c) => c.sector === sector)) {
      const m = maps.get(co.id)
      if (!m) continue
      const price = priceOf(co.id)
      if (!price) continue
      const sectorStats = {
        medianPE: medianFor(sector, "P_E"),
        medianPB: medianFor(sector, "P_B"),
        yield75th: percentileFor(sector, "DIVIDEND_YIELD", 0.75),
        medianROE: medianFor(sector, "ROE"),
        evEbitda25th: null,
        medianEvEbitda: null,
      }
      const r = evaluateUndervaluation({ ...m, currentPrice: price } as Parameters<typeof evaluateUndervaluation>[0], sectorStats)
      if (!r.flagged) continue
      out.push({
        companyId: co.id, ticker: co.ticker, name: co.nameAr || co.nameEn, sector: co.sector,
        currentPrice: price, fairValue: r.fairValue, upside: r.upside,
        method: r.method, criteriaMet: r.criteriaMet,
      })
    }
  }
  out.sort((a, b) => ((b as { upside: number | null }).upside ?? -999) - ((a as { upside: number | null }).upside ?? -999))
  return Response.json({ engine: "undervalued-v2-batched", detected: out.length, results: out.slice(0, 30), lastUpdated: new Date().toISOString() })
}
