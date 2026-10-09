// Debt intelligence — debt structure, cost, maturity, coverage.
import { debtToEquity, interestCoverage, netDebt } from "../calc/advanced"
import type { AnalysisResult, AnalysisContext, EvidenceStatement } from "./types"
import { insufficientDataStatement } from "./types"
import { ratioStatement } from "./narrative"

export function debtIntelligenceAnalysis(ctx: AnalysisContext): AnalysisResult {
  const statements: EvidenceStatement[] = []
  const latest = ctx.periods[ctx.periods.length - 1]
  if (!latest) {
    return {
      category: "debt_intelligence",
      title: "Debt Intelligence",
      summary: "Insufficient data.",
      statements: [insufficientDataStatement("debt_intelligence", ["TOTAL_DEBT", "SHORT_TERM_DEBT", "LONG_TERM_DEBT"])],
      assessment: "UNKNOWN",
    }
  }
  const total = latest.values["TOTAL_DEBT"]
  const shortTerm = latest.values["SHORT_TERM_DEBT"]
  const longTerm = latest.values["LONG_TERM_DEBT"]
  const equity = latest.values["TOTAL_EQUITY"]
  const cash = latest.values["CASH_AND_EQUIVALENTS"]
  const interestExp = latest.values["INTEREST_EXPENSE"] ?? latest.values["FINANCE_COST"]
  const ebit = latest.values["EBIT"] ?? latest.values["OPERATING_INCOME"]
  const missing: string[] = []
  if (total === undefined) missing.push("TOTAL_DEBT")
  if (shortTerm === undefined) missing.push("SHORT_TERM_DEBT")
  if (longTerm === undefined) missing.push("LONG_TERM_DEBT")
  if (missing.length > 0) {
    return {
      category: "debt_intelligence",
      title: "Debt Intelligence",
      summary: `Insufficient data — ${missing.join(", ")} missing.`,
      statements: [insufficientDataStatement("debt_intelligence", missing)],
      assessment: "UNKNOWN",
      periodKey: latest.periodKey,
    }
  }
  if (shortTerm !== undefined && longTerm !== undefined && total !== undefined) {
    const stPct = total !== 0 ? (shortTerm / total) * 100 : 0
    const ltPct = total !== 0 ? (longTerm / total) * 100 : 0
    statements.push({
      id: "debt-structure",
      label: "Debt maturity structure",
      narrative: `Short-term debt ${shortTerm.toExponential(2)} (${stPct.toFixed(1)}%), long-term debt ${longTerm.toExponential(2)} (${ltPct.toFixed(1)}%).`,
      metricCodes: ["SHORT_TERM_DEBT", "LONG_TERM_DEBT", "TOTAL_DEBT"],
      periodKeys: [latest.periodKey],
      sources: [
        { metricCode: "SHORT_TERM_DEBT", periodKey: latest.periodKey, value: shortTerm },
        { metricCode: "LONG_TERM_DEBT", periodKey: latest.periodKey, value: longTerm },
        { metricCode: "TOTAL_DEBT", periodKey: latest.periodKey, value: total },
      ],
      tone: stPct > 50 ? "warning" : "neutral",
      confidence: 0.9,
      tags: ["debt_structure"],
    })
  }
  if (equity !== undefined) {
    const de = debtToEquity(total, equity)
    if (de.status === "OK") statements.push(ratioStatement({ label: "Debt / Equity", metricCode: "TOTAL_DEBT", value: de.value!, periodKey: latest.periodKey }))
  }
  if (cash !== undefined) {
    const nd = netDebt(total, cash)
    if (nd.status === "OK") statements.push(ratioStatement({ label: "Net debt", metricCode: "TOTAL_DEBT", value: nd.value!, periodKey: latest.periodKey }))
  }
  if (interestExp !== undefined && ebit !== undefined) {
    const ic = interestCoverage(ebit, interestExp)
    if (ic.status === "OK") statements.push(ratioStatement({ label: "Interest coverage", metricCode: "OPERATING_INCOME", value: ic.value!, periodKey: latest.periodKey, interpretation: ic.value! < 2 ? "Below 2x — concerning" : "Adequate coverage" }))
  }
  const deValue = equity ? (total ?? 0) / equity : 0
  const assessment = deValue > 2 ? "WEAK" : deValue > 1 ? "ADEQUATE" : "STRONG"
  return {
    category: "debt_intelligence",
    title: "Debt Intelligence",
    summary: `Total debt ${total?.toExponential(2) ?? "—"}, D/E ${deValue.toFixed(2)}x.`,
    statements,
    assessment,
    periodKey: latest.periodKey,
  }
}
