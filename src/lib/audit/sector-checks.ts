// CATEGORY 8: Sector-Specific Sanity Checks — banks, insurance, real estate,
// manufacturing must-have / must-not-have rules.
//
// Must-have gaps are coverage; only contradictory lines (e.g. inventory on a
// bank's balance sheet) are blockers. Metrics already in criticalMetricsFor()
// are not repeated here.

import type { AuditCheckResult, AuditSeverity } from "./types"
import { criticalMetricsFor } from "./missing-data-checks"

export interface SectorPeriodValues {
  period: string
  [metricCode: string]: number | string | undefined
}

const MUST_NOT_HAVE: Record<string, Array<{ metric: string; label: string; severity: AuditSeverity; issueClass: "blocker" | "advisory" }>> = {
  Banks: [
    { metric: "INVENTORY", label: "Inventory", severity: "high", issueClass: "blocker" },
    { metric: "COGS", label: "Cost of Sales", severity: "low", issueClass: "advisory" },
  ],
  Insurance: [
    { metric: "COGS", label: "Cost of Sales", severity: "low", issueClass: "advisory" },
  ],
}

const MUST_HAVE: Record<string, Array<{ metric: string; label: string; yearly: boolean }>> = {
  Banks: [
    { metric: "NET_INTEREST_INCOME", label: "Net Interest Income", yearly: false },
    { metric: "LOANS_TO_CUSTOMERS", label: "Loans to Customers", yearly: true },
    { metric: "CUSTOMER_DEPOSITS", label: "Customer Deposits", yearly: true },
  ],
  Insurance: [
    { metric: "NET_PREMIUMS_WRITTEN", label: "Net Premiums Written", yearly: false },
  ],
  "Real Estate": [
    { metric: "INVENTORY", label: "Inventory (land + WIP)", yearly: false },
  ],
  Industrial: [
    { metric: "COGS", label: "Cost of Sales", yearly: false },
    { metric: "INVENTORY", label: "Inventory", yearly: false },
  ],
  Food: [
    { metric: "COGS", label: "Cost of Sales", yearly: false },
  ],
}

export function runSectorChecks(
  ticker: string,
  sector: string,
  periods: SectorPeriodValues[],
): AuditCheckResult[] {
  const results: AuditCheckResult[] = []
  if (periods.length === 0) return results

  // 8.1 MUST-NOT-HAVE (wrong sector classification or wrong data)
  const notAllowed = MUST_NOT_HAVE[sector]
  if (notAllowed) {
    for (const p of periods) {
      for (const { metric, label, severity, issueClass } of notAllowed) {
        const v = p[metric]
        if (typeof v === "number" && Math.abs(v) > 1000) {
          results.push({
            checkName: "SECTOR_FORBIDDEN_METRIC",
            category: "sector",
            severity,
            passed: false, ticker, period: p.period, metricCode: metric,
            currentValue: v, autoFixable: false,
            issueClass, rootCause: "SECTOR_RULE",
            details: `${sector} sector company has ${label}=${v.toExponential(3)} in ${p.period} — wrong sector classification or wrong data.`,
            detailsAr: `شركة من قطاع ${sector} لديها بند ${label} — تصنيف قطاعي غير صحيح أو بيانات خاطئة.`,
          })
        }
      }
    }
  }

  // 8.2 MUST-HAVE (sector essentials absent across the whole history)
  const criticals = new Set(criticalMetricsFor(sector))
  const required = MUST_HAVE[sector]?.filter(r => !criticals.has(r.metric)) ?? []
  for (const { metric, label } of required) {
    const presentInAny = periods.some(p => {
      const v = p[metric]
      return typeof v === "number" && v !== 0
    })
    if (!presentInAny) {
      results.push({
        checkName: "SECTOR_REQUIRED_METRIC_MISSING",
        category: "sector", severity: "medium",
        passed: false, ticker, metricCode: metric, autoFixable: false,
        issueClass: "coverage", rootCause: "SECTOR_RULE",
        details: `Sector ${sector} requires ${label} — absent across all ${periods.length} periods (data gap, deep-fetch needed).`,
        detailsAr: `قطاع ${sector} يتطلب بند ${label} — غائب عن كل الفترات (${periods.length}).`,
      })
    }
  }

  return results
}
