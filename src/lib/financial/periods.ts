// Period model — financial periods are extremely important.
// The system distinguishes Quarterly / Semiannual / Nine-month / Annual / TTM
// and NEVER compares incompatible periods (e.g. Q2 2026 vs FY 2025).
// Growth is only computed on a same-period basis (Q2 vs Q2, H1 vs H1, FY vs FY).

export const PERIOD_TYPES = ["QUARTERLY", "SEMIANNUAL", "NINE_MONTH", "ANNUAL", "TTM", "OTHER"] as const
export type PeriodType = (typeof PERIOD_TYPES)[number]

export type PeriodBasis = "LATEST_ANNUAL" | "LATEST_QUARTERLY"

/** Build canonical period key, e.g. "ANNUAL:2024:", "QUARTERLY:2025:Q2", "SEMIANNUAL:2025:H1" */
export function periodKey(periodType: string, fiscalYear: number, sub?: string | null): string {
  return `${periodType}:${fiscalYear}:${sub ?? ""}`
}

/** Parse a period key back into parts */
export function parsePeriodKey(key: string): { periodType: string; fiscalYear: number; sub: string } {
  const [periodType, year, sub = ""] = key.split(":")
  return { periodType, fiscalYear: Number(year), sub }
}

/** Build period key from report fields */
export function reportPeriodKey(report: {
  periodType: string
  fiscalYear: number
  periodLabel: string
}): string {
  const sub = extractSub(report.periodType, report.periodLabel)
  return periodKey(report.periodType, report.fiscalYear, sub)
}

/** Extract sub-period token from a label like "Q2 2025" / "H1 2024" / "9M 2025" / "FY 2024" */
export function extractSub(periodType: string, periodLabel: string): string {
  const label = periodLabel.toUpperCase()
  if (periodType === "QUARTERLY") {
    const m = label.match(/Q([1-4])/)
    return m ? `Q${m[1]}` : ""
  }
  if (periodType === "SEMIANNUAL") {
    const m = label.match(/H([1-2])/)
    return m ? `H${m[1]}` : ""
  }
  if (periodType === "NINE_MONTH") {
    return "9M"
  }
  return ""
}

/**
 * The comparable previous period key for YoY comparison, or null when none exists.
 * Q2 2026 compares to Q2 2025 — never Q2 2026 vs FY 2025.
 */
export function previousComparableKey(key: string): string | null {
  const { periodType, fiscalYear, sub } = parsePeriodKey(key)
  if (periodType === "ANNUAL" || periodType === "QUARTERLY" || periodType === "SEMIANNUAL" || periodType === "NINE_MONTH") {
    if (fiscalYear <= 1900) return null
    return periodKey(periodType, fiscalYear - 1, sub)
  }
  return null // TTM / OTHER have no defined comparable previous
}

/** Human-readable label for a period key */
export function periodKeyLabel(key: string): string {
  const { periodType, fiscalYear, sub } = parsePeriodKey(key)
  switch (periodType) {
    case "ANNUAL":
      return `FY ${fiscalYear}`
    case "QUARTERLY":
      return `${sub} ${fiscalYear}`.trim()
    case "SEMIANNUAL":
      return `${sub || "H?"} ${fiscalYear}`
    case "NINE_MONTH":
      return `9M ${fiscalYear}`
    case "TTM":
      return `TTM ${fiscalYear}`
    default:
      return `${periodType} ${fiscalYear} ${sub}`.trim()
  }
}

/** Comparison basis selection name for UI */
export function basisLabel(basis: PeriodBasis): string {
  return basis === "LATEST_ANNUAL" ? "Latest annual (FY vs FY)" : "Latest quarter (QoQ YoY)"
}
