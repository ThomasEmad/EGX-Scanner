// Multi-period calculation engine — YoY / QoQ / YTD / annual growth / CAGR
// across ordered periods, plus trend series and a summary helper.
//
// Same conventions as calc/advanced.ts:
//   • Missing inputs ⇒ DATA_UNAVAILABLE (NEVER zero).
//   • Zero denominators ⇒ NOT_COMPUTABLE.
//   • Sign transitions ⇒ NOT_APPLICABLE for percentage growth.

import { growthYoY, cagr, type MetricResult } from "./advanced"
import { FLOW_METRIC_CODES } from "../derivation/period-derivation"

export interface PeriodValueEntry {
  periodKey: string
  /** Sortable sequence index (year*4 + quarter offset for Q, year*2 + half for H, etc.) */
  sequence: number
  /** Map of metricCode → value (plain EGP) */
  values: Record<string, number>
}

function sortBySequence(periods: PeriodValueEntry[]): PeriodValueEntry[] {
  return [...periods].sort((a, b) => a.sequence - b.sequence)
}

export function yoyForPeriod(
  current: PeriodValueEntry,
  priorYearSameSub: PeriodValueEntry | undefined,
  code: string,
): MetricResult {
  if (!priorYearSameSub) {
    return { status: "DATA_UNAVAILABLE", detail: `YoY for ${code}: prior-year comparable period not available` }
  }
  return growthYoY(current.values[code], priorYearSameSub.values[code], code)
}

export function qoqForPeriod(
  current: PeriodValueEntry,
  immediatelyPrior: PeriodValueEntry | undefined,
  code: string,
): MetricResult {
  if (!immediatelyPrior) {
    return { status: "DATA_UNAVAILABLE", detail: `QoQ for ${code}: immediately prior period not available` }
  }
  return growthYoY(current.values[code], immediatelyPrior.values[code], code)
}

export function ytdForPeriod(
  current: PeriodValueEntry,
  priorYearSameCumulative: PeriodValueEntry | undefined,
  code: string,
): MetricResult {
  return yoyForPeriod(current, priorYearSameCumulative, code)
}

export function annualGrowth(
  periods: PeriodValueEntry[],
  code: string,
  year: number,
): MetricResult {
  const current = periods.find((p) => p.periodKey === `ANNUAL:${year}:`)
  const prior = periods.find((p) => p.periodKey === `ANNUAL:${year - 1}:`)
  if (!current || !prior) {
    return { status: "DATA_UNAVAILABLE", detail: `Annual growth for ${code}: missing ANNUAL ${year} or ${year - 1}` }
  }
  return growthYoY(current.values[code], prior.values[code], code)
}

export function cagrOverYears(
  periods: PeriodValueEntry[],
  code: string,
  fromYear: number,
  toYear: number,
): MetricResult {
  const begin = periods.find((p) => p.periodKey === `ANNUAL:${fromYear}:`)
  const end = periods.find((p) => p.periodKey === `ANNUAL:${toYear}:`)
  if (!begin || !end) {
    return { status: "DATA_UNAVAILABLE", detail: `CAGR for ${code}: missing ANNUAL ${fromYear} or ${toYear}` }
  }
  return cagr(begin.values[code], end.values[code], toYear - fromYear, code)
}

export interface TrendPoint {
  periodKey: string
  sequence: number
  value: number | undefined
  yoy?: MetricResult
  qoq?: MetricResult
}

export function yoyTrendSeries(
  periods: PeriodValueEntry[],
  code: string,
): TrendPoint[] {
  const sorted = sortBySequence(periods)
  const out: TrendPoint[] = []
  for (const p of sorted) {
    const prior = sorted.find((q) => sameSubYearAgo(q, p))
    out.push({
      periodKey: p.periodKey,
      sequence: p.sequence,
      value: p.values[code],
      yoy: prior ? growthYoY(p.values[code], prior.values[code], code) : undefined,
    })
  }
  return out
}

export function qoqTrendSeries(
  periods: PeriodValueEntry[],
  code: string,
): TrendPoint[] {
  const sorted = sortBySequence(periods)
  const out: TrendPoint[] = []
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]
    const prior = i > 0 ? sorted[i - 1] : undefined
    out.push({
      periodKey: p.periodKey,
      sequence: p.sequence,
      value: p.values[code],
      qoq: prior ? growthYoY(p.values[code], prior.values[code], code) : undefined,
    })
  }
  return out
}

export interface TrendSummary {
  periodCount: number
  okCount: number
  dataUnavailableCount: number
  notApplicableCount: number
  notComputableCount: number
  direction?: "INCREASING" | "DECREASING" | "MIXED" | "FLAT"
  averageGrowth?: number
  maxGrowth?: number
  minGrowth?: number
}

export function summarizeTrend(points: TrendPoint[]): TrendSummary {
  let ok = 0, ua = 0, na = 0, nc = 0
  const growths: number[] = []
  for (const p of points) {
    const m = p.yoy ?? p.qoq
    if (!m) continue
    if (m.status === "OK") {
      ok++
      if (m.value !== undefined) growths.push(m.value)
    } else if (m.status === "DATA_UNAVAILABLE") ua++
    else if (m.status === "NOT_APPLICABLE") na++
    else if (m.status === "NOT_COMPUTABLE") nc++
  }
  let direction: TrendSummary["direction"] | undefined
  let averageGrowth: number | undefined
  let maxGrowth: number | undefined
  let minGrowth: number | undefined
  if (growths.length > 0) {
    averageGrowth = growths.reduce((a, b) => a + b, 0) / growths.length
    maxGrowth = Math.max(...growths)
    minGrowth = Math.min(...growths)
    if (maxGrowth! > 1 && minGrowth! < -1) direction = "MIXED"
    else if (maxGrowth! > 1) direction = "INCREASING"
    else if (minGrowth! < -1) direction = "DECREASING"
    else direction = "FLAT"
  }
  return {
    periodCount: points.length,
    okCount: ok,
    dataUnavailableCount: ua,
    notApplicableCount: na,
    notComputableCount: nc,
    direction,
    averageGrowth,
    maxGrowth,
    minGrowth,
  }
}

/** Two periods share the same sub-period one year apart (e.g. Q2 2025 vs Q2 2024). */
function sameSubYearAgo(prior: PeriodValueEntry, current: PeriodValueEntry): boolean {
  const [pTypeA, yearStrA, subA] = current.periodKey.split(":")
  const [pTypeB, yearStrB, subB] = prior.periodKey.split(":")
  if (pTypeA !== pTypeB) return false
  if (subA !== subB) return false
  const ya = Number(yearStrA)
  const yb = Number(yearStrB)
  return yb === ya - 1
}

/** Re-export flow codes so callers can quickly filter applicable metrics for QoQ/YoY. */
export { FLOW_METRIC_CODES }
