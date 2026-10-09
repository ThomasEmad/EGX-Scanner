// Analysis layer — types & helpers.
//
// Every analysis module produces AnalysisResult[] (one per topic), each
// composed of EvidenceStatement[] — every claim is grounded in a specific
// metric + period + source traceability.

import type { MetricResult } from "../calc/advanced"

export interface SourceValueRef {
  metricCode: string
  periodKey: string
  value: number
  originalLabel?: string
  sourcePage?: number | null
  confidence?: number
}

export interface EvidenceStatement {
  /** Stable identifier for cross-reference */
  id?: string
  /** Human label for the statement (one-line summary) */
  label: string
  /** Detailed narrative grounded in metric values */
  narrative: string
  /** Bilingual: Arabic equivalent */
  narrativeAr?: string
  /** Metric code(s) this statement depends on */
  metricCodes: string[]
  /** Period key(s) used for grounding */
  periodKeys: string[]
  /** Source value references (full traceability) */
  sources: SourceValueRef[]
  /** Tone for UI styling */
  tone?: "positive" | "negative" | "neutral" | "warning"
  /** Confidence 0..1 in the statement's conclusion */
  confidence?: number
  /** Optional tags */
  tags?: string[]
}

export type AnalysisCategory =
  | "earnings_quality"
  | "profitability"
  | "cash_flow_quality"
  | "balance_sheet_quality"
  | "working_capital"
  | "capital_allocation"
  | "debt_intelligence"
  | "returns"
  | "historical_trends"
  | "anomaly_detection"
  | "restatement_intelligence"
  | "revenue_quality"
  | "segment_intelligence"
  | "research_profile"
  | "sector_overlay"

export interface AnalysisResult {
  category: AnalysisCategory
  title: string
  titleAr?: string
  summary: string
  summaryAr?: string
  statements: EvidenceStatement[]
  /** Overall assessment for the category */
  assessment?: "STRONG" | "HEALTHY" | "ADEQUATE" | "WEAK" | "UNKNOWN"
  /** Optional sub-period (e.g. quarterly vs annual) this analysis applies to */
  periodKey?: string
}

export interface PeriodSnapshot {
  periodKey: string
  periodType: string
  fiscalYear: number
  sub?: string
  periodLabel: string
  values: Record<string, number>
  metrics?: Record<string, MetricResult>
}

export interface AnalysisContext {
  companyId: string
  companyTicker?: string
  companyName?: string
  sector?: string
  /** Sorted ascending by sequence (oldest first) */
  periods: PeriodSnapshot[]
  /** Latest approved annual period key */
  anchorPeriodKey?: string
  /** Optional market price + dps12m for market-multiple analysis */
  marketPrice?: number
  dps12m?: number
  hasDividendRecords?: boolean
}

/** Find the latest period snapshot in the context. */
export function findLatestValue(ctx: AnalysisContext, code: string): SourceValueRef | null {
  if (ctx.periods.length === 0) return null
  const latest = ctx.periods[ctx.periods.length - 1]
  if (latest.values[code] === undefined) return null
  return {
    metricCode: code,
    periodKey: latest.periodKey,
    value: latest.values[code],
  }
}

/** Find the prior-year comparable value (same sub-period one year earlier). */
export function findPriorYearValue(ctx: AnalysisContext, code: string): SourceValueRef | null {
  if (ctx.periods.length < 2) return null
  const latest = ctx.periods[ctx.periods.length - 1]
  const prior = ctx.periods.find((p) => sameSubOneYearAgo(p.periodKey, latest.periodKey))
  if (!prior || prior.values[code] === undefined) return null
  return {
    metricCode: code,
    periodKey: prior.periodKey,
    value: prior.values[code],
  }
}

function sameSubOneYearAgo(priorKey: string, currentKey: string): boolean {
  const [a, ya, sa] = currentKey.split(":")
  const [b, yb, sb] = priorKey.split(":")
  return a === b && sa === sb && Number(yb) === Number(ya) - 1
}

export function toSourceValue(period: PeriodSnapshot, code: string): SourceValueRef | null {
  if (period.values[code] === undefined) return null
  return { metricCode: code, periodKey: period.periodKey, value: period.values[code] }
}

/** Format a numeric value for display in narrative text. */
export function formatValue(v: number | undefined | null, opts?: { decimals?: number; suffix?: string }): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "—"
  const decimals = opts?.decimals ?? 2
  const suffix = opts?.suffix ?? ""
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(decimals)}B${suffix}`
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(decimals)}M${suffix}`
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(decimals)}K${suffix}`
  return `${v.toFixed(decimals)}${suffix}`
}

export function formatPercent(v: number | undefined | null, opts?: { decimals?: number; sign?: boolean }): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "—"
  const decimals = opts?.decimals ?? 1
  const sign = opts?.sign ? (v > 0 ? "+" : "") : ""
  return `${sign}${v.toFixed(decimals)}%`
}

/** Build a uniform "insufficient data" statement when the analysis cannot run. */
export function insufficientDataStatement(category: string, missing: string[]): EvidenceStatement {
  return {
    id: `${category}-insufficient`,
    label: "Insufficient data",
    narrative: `This analysis could not be completed because the following required metrics are unavailable for the latest period: ${missing.join(", ")}.`,
    metricCodes: missing,
    periodKeys: [],
    sources: [],
    tone: "neutral",
    confidence: 0,
    tags: ["insufficient_data"],
  }
}
