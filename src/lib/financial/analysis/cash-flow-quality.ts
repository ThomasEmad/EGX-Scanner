// Cash flow quality — operating cash flow trend, FCF generation, cash conversion.
import { freeCashFlow, fcfMargin, cashConversion } from "../calc/advanced"
import type { AnalysisResult, AnalysisContext, EvidenceStatement } from "./types"
import { insufficientDataStatement } from "./types"
import { ratioStatement } from "./narrative"

export function cashFlowQualityAnalysis(ctx: AnalysisContext): AnalysisResult {
  const statements: EvidenceStatement[] = []
  const latest = ctx.periods[ctx.periods.length - 1]
  if (!latest) {
    return {
      category: "cash_flow_quality",
      title: "Cash Flow Quality",
      summary: "Insufficient data.",
      statements: [insufficientDataStatement("cash_flow_quality", ["OPERATING_CASH_FLOW"])],
      assessment: "UNKNOWN",
    }
  }
  const ocf = latest.values["OPERATING_CASH_FLOW"]
  const capex = latest.values["CAPEX"]
  const revenue = latest.values["REVENUE"]
  const ebitda = latest.values["EBITDA"] ?? latest.values["OPERATING_INCOME"]
  if (ocf === undefined) {
    return {
      category: "cash_flow_quality",
      title: "Cash Flow Quality",
      summary: "Insufficient data — OPERATING_CASH_FLOW missing.",
      statements: [insufficientDataStatement("cash_flow_quality", ["OPERATING_CASH_FLOW"])],
      assessment: "UNKNOWN",
      periodKey: latest.periodKey,
    }
  }
  statements.push({
    id: "cfq-ocf",
    label: "Operating cash flow level",
    narrative: `Operating cash flow for ${latest.periodLabel} is ${ocf.toExponential(2)}.`,
    metricCodes: ["OPERATING_CASH_FLOW"],
    periodKeys: [latest.periodKey],
    sources: [{ metricCode: "OPERATING_CASH_FLOW", periodKey: latest.periodKey, value: ocf }],
    tone: ocf >= 0 ? "positive" : "negative",
    confidence: 1,
    tags: ["cash_flow"],
  })
  if (capex !== undefined) {
    const fcf = freeCashFlow(ocf, capex)
    if (fcf.status === "OK") {
      statements.push(ratioStatement({
        label: "Free cash flow",
        metricCode: "OPERATING_CASH_FLOW",
        value: fcf.value!,
        periodKey: latest.periodKey,
        interpretation: "Operating cash flow minus capital expenditure",
      }))
      if (revenue !== undefined) {
        const m = fcfMargin(fcf.value, revenue)
        if (m.status === "OK") statements.push(ratioStatement({ label: "FCF margin", metricCode: "OPERATING_CASH_FLOW", value: m.value!, periodKey: latest.periodKey }))
      }
    }
  }
  if (ebitda !== undefined) {
    const cc = cashConversion(ocf, ebitda)
    if (cc.status === "OK") {
      statements.push(ratioStatement({ label: "Cash conversion (CFO/EBITDA)", metricCode: "OPERATING_CASH_FLOW", value: cc.value!, periodKey: latest.periodKey, interpretation: "CFO as a % of EBITDA" }))
    }
  }
  const assessment = ocf <= 0 ? "WEAK" : capex !== undefined && ocf - Math.abs(capex) > 0 ? "STRONG" : "HEALTHY"
  return {
    category: "cash_flow_quality",
    title: "Cash Flow Quality",
    summary: `Operating cash flow ${ocf.toExponential(2)}, ${capex !== undefined ? `capex ${capex.toExponential(2)}` : "capex not disclosed"}.`,
    statements,
    assessment,
    periodKey: latest.periodKey,
  }
}
