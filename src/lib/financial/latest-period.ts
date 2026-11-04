// Latest-available value selection per company.
//
// The old peer/ranking code anchored every company to ONE period (the self
// company's latest annual, or a global 2025 window). That is wrong for a
// market where companies file on different calendars: a company that already
// reported Q2 2026 was compared on stale FY 2025 figures, and a company whose
// latest quarter lacked a balance sheet silently fell back to an old annual
// ROE (the source of the unrealistic 271% ROE that topped the leaderboard).
//
// This helper answers the question users actually ask: "what is the latest
// available value for THIS company?" — per metric, with the period it came
// from. It never mixes consolidated and standalone rows for one company, never
// uses a null/DATA_UNAVAILABLE row, and never treats missing as zero.

import type { CalcMetricRow } from "./statement-pref"
import { preferConsolidatedRows } from "./statement-pref"

export interface PeriodRef {
  key: string
  label: string
  type: string
  fiscalYear: number
}

export interface LatestValue extends PeriodRef {
  value: number
}

export interface CompanyLatest {
  companyId: string
  /** latest available numeric value per requested code (null when none) */
  values: Record<string, number | null>
  /** period that supplied each value (null when none) */
  periods: Record<string, PeriodRef | null>
  /** freshest period among the selected values — used for the row badge */
  anchor: PeriodRef | null
}

/** Chronological order inside a fiscal year: Q1 < H1/Q2 < 9M/Q3 < Q4/FY.
 *  The scale is quarter-based (fiscalYear * 4 + 0..3) so `isStalePeriod` can
 *  count real quarter gaps instead of mixing year and quarter digits. */
export function periodOrder(periodType: string, fiscalYear: number, periodLabel: string): number {
  const label = periodLabel.toUpperCase()
  let within = 3 // annual / TTM / unknown default to year-end
  const q = label.match(/Q([1-4])/)
  if (q) within = Number(q[1]) - 1
  else if (/9M/.test(label)) within = 2
  else if (/H1/.test(label)) within = 1
  else if (/H2/.test(label)) within = 3
  else if (periodType === "ANNUAL" || periodType === "TTM") within = 3
  return fiscalYear * 4 + within
}

/** Tie-break when two rows describe the same chronological slot.
 *  Audited annual > TTM > discrete quarter > cumulative H1/9M. */
export function periodTypeRank(periodType: string): number {
  switch (periodType) {
    case "ANNUAL": return 4
    case "TTM": return 3
    case "QUARTERLY": return 2
    case "SEMIANNUAL": return 1
    case "NINE_MONTH": return 0
    default: return -1
  }
}

function toRef(row: Pick<CalcMetricRow, "periodKey" | "periodLabel" | "periodType" | "fiscalYear">): PeriodRef {
  return { key: row.periodKey, label: row.periodLabel, type: row.periodType, fiscalYear: row.fiscalYear }
}

function isBetter(candidate: CalcMetricRow, current: CalcMetricRow): boolean {
  const a = periodOrder(candidate.periodType, candidate.fiscalYear, candidate.periodLabel)
  const b = periodOrder(current.periodType, current.fiscalYear, current.periodLabel)
  if (a !== b) return a > b
  const ra = periodTypeRank(candidate.periodType)
  const rb = periodTypeRank(current.periodType)
  if (ra !== rb) return ra > rb
  // deterministic final tie-break: newest fiscal year, then key
  if (candidate.fiscalYear !== current.fiscalYear) return candidate.fiscalYear > current.fiscalYear
  return candidate.periodKey.localeCompare(current.periodKey) > 0
}

/**
 * Pick the latest available OK value per company per code.
 *
 * @param rows   CalculatedMetric rows for all companies (both statement types)
 * @param codes  metric codes to select
 */
export function selectLatestByCompany(
  rows: CalcMetricRow[],
  codes: readonly string[],
  options: { fullPeriodCodes?: readonly string[] } = {},
): Map<string, CompanyLatest> {
  const codeSet = new Set(codes)
  // ROE/ROA compare a FLOW (profit) with a point-in-time equity/assets base.
  // A Q1 ratio is not annualised, so ranking it next to a TTM/annual ratio is
  // apples-to-oranges (VLMRA Q1 2026 would otherwise show a fake 66% ROE at the
  // top). For these codes "latest" means the latest FULL period (TTM or annual).
  const fullPeriodCodes = new Set(options.fullPeriodCodes ?? [])
  const preferred = preferConsolidatedRows(rows)
  const byCompany = new Map<string, CalcMetricRow[]>()
  for (const r of preferred) {
    if (!codeSet.has(r.code)) continue
    if (r.valueStatus !== "OK" || r.value === null) continue
    if (fullPeriodCodes.has(r.code) && r.periodType !== "TTM" && r.periodType !== "ANNUAL") continue
    if (!byCompany.has(r.companyId)) byCompany.set(r.companyId, [])
    byCompany.get(r.companyId)!.push(r)
  }

  const out = new Map<string, CompanyLatest>()
  for (const [companyId, list] of byCompany) {
    const values: Record<string, number | null> = {}
    const periods: Record<string, PeriodRef | null> = {}
    let anchorRow: CalcMetricRow | null = null

    for (const code of codes) {
      const candidates = list.filter((r) => r.code === code)
      if (candidates.length === 0) { values[code] = null; periods[code] = null; continue }
      let best = candidates[0]
      for (const c of candidates.slice(1)) if (isBetter(c, best)) best = c
      values[code] = best.value
      periods[code] = toRef(best)
      if (!anchorRow || isBetter(best, anchorRow)) anchorRow = best
    }

    out.set(companyId, {
      companyId,
      values,
      periods,
      anchor: anchorRow ? toRef(anchorRow) : null,
    })
  }
  return out
}

/** True when a period is older than the freshest market period by more than
 *  `quarters` quarter-slots. Used only to LABEL staleness — never to hide a
 *  company's latest data. */
export function isStalePeriod(period: PeriodRef | null, freshestOrder: number, quarters = 4): boolean {
  if (!period) return false
  return periodOrder(period.type, period.fiscalYear, period.label) < freshestOrder - quarters
}
