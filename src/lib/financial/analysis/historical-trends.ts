// Historical trends — multi-period growth patterns, direction.
import { yoyTrendSeries, qoqTrendSeries, summarizeTrend } from "../calc/multi-period"
import type { AnalysisResult, AnalysisContext, EvidenceStatement } from "./types"
import { insufficientDataStatement } from "./types"

export function historicalTrendsAnalysis(ctx: AnalysisContext): AnalysisResult {
  const statements: EvidenceStatement[] = []
  if (ctx.periods.length < 2) {
    return {
      category: "historical_trends",
      title: "Historical Trends",
      summary: "Insufficient data — at least 2 periods required.",
      statements: [insufficientDataStatement("historical_trends", ["REVENUE", "NET_PROFIT"])],
      assessment: "UNKNOWN",
    }
  }
  const sorted = [...ctx.periods].sort((a, b) => a.periodKey.localeCompare(b.periodKey))
  const periodValueEntries = sorted.map((p, i) => ({
    periodKey: p.periodKey,
    sequence: i,
    values: p.values,
  }))
  const revTrend = yoyTrendSeries(periodValueEntries, "REVENUE")
  const npTrend = yoyTrendSeries(periodValueEntries, "NET_PROFIT")
  const revSummary = summarizeTrend(revTrend)
  const npSummary = summarizeTrend(npTrend)
  if (revSummary.direction) {
    statements.push({
      id: "hist-revenue-trend",
      label: "Revenue trend",
      narrative: `Revenue trend is ${revSummary.direction.toLowerCase()} with ${revSummary.okCount} periods of growth data; average growth ${revSummary.averageGrowth?.toFixed(1) ?? "—"}%.`,
      metricCodes: ["REVENUE"],
      periodKeys: sorted.map((p) => p.periodKey),
      sources: revTrend.filter((t) => t.value !== undefined).map((t) => ({ metricCode: "REVENUE", periodKey: t.periodKey, value: t.value! })),
      tone: revSummary.direction === "INCREASING" ? "positive" : revSummary.direction === "DECREASING" ? "negative" : "neutral",
      confidence: 0.85,
      tags: ["historical_trend", "revenue"],
    })
  }
  if (npSummary.direction) {
    statements.push({
      id: "hist-profit-trend",
      label: "Net profit trend",
      narrative: `Net profit trend is ${npSummary.direction.toLowerCase()} with ${npSummary.okCount} periods of growth data; average growth ${npSummary.averageGrowth?.toFixed(1) ?? "—"}%.`,
      metricCodes: ["NET_PROFIT"],
      periodKeys: sorted.map((p) => p.periodKey),
      sources: npTrend.filter((t) => t.value !== undefined).map((t) => ({ metricCode: "NET_PROFIT", periodKey: t.periodKey, value: t.value! })),
      tone: npSummary.direction === "INCREASING" ? "positive" : npSummary.direction === "DECREASING" ? "negative" : "neutral",
      confidence: 0.85,
      tags: ["historical_trend", "profit"],
    })
  }
  if (statements.length === 0) {
    return {
      category: "historical_trends",
      title: "Historical Trends",
      summary: "Insufficient data — no growth trends computable.",
      statements: [insufficientDataStatement("historical_trends", ["REVENUE", "NET_PROFIT"])],
      assessment: "UNKNOWN",
    }
  }
  const overall = revSummary.direction === "INCREASING" && npSummary.direction === "INCREASING" ? "STRONG" :
    revSummary.direction === "DECREASING" || npSummary.direction === "DECREASING" ? "WEAK" : "ADEQUATE"
  return {
    category: "historical_trends",
    title: "Historical Trends",
    summary: `Revenue ${revSummary.direction ?? "—"}, profit ${npSummary.direction ?? "—"} over ${ctx.periods.length} periods.`,
    statements,
    assessment: overall,
    periodKey: sorted[sorted.length - 1].periodKey,
  }
}
