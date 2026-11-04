// CATEGORY 2: Logical Inconsistencies — sign errors, ratio logic, margin logic.
//
// Only genuine impossibilities are blockers. Extreme-but-possible ratios are
// advisories: a 120% ROE can be real for a low-equity company and must not be
// presented as proven bad data.

import type { AuditCheckResult, AuditSeverity } from "./types"
import type { BSPeriodValues } from "./accounting-checks"

export interface LogicalExtras {
  SHARES_OUTSTANDING?: number
  MARKET_CAP?: number
  DIVIDENDS_PAID?: number
  INVENTORY?: number
  sector?: string
}

const isFinancialSector = (sector?: string) =>
  sector === "Banks" || sector === "Financial Services" || sector === "Insurance" || sector === "Investment"

function flag(
  ticker: string, period: string, checkName: string, severity: AuditSeverity,
  details: string, detailsAr: string,
  opts: { currentValue?: number; expectedValue?: number; metricCode?: string; issueClass: "blocker" | "advisory"; rootCause: string },
): AuditCheckResult {
  return {
    checkName, category: "logical", severity, passed: false, ticker, period,
    metricCode: opts.metricCode, currentValue: opts.currentValue, expectedValue: opts.expectedValue,
    autoFixable: checkName === "SIGN_ERROR",
    issueClass: opts.issueClass, rootCause: opts.rootCause,
    details, detailsAr,
  }
}

export function runLogicalChecks(
  ticker: string,
  periods: (BSPeriodValues & LogicalExtras)[],
  sector?: string,
): AuditCheckResult[] {
  const results: AuditCheckResult[] = []
  const financial = isFinancialSector(sector)

  for (const p of periods) {
    const period = p.period
    // 2.1 Sign errors — never-negative metrics
    const neverNegative: Array<[string, number | undefined, boolean]> = [
      ["REVENUE", p.REVENUE, false],
      ["TOTAL_ASSETS", p.TOTAL_ASSETS, false],
      ["SHARES_OUTSTANDING", p.SHARES_OUTSTANDING, true],
      ["INVENTORY", p.INVENTORY, false],
    ]
    for (const [code, v, shares] of neverNegative) {
      if (v !== undefined && v < 0) {
        results.push(flag(
          ticker, period, "SIGN_ERROR", shares ? "high" : "critical",
          `${code} is negative (${v.toExponential(3)}) — sign error.`,
          `قيمة سالبة في حقل لا يجوز أن تكون سالبة (${code}).`,
          { currentValue: v, expectedValue: 0, metricCode: code, issueClass: "blocker", rootCause: "SIGN_INVERSION" },
        ))
      }
    }
    // TOTAL_EQUITY negative = accumulated losses (warning, not an error)
    if (p.TOTAL_EQUITY !== undefined && p.TOTAL_EQUITY < 0) {
      results.push(flag(
        ticker, period, "NEGATIVE_EQUITY", "medium",
        "TOTAL_EQUITY negative — accumulated losses; flag for review (not an error per se).",
        "حقوق المساهمين سالبة — خسائر متراكمة (ينبغي المراجعة).",
        { currentValue: p.TOTAL_EQUITY, metricCode: "TOTAL_EQUITY", issueClass: "advisory", rootCause: "RATIO_OUTLIER" },
      ))
    }

    // 2.2 Ratio logic — advisory only
    if (p.TOTAL_EQUITY !== undefined && p.TOTAL_EQUITY > 0 && p.NET_PROFIT !== undefined) {
      const roe = p.NET_PROFIT / p.TOTAL_EQUITY
      if (roe > 1) {
        results.push(flag(
          ticker, period, "ROE_EXTREME", "low",
          `ROE ${(roe * 100).toFixed(0)}% > 100% with positive equity — verify, but possible for low-equity companies.`,
          `العائد على حقوق الملكية يفوق 100% مع حقوق موجبة — تحقق، لكنه ممكن للشركات منخفضة الحقوق.`,
          { currentValue: roe, expectedValue: 1, metricCode: "NET_PROFIT", issueClass: "advisory", rootCause: "RATIO_OUTLIER" },
        ))
      }
    }
    if (!financial && p.TOTAL_ASSETS !== undefined && p.TOTAL_ASSETS > 0 && p.NET_PROFIT !== undefined && p.NET_PROFIT > 0) {
      const roa = p.NET_PROFIT / p.TOTAL_ASSETS
      if (roa > 0.3) {
        results.push(flag(
          ticker, period, "ROA_EXTREME", "low",
          `ROA ${(roa * 100).toFixed(0)}% > 30% — verify (rare outside holding/investment structures).`,
          `العائد على الأصول يفوق 30% — تحقق من البيانات.`,
          { currentValue: roa, expectedValue: 0.3, metricCode: "NET_PROFIT", issueClass: "advisory", rootCause: "RATIO_OUTLIER" },
        ))
      }
    }

    // 2.3 Margin logic — genuine impossibilities only (financial firms exempt:
    // net profit can legitimately exceed "revenue" when revenue is net of
    // interest expense under a different presentation).
    if (!financial && p.REVENUE !== undefined && p.REVENUE > 0 && p.NET_PROFIT !== undefined) {
      const margin = p.NET_PROFIT / p.REVENUE
      if (p.NET_PROFIT > 0 && margin > 1) {
        const severe = margin > 1.5
        results.push(flag(
          ticker, period, "NET_MARGIN_IMPOSSIBLE", severe ? "critical" : "low",
          severe
            ? `Net margin ${(margin * 100).toFixed(0)}% > 150% (non-financial) — impossible without a data error.`
            : `Net margin ${(margin * 100).toFixed(0)}% > 100% — verify one-off/non-operating gains before treating as an error.`,
          severe
            ? `هامش صافي الربح يفوق 150% — مستحيل دون خطأ في البيانات.`
            : `هامش صافي الربح يفوق 100% — تحقق من الأرباح غير التشغيلية/الاستثنائية.`,
          { currentValue: margin, expectedValue: 1, metricCode: "NET_PROFIT", issueClass: severe ? "blocker" : "advisory", rootCause: "IS_MARGIN" },
        ))
      }
      if (p.GROSS_PROFIT !== undefined && p.GROSS_PROFIT > 0 && p.GROSS_PROFIT / p.REVENUE > 1.02) {
        results.push(flag(
          ticker, period, "GROSS_MARGIN_IMPOSSIBLE", "critical",
          `Gross margin ${(100 * (p.GROSS_PROFIT / p.REVENUE)).toFixed(0)}% > 100% — impossible.`,
          `هامش الربح الإجمالي يفوق 100% — مستحيل.`,
          { currentValue: p.GROSS_PROFIT / p.REVENUE, expectedValue: 1, metricCode: "GROSS_PROFIT", issueClass: "blocker", rootCause: "IS_MARGIN" },
        ))
      }
    }
  }

  return results
}
