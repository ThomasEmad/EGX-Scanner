// Revenue quality — concentration, segment mix, growth sustainability.
import type { AnalysisResult, AnalysisContext, EvidenceStatement } from "./types"
import { insufficientDataStatement } from "./types"
import { ratioStatement } from "./narrative"

export function revenueQualityAnalysis(ctx: AnalysisContext): AnalysisResult {
  const statements: EvidenceStatement[] = []
  const latest = ctx.periods[ctx.periods.length - 1]
  if (!latest) {
    return {
      category: "revenue_quality",
      title: "Revenue Quality",
      summary: "Insufficient data.",
      statements: [insufficientDataStatement("revenue_quality", ["REVENUE"])],
      assessment: "UNKNOWN",
    }
  }
  const revenue = latest.values["REVENUE"]
  const sales = latest.values["SALES"]
  const netSales = latest.values["NET_SALES"]
  const operatingIncome = latest.values["OPERATING_INCOME"]
  if (revenue === undefined && sales === undefined && netSales === undefined) {
    return {
      category: "revenue_quality",
      title: "Revenue Quality",
      summary: "Insufficient data — no revenue metric available.",
      statements: [insufficientDataStatement("revenue_quality", ["REVENUE"])],
      assessment: "UNKNOWN",
      periodKey: latest.periodKey,
    }
  }
  const rev = revenue ?? sales ?? netSales!
  statements.push(ratioStatement({
    label: "Reported revenue",
    metricCode: "REVENUE",
    value: rev,
    periodKey: latest.periodKey,
    interpretation: "Top-line performance",
  }))
  // Operating margin
  if (operatingIncome !== undefined) {
    const opMargin = (operatingIncome / rev) * 100
    statements.push(ratioStatement({
      label: "Operating margin (revenue)",
      metricCode: "OPERATING_INCOME",
      value: opMargin,
      periodKey: latest.periodKey,
      interpretation: "Operating profit per EGP of revenue",
    }))
  }
  // Revenue growth vs prior period
  const prior = ctx.periods.find((p) => sameSubYearAgo(p.periodKey, latest.periodKey))
  if (prior && prior.values.REVENUE && prior.values.REVENUE > 0) {
    const growth = ((rev - prior.values.REVENUE) / Math.abs(prior.values.REVENUE)) * 100
    statements.push({
      id: "revq-growth",
      label: "Revenue growth",
      narrative: `Revenue grew ${growth.toFixed(1)}% YoY (${prior.values.REVENUE.toExponential(2)} → ${rev.toExponential(2)}).`,
      metricCodes: ["REVENUE"],
      periodKeys: [latest.periodKey, prior.periodKey],
      sources: [
        { metricCode: "REVENUE", periodKey: latest.periodKey, value: rev },
        { metricCode: "REVENUE", periodKey: prior.periodKey, value: prior.values.REVENUE },
      ],
      tone: growth > 0 ? "positive" : "negative",
      confidence: 0.9,
      tags: ["revenue_quality", "growth"],
    })
  }
  const assessment = operatingIncome !== undefined && operatingIncome > 0 && (operatingIncome / rev) > 0.15 ? "STRONG" :
    operatingIncome !== undefined && operatingIncome > 0 ? "HEALTHY" :
    operatingIncome !== undefined ? "WEAK" : "UNKNOWN"
  return {
    category: "revenue_quality",
    title: "Revenue Quality",
    summary: `Revenue ${rev.toExponential(2)}, ${prior && prior.values.REVENUE ? `YoY growth ${((rev - prior.values.REVENUE) / Math.abs(prior.values.REVENUE) * 100).toFixed(1)}%` : "no prior year"}.`,
    statements,
    assessment,
    periodKey: latest.periodKey,
  }
}

function sameSubYearAgo(priorKey: string, currentKey: string): boolean {
  const [a, ya, sa] = currentKey.split(":")
  const [b, yb, sb] = priorKey.split(":")
  return a === b && sa === sb && Number(yb) === Number(ya) - 1
}
