// Restatement intelligence — detect restated prior-period figures across filings.
import type { AnalysisResult, AnalysisContext, EvidenceStatement, PeriodSnapshot } from "./types"
import { insufficientDataStatement } from "./types"

export function restatementIntelligenceAnalysis(ctx: AnalysisContext): AnalysisResult {
  const statements: EvidenceStatement[] = []
  if (ctx.periods.length < 2) {
    return {
      category: "restatement_intelligence",
      title: "Restatement Intelligence",
      summary: "Insufficient data — at least 2 periods required.",
      statements: [insufficientDataStatement("restatement_intelligence", ["REVENUE", "NET_PROFIT"])],
      assessment: "UNKNOWN",
    }
  }
  // Walk through periods and look for prior-period values that differ between filings
  const periodByKey = new Map<string, PeriodSnapshot>()
  for (const p of ctx.periods) periodByKey.set(p.periodKey, p)
  const restatements: { code: string; periodKey: string; oldValue: number; newValue: number; pct: number }[] = []
  for (const p of ctx.periods) {
    for (const [code, value] of Object.entries(p.values)) {
      // Look at prior period keys
      const priorKey = findPriorPeriodKey(p.periodKey)
      if (!priorKey) continue
      const priorSnap = periodByKey.get(priorKey)
      if (!priorSnap) continue
      const priorValue = priorSnap.values[code]
      if (priorValue === undefined) continue
      const diff = Math.abs(value - priorValue)
      const base = Math.max(Math.abs(value), Math.abs(priorValue))
      if (base === 0) continue
      const pct = diff / base
      if (pct > 0.005) {
        restatements.push({ code, periodKey: p.periodKey, oldValue: priorValue, newValue: value, pct: pct * 100 })
      }
    }
  }
  if (restatements.length === 0) {
    statements.push({
      id: "restatement-none",
      label: "No restatements detected",
      narrative: "No restated prior-period figures were detected across the available filings.",
      metricCodes: [],
      periodKeys: ctx.periods.map((p) => p.periodKey),
      sources: [],
      tone: "positive",
      confidence: 0.85,
      tags: ["restatement"],
    })
  } else {
    for (const r of restatements.slice(0, 10)) {
      statements.push({
        id: `restatement-${r.code}-${r.periodKey}`,
        label: `Restatement: ${r.code}`,
        narrative: `${r.code} for ${r.periodKey} was restated from ${r.oldValue.toExponential(2)} to ${r.newValue.toExponential(2)} (${r.pct.toFixed(2)}% change).`,
        metricCodes: [r.code],
        periodKeys: [r.periodKey],
        sources: [
          { metricCode: r.code, periodKey: r.periodKey, value: r.oldValue },
          { metricCode: r.code, periodKey: r.periodKey, value: r.newValue },
        ],
        tone: "warning",
        confidence: 0.9,
        tags: ["restatement"],
      })
    }
  }
  const assessment = restatements.length === 0 ? "STRONG" : restatements.length <= 2 ? "ADEQUATE" : "WEAK"
  return {
    category: "restatement_intelligence",
    title: "Restatement Intelligence",
    summary: `${restatements.length} restatement(s) detected across ${ctx.periods.length} periods.`,
    statements,
    assessment,
    periodKey: ctx.periods[ctx.periods.length - 1].periodKey,
  }
}

function findPriorPeriodKey(key: string): string | null {
  const [type, yearStr, sub] = key.split(":")
  const year = Number(yearStr)
  if (year <= 1900) return null
  if (!["ANNUAL", "QUARTERLY", "SEMIANNUAL", "NINE_MONTH"].includes(type)) return null
  return `${type}:${year - 1}:${sub ?? ""}`
}
