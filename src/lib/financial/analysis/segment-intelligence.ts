// Segment intelligence — segment revenue/profit/assets distribution.
import type { AnalysisResult, AnalysisContext, EvidenceStatement } from "./types"
import { insufficientDataStatement } from "./types"
import { ratioStatement } from "./narrative"

export function segmentIntelligenceAnalysis(ctx: AnalysisContext): AnalysisResult {
  const statements: EvidenceStatement[] = []
  const latest = ctx.periods[ctx.periods.length - 1]
  if (!latest) {
    return {
      category: "segment_intelligence",
      title: "Segment Intelligence",
      summary: "Insufficient data.",
      statements: [insufficientDataStatement("segment_intelligence", ["SEGMENT_REVENUE"])],
      assessment: "UNKNOWN",
    }
  }
  const segRev = latest.values["SEGMENT_REVENUE"]
  const segProfit = latest.values["SEGMENT_PROFIT"]
  const segAssets = latest.values["SEGMENT_ASSETS"]
  const segLiab = latest.values["SEGMENT_LIABILITIES"]
  const segCapex = latest.values["SEGMENT_CAPEX"]
  const missing: string[] = []
  if (segRev === undefined) missing.push("SEGMENT_REVENUE")
  if (segProfit === undefined) missing.push("SEGMENT_PROFIT")
  if (segAssets === undefined) missing.push("SEGMENT_ASSETS")
  if (missing.length === 3) {
    return {
      category: "segment_intelligence",
      title: "Segment Intelligence",
      summary: `Insufficient data — all segment metrics missing.`,
      statements: [insufficientDataStatement("segment_intelligence", missing)],
      assessment: "UNKNOWN",
      periodKey: latest.periodKey,
    }
  }
  if (segRev !== undefined) statements.push(ratioStatement({ label: "Segment revenue", metricCode: "SEGMENT_REVENUE", value: segRev, periodKey: latest.periodKey }))
  if (segProfit !== undefined) statements.push(ratioStatement({ label: "Segment profit", metricCode: "SEGMENT_PROFIT", value: segProfit, periodKey: latest.periodKey }))
  if (segAssets !== undefined) statements.push(ratioStatement({ label: "Segment assets", metricCode: "SEGMENT_ASSETS", value: segAssets, periodKey: latest.periodKey }))
  if (segLiab !== undefined) statements.push(ratioStatement({ label: "Segment liabilities", metricCode: "SEGMENT_LIABILITIES", value: segLiab, periodKey: latest.periodKey }))
  if (segCapex !== undefined) statements.push(ratioStatement({ label: "Segment capex", metricCode: "SEGMENT_CAPEX", value: segCapex, periodKey: latest.periodKey }))
  if (segRev !== undefined && segProfit !== undefined && segRev > 0) {
    const margin = (segProfit / segRev) * 100
    statements.push({
      id: "seg-margin",
      label: "Segment profit margin",
      narrative: `Segment profit margin is ${margin.toFixed(1)}% (segment profit / segment revenue).`,
      metricCodes: ["SEGMENT_REVENUE", "SEGMENT_PROFIT"],
      periodKeys: [latest.periodKey],
      sources: [
        { metricCode: "SEGMENT_REVENUE", periodKey: latest.periodKey, value: segRev },
        { metricCode: "SEGMENT_PROFIT", periodKey: latest.periodKey, value: segProfit },
      ],
      tone: margin > 15 ? "positive" : margin < 5 ? "negative" : "neutral",
      confidence: 0.85,
      tags: ["segment"],
    })
  }
  const assessment = segRev !== undefined && segProfit !== undefined && segProfit / segRev > 0.15 ? "STRONG" :
    segRev !== undefined && segProfit !== undefined && segProfit / segRev > 0.05 ? "HEALTHY" : "ADEQUATE"
  return {
    category: "segment_intelligence",
    title: "Segment Intelligence",
    summary: `${statements.length} segment metric(s) disclosed.`,
    statements,
    assessment,
    periodKey: latest.periodKey,
  }
}
