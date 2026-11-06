// CATEGORY 4: Cross-Source Conflicts — same (company, metric, period) from
// multiple sources + currency/unit mismatch detection.
// Authority hierarchy: EGX > Mubasher > Reuters > Yahoo > TradingView

import type { AuditCheckResult, AuditSeverity } from "./types"

export const SOURCE_AUTHORITY: Record<string, number> = {
  EGX: 5,
  MUBASHER: 4,
  REUTERS: 3,
  YAHOO: 2,
  TRADINGVIEW: 1,
}

export interface MultiSourceObservation {
  metricCode: string
  period: string
  statementType: string
  sourceName: string
  normalizedValue: number
  currency: string
  unit: string
  version?: number
}

export function runCrossSourceChecks(
  ticker: string,
  observations: MultiSourceObservation[],
): { results: AuditCheckResult[]; resolution: Array<{ metricCode: string; period: string; winner: string; losers: string[] }> } {
  const results: AuditCheckResult[] = []
  const resolution: Array<{ metricCode: string; period: string; winner: string; losers: string[] }> = []

  // Group by (metric, period, consolidation basis) — never compare a
  // consolidated statement with a standalone one.
  const groups = new Map<string, MultiSourceObservation[]>()
  for (const o of observations) {
    const key = `${o.metricCode}|${o.period}|${o.statementType}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(o)
  }

  for (const [key, obsAll] of groups) {
    // One observation per distinct source (highest report version wins).
    const bySource = new Map<string, MultiSourceObservation>()
    for (const o of obsAll) {
      const prev = bySource.get(o.sourceName)
      if (!prev || (o.version ?? 0) >= (prev.version ?? 0)) bySource.set(o.sourceName, o)
    }
    const obs = [...bySource.values()]
    if (obs.length < 2) continue // single source — not a cross-source conflict
    const [metricCode, period] = key.split("|")
    const values = obs.map(o => o.normalizedValue)
    const maxVal = Math.max(...values)
    const minVal = Math.min(...values)
    const base = Math.max(Math.abs(maxVal), Math.abs(minVal))
    if (base === 0) continue
    const diffPct = Math.abs(maxVal - minVal) / base

    let severity: AuditSeverity | null = null
    if (diffPct > 0.3) severity = "critical"
    else if (diffPct > 0.15) severity = "high"
    else if (diffPct > 0.05) severity = "medium"
    else if (diffPct > 0.01) severity = "low"

    if (severity) {
      // pick authority winner
      const sorted = [...obs].sort((a, b) => (SOURCE_AUTHORITY[b.sourceName.toUpperCase()] ?? 0) - (SOURCE_AUTHORITY[a.sourceName.toUpperCase()] ?? 0))
      const winner = sorted[0]
      resolution.push({ metricCode, period, winner: winner.sourceName, losers: sorted.slice(1).map(o => o.sourceName) })
      results.push({
        checkName: "CROSS_SOURCE_CONFLICT",
        category: "cross_source",
        severity,
        passed: false,
        ticker, period, metricCode,
        currentValue: maxVal,
        expectedValue: minVal,
        autoFixable: severity !== "critical", // critical needs human review
        autoFixAction: severity !== "critical" ? `Use ${winner.sourceName} value per authority hierarchy` : undefined,
        issueClass: severity === "critical" || severity === "high" ? "blocker" : "advisory",
        rootCause: "CROSS_SOURCE",
        details: `${metricCode} ${period}: sources disagree by ${(diffPct * 100).toFixed(1)}% — ` +
          obs.map(o => `${o.sourceName}=${o.normalizedValue.toExponential(3)}`).join(" vs ") +
          `. Authority winner: ${winner.sourceName}.`,
        detailsAr: `${metricCode}: تعارض بين المصادر بنسبة ${(diffPct * 100).toFixed(1)}%. المعتمد: ${winner.sourceName}.`,
      })
    }

    // 4.2 currency mismatch
    const currencies = new Set(obs.map(o => o.currency))
    if (currencies.size > 1) {
      results.push({
        checkName: "CURRENCY_MISMATCH", category: "cross_source", severity: "critical",
        passed: false, ticker, period, metricCode, autoFixable: true,
        autoFixAction: `Normalize all to EGP using historical FX`,
        issueClass: "blocker", rootCause: "CROSS_SOURCE",
        details: `${metricCode} ${period} reported in multiple currencies (${[...currencies].join(", ")}) — normalize to EGP.`,
        detailsAr: `نفس القيمة بمصادر بعملات مختلفة — يلزم التوحيد إلى الجنيه المصري.`,
      })
    }

    // 4.3 unit/magnitude mismatch (e.g. 5,200,000,000 vs 5.2 → millions lending)
    if (base > 1000) {
      const scaled = values.map(v => Math.abs(v))
      const magDiff = Math.max(...scaled) / Math.min(...scaled.filter(v => v > 0))
      if (isFinite(magDiff) && magDiff > 900 && magDiff < 1100) {
        results.push({
          checkName: "UNIT_MISMATCH", category: "cross_source", severity: "high",
          passed: false, ticker, period, metricCode, autoFixable: true,
          autoFixAction: "Multiply small value by 1e6 (millions → raw EGP)",
          issueClass: "blocker", rootCause: "CROSS_SOURCE",
          details: `${metricCode} ${period}: values differ by ~1000× (${obs.map(o => `${o.sourceName}=${o.normalizedValue}`).join(" vs ")}) — unit normalization (thousands/millions) error.`,
          detailsAr: `فرق 1000 ضعف بين المصادر — خطأ وحدة قياس (ألف/مليون).`,
        })
      }
    }
  }

  return { results, resolution }
}
