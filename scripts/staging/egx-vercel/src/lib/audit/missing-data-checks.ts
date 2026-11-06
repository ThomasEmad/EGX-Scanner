// CATEGORY 5: Missing Critical Data — universal critical metrics,
// sector-specific must-haves, period coverage gaps.
//
// All findings in this category are COVERAGE findings, never data errors.
// When a metric exists but every value is quarantined, the message says so and
// the remediation is re-extraction — not "the company never reported it".

import type { AuditCheckResult, AuditSeverity } from "./types"

/** Sector-aware critical metric set. */
export function criticalMetricsFor(sector: string): string[] {
  switch (sector) {
    case "Banks":
      return ["TOTAL_ASSETS", "TOTAL_EQUITY", "NET_PROFIT", "NET_INTEREST_INCOME", "LOANS_TO_CUSTOMERS", "CUSTOMER_DEPOSITS"]
    case "Insurance":
      return ["TOTAL_ASSETS", "TOTAL_EQUITY", "NET_PROFIT"]
    case "Financial Services":
    case "Investment":
      // Investment/holding companies often report investment income rather
      // than a conventional revenue line. Revenue is still useful when it
      // exists, but its absence is not a critical data gap for these sectors.
      return ["TOTAL_ASSETS", "TOTAL_EQUITY", "NET_PROFIT"]
    case "Telecom":
    case "Healthcare":
    case "Food":
    case "Consumer":
    case "Industrial":
    case "Energy":
    case "Basic Materials":
    case "Construction":
    case "Real Estate":
    case "Building Materials":
    case "Textiles":
    case "Paper":
    case "Chemicals":
    case "Travel & Leisure":
    case "Transport":
    case "Trade":
    case "Education":
      return ["REVENUE", "NET_PROFIT", "TOTAL_ASSETS", "TOTAL_EQUITY", "COGS", "OPERATING_CASH_FLOW"]
    default:
      return ["REVENUE", "NET_PROFIT", "TOTAL_ASSETS", "TOTAL_EQUITY", "OPERATING_CASH_FLOW"]
  }
}

const SECTOR_CRITICAL: Record<string, string[]> = {
  Banks: ["LOANS_TO_CUSTOMERS", "CUSTOMER_DEPOSITS", "NET_INTEREST_INCOME"],
  "Financial Services": ["INVESTMENTS"],
  "Real Estate": ["INVENTORY"],
  Industrial: ["INVENTORY"],
  Food: ["INVENTORY"],
  "Building Materials": ["INVENTORY"],
  Textiles: ["INVENTORY"],
  Paper: ["INVENTORY"],
  Trade: ["INVENTORY"],
}

// Sector-specific gaps that are NOT already part of criticalMetricsFor are
// reported by the sector checks. Keeping a single source of truth avoids
// reporting the same missing bank KPI three times.

export interface CompanyCoverageInput {
  ticker: string
  sector: string
  /** metric → set of fiscal years present (any period type) */
  coverage: Map<string, Set<number>>
  /** metric → set of fiscal years with ANNUAL data (for trend checks) */
  annualCoverage?: Map<string, Set<number>>
  /** metrics that exist in the DB but are fully quarantined */
  quarantinedMetrics?: Set<string>
  latestFiscalYear: number
}

export function runMissingDataChecks(input: CompanyCoverageInput): AuditCheckResult[] {
  const { ticker, sector, coverage } = input
  const results: AuditCheckResult[] = []
  const annualCoverage = input.annualCoverage ?? coverage
  const quarantined = input.quarantinedMetrics ?? new Set<string>()

  // 5.1 sector-aware critical metrics — check any period type (existence)
  const criticals = criticalMetricsFor(sector)
  for (const metric of criticals) {
    const periods = coverage.get(metric)
    if (!periods || periods.size === 0) {
      const isQuarantined = quarantined.has(metric)
      results.push({
        checkName: "MISSING_CRITICAL_METRIC",
        category: "missing",
        severity: metric === "REVENUE" || metric === "NET_PROFIT" ? "critical" : "high",
        passed: false, ticker, metricCode: metric, autoFixable: false,
        issueClass: "coverage", rootCause: "MISSING_METRIC",
        details: isQuarantined
          ? `${metric} exists only as quarantined values — excluded from analytics; re-extract from the original filing.`
          : `${metric} has no data recorded — cannot compute essential ratios.`,
        detailsAr: isQuarantined
          ? `${metric} موجود بقيم معزولة فقط — مستبعد من التحليل؛ يلزم إعادة الاستخراج من القوائم الأصلية.`
          : `${metric} لا يوجد له أي بيانات — يتعذر حساب النسب الأساسية.`,
      })
    }
  }

  // 5.2 sector-specific criticals — only metrics not covered by the critical set
  // (prevents triple-reporting the same missing bank KPI).
  const sectorCriticals = SECTOR_CRITICAL[sector]?.filter(m => !criticals.includes(m))
  if (sectorCriticals && sectorCriticals.length > 0) {
    for (const metric of sectorCriticals) {
      const periods = coverage.get(metric)
      if (!periods || periods.size === 0) {
        results.push({
          checkName: "MISSING_SECTOR_METRIC",
          category: "missing", severity: "medium",
          passed: false, ticker, metricCode: metric, autoFixable: false,
          issueClass: "coverage", rootCause: "MISSING_METRIC",
          details: quarantined.has(metric)
            ? `Sector ${sector} expects ${metric} — present only as quarantined values; re-extract.`
            : `Sector ${sector} expects ${metric} — absent in database.`,
          detailsAr: `قطاع ${sector} يتطلب وجود ${metric} — ${quarantined.has(metric) ? "موجود بقيم معزولة فقط؛ يلزم إعادة الاستخراج" : "غائبة"}.`,
        })
      }
    }
  }

  // 5.3 period gaps in the last 5 years (annual coverage only)
  const targetYears: number[] = []
  const latest = Math.max(input.latestFiscalYear, new Date().getFullYear() - 1)
  for (let y = latest - 4; y <= latest; y++) targetYears.push(y)
  // Financial-sector filings do not always have a conventional revenue line.
  // Use net profit as the trend anchor for banks/insurers/investment firms;
  // industrial and commercial companies continue to use revenue.
  const financialSector = ["Banks", "Insurance", "Financial Services", "Investment"].includes(sector)
  const trendMetric = financialSector ? "NET_PROFIT" : "REVENUE"
  const trendPeriods = annualCoverage.get(trendMetric) ?? new Set<number>()
  const present = targetYears.filter(y => trendPeriods.has(y))
  const gapCount = targetYears.length - present.length
  const trendLabelEn = financialSector ? "net profit" : "revenue"
  const trendLabelAr = financialSector ? "صافي الربح" : "الإيرادات"
  if (present.length < 3) {
    results.push({
      checkName: "INSUFFICIENT_TREND_DATA", category: "missing", severity: "high",
      passed: false, ticker, autoFixable: false,
      issueClass: "coverage", rootCause: "TREND_COVERAGE",
      details: `Only ${present.length} of the last 5 years have annual ${trendLabelEn} data (${present.join(", ") || "none"}) — trend analysis impossible.`,
      detailsAr: `${present.length} سنوات فقط من أصل 5 لديها بيانات ${trendLabelAr} سنوية — يتعذر تحليل الاتجاه.`,
    })
  } else if (gapCount > 0) {
    results.push({
      checkName: "PERIOD_GAP", category: "missing", severity: "low",
      passed: false, ticker, autoFixable: false,
      issueClass: "coverage", rootCause: "TREND_COVERAGE",
      details: `Missing annual ${trendLabelEn} data for years: ${targetYears.filter(y => !trendPeriods.has(y)).join(", ")}.`,
      detailsAr: `بيانات ${trendLabelAr} سنوية مفقودة للسنوات: ${targetYears.filter(y => !trendPeriods.has(y)).join(", ")}.`,
    })
  }

  return results
}

export type { AuditSeverity }
