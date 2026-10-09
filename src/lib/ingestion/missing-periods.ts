// Missing-period detection — given a company, figure out which fiscal periods
// are missing from the database and produce a data quality report.

import { db } from "@/lib/db"
import { CRITICAL_METRIC_CODES, EXPECTED_METRIC_CODES, qualityTier, qualityTierDescription } from "@/lib/financial/data-quality"

export interface PeriodCoverage {
  periodKey: string
  periodType: string
  fiscalYear: number
  sub?: string
  hasReport: boolean
  reportStatus?: string
  valuesCount: number
  criticalCoverage: number
  expectedCoverage: number
}

export interface MissingPeriod {
  fiscalYear: number
  periodType: string
  sub?: string
  reason: string
}

export interface CompanyDataQualityReport {
  companyId: string
  ticker: string
  nameEn: string
  sector: string
  periods: PeriodCoverage[]
  missingPeriods: MissingPeriod[]
  latestAnnualPeriod?: PeriodCoverage
  latestQuarterlyPeriod?: PeriodCoverage
  overallCompleteness: number
  qualityTier: string
  qualityTierDescription: string
  generatedAt: string
}

/** Detect missing periods for a company — looking back N years from the latest
 *  filing year. Returns a list of missing periods with reasons. */
export async function detectMissingPeriods(companyId: string, lookbackYears: number = 3): Promise<MissingPeriod[]> {
  const company = await db.company.findUnique({ where: { id: companyId } })
  if (!company) return []
  const reports = await db.financialReport.findMany({
    where: { companyId, deletedAt: null, fiscalYear: { gte: new Date().getFullYear() - lookbackYears } },
    select: { periodType: true, fiscalYear: true, periodLabel: true, processingStatus: true },
  })
  const existingKeys = new Set(reports.map((r) => `${r.periodType}:${r.fiscalYear}:${extractSub(r.periodType, r.periodLabel)}`))
  const currentYear = new Date().getFullYear()
  const missing: MissingPeriod[] = []
  for (let y = currentYear; y >= currentYear - lookbackYears; y--) {
    if (!existingKeys.has(`ANNUAL:${y}:`)) {
      missing.push({ fiscalYear: y, periodType: "ANNUAL", reason: `No annual report found for FY ${y}` })
    }
    for (const q of ["Q1", "Q2", "Q3", "Q4"]) {
      if (!existingKeys.has(`QUARTERLY:${y}:${q}`)) {
        missing.push({ fiscalYear: y, periodType: "QUARTERLY", sub: q, reason: `No ${q} ${y} filing found` })
      }
    }
  }
  return missing
}

function extractSub(periodType: string, periodLabel: string): string {
  const label = periodLabel.toUpperCase()
  if (periodType === "QUARTERLY") {
    const m = label.match(/Q([1-4])/)
    return m ? `Q${m[1]}` : ""
  }
  if (periodType === "SEMIANNUAL") {
    const m = label.match(/H([1-2])/)
    return m ? `H${m[1]}` : ""
  }
  if (periodType === "NINE_MONTH") return "9M"
  return ""
}

/** Generate a comprehensive data quality report for a company. */
export async function generateDataQualityReport(companyId: string, lookbackYears: number = 3): Promise<CompanyDataQualityReport> {
  const company = await db.company.findUnique({ where: { id: companyId } })
  if (!company) {
    throw new Error(`Company ${companyId} not found`)
  }
  const reports = await db.financialReport.findMany({
    where: { companyId, deletedAt: null, fiscalYear: { gte: new Date().getFullYear() - lookbackYears } },
    include: {
      values: { select: { metricCode: true, validationStatus: true } },
    },
  })
  const periods: PeriodCoverage[] = reports.map((r) => {
    const sub = extractSub(r.periodType, r.periodLabel)
    const codes = new Set(r.values.map((v) => v.metricCode))
    const critical = [...CRITICAL_METRIC_CODES].filter((c) => codes.has(c)).length / CRITICAL_METRIC_CODES.size
    const expected = [...EXPECTED_METRIC_CODES].filter((c) => codes.has(c)).length / EXPECTED_METRIC_CODES.size
    return {
      periodKey: `${r.periodType}:${r.fiscalYear}:${sub}`,
      periodType: r.periodType,
      fiscalYear: r.fiscalYear,
      sub,
      hasReport: true,
      reportStatus: r.processingStatus,
      valuesCount: r.values.length,
      criticalCoverage: Math.round(critical * 100) / 100,
      expectedCoverage: Math.round(expected * 100) / 100,
    }
  })
  const missing = await detectMissingPeriods(companyId, lookbackYears)
  const latestAnnual = periods.filter((p) => p.periodType === "ANNUAL").sort((a, b) => b.fiscalYear - a.fiscalYear)[0]
  const latestQuarterly = periods.filter((p) => p.periodType === "QUARTERLY").sort((a, b) => b.fiscalYear - a.fiscalYear)[0]
  const overallCompleteness = periods.length > 0
    ? Math.round((periods.reduce((acc, p) => acc + p.expectedCoverage, 0) / periods.length) * 100) / 100
    : 0
  const tier = qualityTier(overallCompleteness)
  return {
    companyId: company.id,
    ticker: company.ticker,
    nameEn: company.nameEn,
    sector: company.sector,
    periods: periods.sort((a, b) => b.periodKey.localeCompare(a.periodKey)),
    missingPeriods: missing,
    latestAnnualPeriod: latestAnnual,
    latestQuarterlyPeriod: latestQuarterly,
    overallCompleteness,
    qualityTier: tier,
    qualityTierDescription: qualityTierDescription(tier),
    generatedAt: new Date().toISOString(),
  }
}
