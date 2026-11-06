// CATEGORY 6: Statistical & cross-sectional Outliers (per sector).
// Fail-safe: guards against extreme ratios that usually indicate bad data.

import type { AuditCheckResult, AuditSeverity } from "./types"

export interface OutlierPeriodValues {
  period: string
  REVENUE?: number
  NET_PROFIT?: number
  TOTAL_ASSETS?: number
  TOTAL_EQUITY?: number
  TOTAL_DEBT?: number
  CURRENT_ASSETS?: number
  CURRENT_LIABILITIES?: number
  INVENTORY?: number
}

export interface OutlierSectorStats {
  sector: string
  /** metric → { mean, std, p99, p1 } computed over the whole sector */
  stats: Map<string, { mean: number; std: number; p99: number; p1: number }>
}

function flagOutlier(
  ticker: string, period: string, checkName: string, severity: AuditSeverity,
  metricValue: string, details: string, detailsAr: string,
  currentValue: number,
): AuditCheckResult {
  return {
    checkName, category: "outlier", severity, passed: false, ticker, period, currentValue,
    autoFixable: false, issueClass: "advisory", rootCause: "RATIO_OUTLIER",
    details, detailsAr, metricCode: metricValue,
  }
}

export function runOutlierChecks(
  ticker: string,
  sector: string,
  periods: OutlierPeriodValues[],
): AuditCheckResult[] {
  const results: AuditCheckResult[] = []
  const latest = periods[periods.length - 1]
  if (!latest) return results

  const ratioChecks: Array<(p: OutlierPeriodValues) => { name: string; value: number; bad: "high" | "low"; threshold: number } | null> = [
    (p) => (p.TOTAL_EQUITY !== undefined && p.TOTAL_EQUITY > 0 && p.TOTAL_DEBT !== undefined)
      ? { name: "EXTREME_LEVERAGE", value: p.TOTAL_DEBT / p.TOTAL_EQUITY, bad: "high", threshold: 5 }
      : null,
    (p) => (p.CURRENT_LIABILITIES !== undefined && p.CURRENT_LIABILITIES > 0 && p.CURRENT_ASSETS !== undefined)
      ? { name: "CURRENT_RATIO_EXTREME", value: p.CURRENT_ASSETS / p.CURRENT_LIABILITIES, bad: "high", threshold: 10 }
      : null,
    (p) => (p.CURRENT_LIABILITIES !== undefined && p.CURRENT_LIABILITIES > 0 && p.CURRENT_ASSETS !== undefined)
      ? { name: "CURRENT_RATIO_EXTREME", value: p.CURRENT_ASSETS / p.CURRENT_LIABILITIES, bad: "low", threshold: 0.5 }
      : null,
  ]

  for (const check of ratioChecks) {
    const r = check(latest)
    if (!r) continue
    const bad = r.bad === "high" ? r.value > r.threshold : r.value < r.threshold
    if (bad) {
      results.push(flagOutlier(
        ticker, latest.period, r.name, "high", "CALCULATED",
        `${r.name} = ${r.value.toFixed(2)} — beyond ${r.bad === "high" ? ">" : "<"} ${r.threshold}. Verify balance sheet data.`,
        `${r.name} خارج النطاق المنطقي — يلزم التحقق من ميزانية الأصول.`,
        r.value,
      ))
    }
  }

  // inventory turnover for industrials (if both present, any period)
  for (const p of periods) {
    if (p.INVENTORY !== undefined && p.REVENUE !== undefined && p.INVENTORY > 0 && (sector === "Industrial" || sector === "Food")) {
      const turnover = p.REVENUE / p.INVENTORY
      if (turnover > 30) {
        results.push(flagOutlier(
          ticker, p.period, "INVENTORY_TURNOVER_EXTREME", "medium", "INVENTORY",
          `Inventory turnover ${turnover.toFixed(1)}× suspiciously high (inventory may be miscategorized).`,
          `معدل دوران المخزون مرتفع بشكل مريب — قد تكون بيانات مخزون غير صحيحة.`,
          turnover,
        ))
        break
      }
    }
  }

  return results
}
