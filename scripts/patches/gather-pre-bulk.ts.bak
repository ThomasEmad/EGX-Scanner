// Data gathering for the analytics engines: builds MetricMaps for a company
// (latest fiscal year + prior year) from verified CalculatedMetric rows, plus
// derived ratios (quick ratio, interest coverage, asset turnover) from raw
// FinancialValue inputs. Percent-unit metrics stay PERCENT; ratios are decimals.

import { db } from "@/lib/db"

export type MetricMap = Record<string, number | null>

const TRUSTED = ["VALIDATED", "APPROVED", "EXTRACTED"]

export type GatheredAnalytics = {
  ticker: string
  nameAr: string | null
  nameEn: string
  sector: string
  isBank: boolean
  latestYear: number
  latest: MetricMap
  prior: MetricMap | null
  priceReturn1Y: number | null
  currentPrice: number | null
  peers: { id: string; ticker: string; latest: MetricMap }[]
}

async function metricMapForYear(companyId: string, fiscalYear: number): Promise<MetricMap> {
  // periodType: ANNUAL is mandatory — without it interim (Q1/H1/9M) cumulative
  // values of the same fiscalYear overwrite the annual figures last-write-wins.
  const rows = await db.calculatedMetric.findMany({
    where: { companyId, fiscalYear, valueStatus: "OK", statementType: "CONSOLIDATED", periodType: "ANNUAL" },
    select: { code: true, value: true },
  })
  const out: MetricMap = {}
  for (const r of rows) out[r.code.toUpperCase()] = r.value
  return out
}

/** Raw-value derived ratios for one fiscal year (quick ratio, interest coverage, asset turnover). */
async function derivedRatios(companyId: string, fiscalYear: number): Promise<MetricMap> {
  const report = await db.financialReport.findFirst({
    where: { companyId, periodType: "ANNUAL", fiscalYear, statementType: "CONSOLIDATED", processingStatus: { in: TRUSTED } },
    orderBy: { version: "desc" },
    select: { id: true },
  })
  if (!report) return {}
  const vals = await db.financialValue.findMany({
    where: { reportId: report.id, validationStatus: "VALID" },
    select: { metricCode: true, normalizedValue: true },
  })
  const v: MetricMap = {}
  for (const x of vals) v[x.metricCode.toUpperCase()] = x.normalizedValue
  const out: MetricMap = {}
  const ca = v.CURRENT_ASSETS ?? null, inv = v.INVENTORY ?? null, cl = v.CURRENT_LIABILITIES ?? null
  if (ca !== null && cl !== null && cl !== 0) {
    out.QUICK_RATIO = Math.max(0, (ca - (inv ?? 0)) / cl)
  }
  const opInc = v.OPERATING_INCOME ?? v.EBIT ?? null
  const intExp = v.INTEREST_EXPENSE ?? null
  if (opInc !== null && intExp !== null && intExp > 0) {
    out.INTEREST_COVERAGE = opInc / intExp
  }
  const rev = v.REVENUE ?? null
  const ta = v.TOTAL_ASSETS ?? null
  if (rev !== null && ta !== null && ta !== 0) {
    out.ASSET_TURNOVER = rev / ta
  }
  return out
}

export async function gatherCompanyAnalytics(companyId: string): Promise<GatheredAnalytics | null> {
  const co = await db.company.findUnique({
    where: { id: companyId },
    select: { id: true, ticker: true, nameAr: true, nameEn: true, sector: true },
  })
  if (!co) return null
  const isBank = co.sector.toLowerCase().includes("bank")

  // latest fiscal year with data
  const latestRep = await db.financialReport.findFirst({
    where: { companyId, periodType: "ANNUAL", processingStatus: { in: TRUSTED } },
    orderBy: { fiscalYear: "desc" },
    select: { fiscalYear: true },
  })
  const latestYear = latestRep?.fiscalYear
  if (!latestYear) return null

  const [latestCM, priorCM] = await Promise.all([metricMapForYear(companyId, latestYear), metricMapForYear(companyId, latestYear - 1)])
  const [latestDer, priorDer] = await Promise.all([derivedRatios(companyId, latestYear), derivedRatios(companyId, latestYear - 1)])
  const latest: MetricMap = { ...latestCM, ...latestDer }
  const prior: MetricMap = { ...priorCM, ...priorDer }

  // price return over ~1 year from market prices
  const prices = await db.marketPrice.findMany({
    where: { companyId, asOf: { gte: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) } },
    orderBy: { asOf: "asc" },
    select: { price: true, asOf: true },
    take: 500,
  })
  let priceReturn1Y: number | null = null
  let currentPrice: number | null = null
  if (prices.length >= 2) {
    const first = prices[0].price
    const last = prices[prices.length - 1].price
    currentPrice = last
    if (first > 0) priceReturn1Y = ((last - first) / first) * 100
  }

  // sector peers (same fiscal year) — same construction, lightweight
  const peers = await db.company.findMany({
    where: { sector: co.sector, isActive: true, id: { not: companyId } },
    select: { id: true, ticker: true },
  })
  const peerMaps: GatheredAnalytics["peers"] = []
  for (const p of peers.slice(0, 40)) {
    // each peer contributes its OWN latest fiscal year (years vary across companies)
    const pRep = await db.financialReport.findFirst({
      where: { companyId: p.id, periodType: "ANNUAL", processingStatus: { in: TRUSTED } },
      orderBy: { fiscalYear: "desc" },
      select: { fiscalYear: true },
    })
    if (!pRep) continue
    const [pcm, pdr] = await Promise.all([metricMapForYear(p.id, pRep.fiscalYear), derivedRatios(p.id, pRep.fiscalYear)])
    peerMaps.push({ id: p.id, ticker: p.ticker, latest: { ...pcm, ...pdr } })
  }

  return {
    ticker: co.ticker,
    nameAr: co.nameAr,
    nameEn: co.nameEn,
    sector: co.sector,
    isBank,
    latestYear,
    latest,
    prior,
    priceReturn1Y,
    currentPrice,
    peers: peerMaps,
  }
}
