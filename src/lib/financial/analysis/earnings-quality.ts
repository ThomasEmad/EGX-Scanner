// Earnings quality — compares net profit to operating cash flow to assess how
// much of reported earnings are backed by cash. High accruals (NP >> CFO) flag
// aggressive recognition or weak cash conversion.

import { cfoToNetIncome } from "../calc/advanced"
import { FLOW_METRIC_CODES } from "../derivation/period-derivation"
import type { AnalysisResult, AnalysisContext, EvidenceStatement } from "./types"
import { findLatestValue, findPriorYearValue, insufficientDataStatement } from "./types"
import { growthStatement, ratioStatement } from "./narrative"

export function earningsQualityAnalysis(ctx: AnalysisContext): AnalysisResult {
  const statements: EvidenceStatement[] = []
  const latest = ctx.periods[ctx.periods.length - 1]
  if (!latest) {
    return {
      category: "earnings_quality",
      title: "Earnings Quality",
      summary: "Insufficient data — no periods available.",
      statements: [insufficientDataStatement("earnings_quality", ["NET_PROFIT", "OPERATING_CASH_FLOW"])],
      assessment: "UNKNOWN",
    }
  }
  const np = latest.values["NET_PROFIT"]
  const ocf = latest.values["OPERATING_CASH_FLOW"]
  if (np === undefined || ocf === undefined) {
    const missing: string[] = []
    if (np === undefined) missing.push("NET_PROFIT")
    if (ocf === undefined) missing.push("OPERATING_CASH_FLOW")
    return {
      category: "earnings_quality",
      title: "Earnings Quality",
      summary: `Insufficient data — ${missing.join(", ")} missing for the latest period.`,
      statements: [insufficientDataStatement("earnings_quality", missing)],
      assessment: "UNKNOWN",
      periodKey: latest.periodKey,
    }
  }
  const conv = cfoToNetIncome(ocf, np)
  if (conv.status === "OK" && conv.value !== undefined) {
    statements.push(ratioStatement({
      label: "CFO / Net income ratio",
      metricCode: "OPERATING_CASH_FLOW",
      value: conv.value,
      periodKey: latest.periodKey,
      interpretation: conv.value < 0.8 && np > 0 ? "Operating cash flow trails net profit — earnings may be accrual-heavy" : "Cash conversion is healthy",
    }))
  }
  // YoY trend of CFO vs NP
  const priorNp = findPriorYearValue(ctx, "NET_PROFIT")
  const priorOcf = findPriorYearValue(ctx, "OPERATING_CASH_FLOW")
  if (priorNp && priorOcf) {
    const npGrowth = np > 0 && priorNp.value > 0 ? ((np - priorNp.value) / Math.abs(priorNp.value)) * 100 : null
    const ocfGrowth = ocf > 0 && priorOcf.value > 0 ? ((ocf - priorOcf.value) / Math.abs(priorOcf.value)) * 100 : null
    if (npGrowth !== null && ocfGrowth !== null) {
      if (npGrowth > ocfGrowth + 20) {
        statements.push({
          id: "earnings_quality-divergence",
          label: "Profit growth outpaces cash growth",
          narrative: `Net profit grew ${npGrowth.toFixed(1)}% while operating cash flow grew only ${ocfGrowth.toFixed(1)}% — earnings quality deterioration signal.`,
          metricCodes: ["NET_PROFIT", "OPERATING_CASH_FLOW"],
          periodKeys: [latest.periodKey, priorNp.periodKey],
          sources: [
            { metricCode: "NET_PROFIT", periodKey: latest.periodKey, value: np },
            { metricCode: "NET_PROFIT", periodKey: priorNp.periodKey, value: priorNp.value },
            { metricCode: "OPERATING_CASH_FLOW", periodKey: latest.periodKey, value: ocf },
            { metricCode: "OPERATING_CASH_FLOW", periodKey: priorOcf.periodKey, value: priorOcf.value },
          ],
          tone: "negative",
          confidence: 0.8,
          tags: ["earnings_quality", "divergence"],
        })
      } else {
        statements.push(growthStatement({
          label: "Operating cash flow growth",
          metricCode: "OPERATING_CASH_FLOW",
          current: ocf,
          previous: priorOcf.value,
          growthPct: ocfGrowth,
          currentPeriodKey: latest.periodKey,
          previousPeriodKey: priorOcf.periodKey,
        }))
      }
    }
  }
  const ratio = conv.value ?? 0
  const assessment = ratio >= 1 ? "STRONG" : ratio >= 0.6 ? "HEALTHY" : ratio >= 0.3 ? "ADEQUATE" : "WEAK"
  return {
    category: "earnings_quality",
    title: "Earnings Quality",
    summary: `Net profit ${np >= 0 ? "of" : "loss of"} ${np.toExponential(2)} vs operating cash flow ${ocf.toExponential(2)} (CFO/NP = ${ratio.toFixed(2)}x).`,
    statements,
    assessment,
    periodKey: latest.periodKey,
  }
}
