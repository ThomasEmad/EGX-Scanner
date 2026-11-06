// Narrative builders — produce EvidenceStatement objects with grounded text.
// Each builder takes structured inputs (metric codes + values + period keys)
// and emits a bilingual narrative tied to source values.

import type { EvidenceStatement, SourceValueRef } from "./types"
import { formatValue, formatPercent } from "./types"

let stmtCounter = 0
function nextId(prefix: string): string {
  stmtCounter += 1
  return `${prefix}-${stmtCounter}`
}

export function growthStatement(opts: {
  label: string
  metricCode: string
  current: number
  previous: number
  growthPct: number | null
  currentPeriodKey: string
  previousPeriodKey: string
  narrativeAr?: string
}): EvidenceStatement {
  const { label, metricCode, current, previous, growthPct, currentPeriodKey, previousPeriodKey } = opts
  const growthText = growthPct === null
    ? "growth is not meaningful across sign transitions"
    : `${formatPercent(growthPct, { sign: true })}`
  const sources: SourceValueRef[] = [
    { metricCode, periodKey: currentPeriodKey, value: current },
    { metricCode, periodKey: previousPeriodKey, value: previous },
  ]
  return {
    id: nextId("growth"),
    label,
    narrative: `${label} ${growthText} (${formatValue(previous)} → ${formatValue(current)}).`,
    narrativeAr: opts.narrativeAr,
    metricCodes: [metricCode],
    periodKeys: [currentPeriodKey, previousPeriodKey],
    sources,
    tone: growthPct === null ? "neutral" : growthPct > 0 ? "positive" : "negative",
    confidence: 0.9,
    tags: ["growth"],
  }
}

export function divergenceStatement(opts: {
  label: string
  metricA: string
  metricB: string
  valueA: number
  valueB: number
  periodKey: string
  narrativeAr?: string
}): EvidenceStatement {
  const { label, metricA, metricB, valueA, valueB, periodKey } = opts
  const diff = valueA - valueB
  const pctBase = Math.abs(valueB) > 0 ? (diff / Math.abs(valueB)) * 100 : null
  const sources: SourceValueRef[] = [
    { metricCode: metricA, periodKey, value: valueA },
    { metricCode: metricB, periodKey, value: valueB },
  ]
  return {
    id: nextId("divergence"),
    label,
    narrative: `${label}: ${metricA} (${formatValue(valueA)}) diverges from ${metricB} (${formatValue(valueB)}) by ${pctBase === null ? "an undefined ratio" : formatPercent(pctBase, { sign: true })}.`,
    narrativeAr: opts.narrativeAr,
    metricCodes: [metricA, metricB],
    periodKeys: [periodKey],
    sources,
    tone: Math.abs(diff) > Math.abs(valueB) * 0.1 ? "warning" : "neutral",
    confidence: 0.85,
    tags: ["divergence"],
  }
}

export function ratioStatement(opts: {
  label: string
  metricCode: string
  value: number
  periodKey: string
  benchmark?: number
  interpretation?: string
  narrativeAr?: string
}): EvidenceStatement {
  const { label, metricCode, value, periodKey, benchmark, interpretation } = opts
  const sources: SourceValueRef[] = [{ metricCode, periodKey, value }]
  const benchmarkText = benchmark === undefined ? "" : ` (benchmark ${formatValue(benchmark, { decimals: 2 })})`
  return {
    id: nextId("ratio"),
    label,
    narrative: `${label}: ${formatValue(value, { decimals: 2 })}${benchmarkText}.${interpretation ? ` ${interpretation}.` : ""}`,
    narrativeAr: opts.narrativeAr,
    metricCodes: [metricCode],
    periodKeys: [periodKey],
    sources,
    tone: "neutral",
    confidence: 0.85,
    tags: ["ratio"],
  }
}

export function compositionStatement(opts: {
  label: string
  total: number
  parts: { metricCode: string; value: number }[]
  periodKey: string
  narrativeAr?: string
}): EvidenceStatement {
  const { label, total, parts, periodKey } = opts
  const sources: SourceValueRef[] = parts.map((p) => ({ metricCode: p.metricCode, periodKey, value: p.value }))
  const partsText = parts
    .map((p) => `${p.metricCode} ${formatValue(p.value)} (${formatPercent(total !== 0 ? (p.value / total) * 100 : 0)})`)
    .join(", ")
  return {
    id: nextId("composition"),
    label,
    narrative: `${label} composition: ${partsText}; total ${formatValue(total)}.`,
    narrativeAr: opts.narrativeAr,
    metricCodes: parts.map((p) => p.metricCode),
    periodKeys: [periodKey],
    sources,
    tone: "neutral",
    confidence: 0.85,
    tags: ["composition"],
  }
}

export function factStatement(opts: {
  label: string
  metricCode: string
  value: number
  periodKey: string
  context?: string
  narrativeAr?: string
  tone?: EvidenceStatement["tone"]
}): EvidenceStatement {
  const { label, metricCode, value, periodKey, context } = opts
  return {
    id: nextId("fact"),
    label,
    narrative: `${label}: ${formatValue(value)}${context ? ` (${context})` : ""}.`,
    narrativeAr: opts.narrativeAr,
    metricCodes: [metricCode],
    periodKeys: [periodKey],
    sources: [{ metricCode, periodKey, value }],
    tone: opts.tone ?? "neutral",
    confidence: 1,
    tags: ["fact"],
  }
}

export function anomalyStatement(opts: {
  label: string
  metricCode: string
  value: number
  expected: number
  periodKey: string
  severity: "info" | "warning" | "critical"
  narrativeAr?: string
}): EvidenceStatement {
  const { label, metricCode, value, expected, periodKey, severity } = opts
  const diff = value - expected
  const pctBase = Math.abs(expected) > 0 ? (diff / Math.abs(expected)) * 100 : null
  return {
    id: nextId("anomaly"),
    label,
    narrative: `${label}: observed ${formatValue(value)} vs expected ${formatValue(expected)} (${pctBase === null ? "undefined" : formatPercent(pctBase, { sign: true })} deviation).`,
    narrativeAr: opts.narrativeAr,
    metricCodes: [metricCode],
    periodKeys: [periodKey],
    sources: [{ metricCode, periodKey, value }],
    tone: severity === "critical" ? "warning" : severity === "warning" ? "warning" : "neutral",
    confidence: 0.7,
    tags: ["anomaly", severity],
  }
}
