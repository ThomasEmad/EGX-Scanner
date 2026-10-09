// Profitability decomposition — margins and DuPont 3-step ROE.
import {
  grossMargin, operatingMargin, netMargin, duPontDecomposition,
} from "../calc/advanced"
import type { AnalysisResult, AnalysisContext, EvidenceStatement } from "./types"
import { insufficientDataStatement } from "./types"
import { ratioStatement } from "./narrative"

export function profitabilityDecomposition(ctx: AnalysisContext): AnalysisResult {
  const statements: EvidenceStatement[] = []
  const latest = ctx.periods[ctx.periods.length - 1]
  if (!latest) {
    return {
      category: "profitability",
      title: "Profitability Decomposition",
      summary: "Insufficient data — no periods available.",
      statements: [insufficientDataStatement("profitability", ["REVENUE", "GROSS_PROFIT", "OPERATING_INCOME", "NET_PROFIT"])],
      assessment: "UNKNOWN",
    }
  }
  const revenue = latest.values["REVENUE"]
  const gp = latest.values["GROSS_PROFIT"]
  const op = latest.values["OPERATING_INCOME"]
  const np = latest.values["NET_PROFIT"]
  const assets = latest.values["TOTAL_ASSETS"]
  const equity = latest.values["TOTAL_EQUITY"]
  const missing: string[] = []
  if (revenue === undefined) missing.push("REVENUE")
  if (gp === undefined) missing.push("GROSS_PROFIT")
  if (op === undefined) missing.push("OPERATING_INCOME")
  if (np === undefined) missing.push("NET_PROFIT")
  if (missing.length > 0) {
    return {
      category: "profitability",
      title: "Profitability Decomposition",
      summary: `Insufficient data — ${missing.join(", ")} missing.`,
      statements: [insufficientDataStatement("profitability", missing)],
      assessment: "UNKNOWN",
      periodKey: latest.periodKey,
    }
  }
  const gm = grossMargin(gp, revenue)
  const om = operatingMargin(op, revenue)
  const nm = netMargin(np, revenue)
  if (gm.status === "OK") statements.push(ratioStatement({ label: "Gross margin", metricCode: "GROSS_PROFIT", value: gm.value!, periodKey: latest.periodKey, interpretation: "Revenue retained after cost of goods sold" }))
  if (om.status === "OK") statements.push(ratioStatement({ label: "Operating margin", metricCode: "OPERATING_INCOME", value: om.value!, periodKey: latest.periodKey, interpretation: "Profit retained after all operating costs" }))
  if (nm.status === "OK") statements.push(ratioStatement({ label: "Net margin", metricCode: "NET_PROFIT", value: nm.value!, periodKey: latest.periodKey, interpretation: "Bottom-line profitability" }))
  if (assets !== undefined && equity !== undefined) {
    const dp = duPontDecomposition(np, revenue, assets, equity)
    statements.push({
      id: "profitability-dupont",
      label: "DuPont 3-step decomposition",
      narrative: dp.detail,
      metricCodes: ["NET_PROFIT", "REVENUE", "TOTAL_ASSETS", "TOTAL_EQUITY"],
      periodKeys: [latest.periodKey],
      sources: [
        { metricCode: "NET_PROFIT", periodKey: latest.periodKey, value: np! },
        { metricCode: "REVENUE", periodKey: latest.periodKey, value: revenue! },
        { metricCode: "TOTAL_ASSETS", periodKey: latest.periodKey, value: assets },
        { metricCode: "TOTAL_EQUITY", periodKey: latest.periodKey, value: equity },
      ],
      tone: "neutral",
      confidence: 0.9,
      tags: ["dupont", "profitability"],
    })
  }
  const netMarginVal = nm.value ?? 0
  const assessment = netMarginVal >= 15 ? "STRONG" : netMarginVal >= 8 ? "HEALTHY" : netMarginVal >= 3 ? "ADEQUATE" : "WEAK"
  return {
    category: "profitability",
    title: "Profitability Decomposition",
    summary: `Gross margin ${gm.value?.toFixed(1) ?? "—"}%, operating margin ${om.value?.toFixed(1) ?? "—"}%, net margin ${nm.value?.toFixed(1) ?? "—"}%.`,
    statements,
    assessment,
    periodKey: latest.periodKey,
  }
}
