// Capital allocation — capex intensity, dividends, M&A activity.
import type { AnalysisResult, AnalysisContext, EvidenceStatement } from "./types"
import { insufficientDataStatement } from "./types"
import { ratioStatement } from "./narrative"

export function capitalAllocationAnalysis(ctx: AnalysisContext): AnalysisResult {
  const statements: EvidenceStatement[] = []
  const latest = ctx.periods[ctx.periods.length - 1]
  if (!latest) {
    return {
      category: "capital_allocation",
      title: "Capital Allocation",
      summary: "Insufficient data.",
      statements: [insufficientDataStatement("capital_allocation", ["CAPEX", "DEBT_PROCEEDS", "DIVIDENDS_PAID"])],
      assessment: "UNKNOWN",
    }
  }
  const capex = latest.values["CAPEX"]
  const debtProceeds = latest.values["DEBT_PROCEEDS"]
  const debtRepay = latest.values["DEBT_REPAYMENTS"]
  const dividendsPaid = latest.values["DIVIDENDS_PAID"]
  const shareIssues = latest.values["CAPITAL_INCREASES_CASH"]
  const acquisitions = latest.values["ACQUISITIONS_CASH"]
  const revenue = latest.values["REVENUE"]
  if (capex !== undefined && revenue !== undefined && revenue !== 0) {
    statements.push(ratioStatement({
      label: "Capex intensity (capex/revenue)",
      metricCode: "CAPEX",
      value: (capex / revenue) * 100,
      periodKey: latest.periodKey,
      interpretation: "Reinvestment rate",
    }))
  }
  if (debtProceeds !== undefined) statements.push(ratioStatement({ label: "New debt raised", metricCode: "DEBT_PROCEEDS", value: debtProceeds, periodKey: latest.periodKey }))
  if (debtRepay !== undefined) statements.push(ratioStatement({ label: "Debt repaid", metricCode: "DEBT_REPAYMENTS", value: debtRepay, periodKey: latest.periodKey }))
  if (dividendsPaid !== undefined) statements.push(ratioStatement({ label: "Dividends paid", metricCode: "DIVIDENDS_PAID", value: dividendsPaid, periodKey: latest.periodKey }))
  if (shareIssues !== undefined) statements.push(ratioStatement({ label: "Share issuance proceeds", metricCode: "CAPITAL_INCREASES_CASH", value: shareIssues, periodKey: latest.periodKey }))
  if (acquisitions !== undefined) statements.push(ratioStatement({ label: "Acquisitions cash paid", metricCode: "ACQUISITIONS_CASH", value: acquisitions, periodKey: latest.periodKey }))
  if (statements.length === 0) {
    return {
      category: "capital_allocation",
      title: "Capital Allocation",
      summary: "Insufficient data — no capital allocation metrics available.",
      statements: [insufficientDataStatement("capital_allocation", ["CAPEX", "DEBT_PROCEEDS", "DIVIDENDS_PAID"])],
      assessment: "UNKNOWN",
      periodKey: latest.periodKey,
    }
  }
  const assessment = capex !== undefined && revenue !== undefined && capex / revenue > 0.1 ? "STRONG" : "ADEQUATE"
  return {
    category: "capital_allocation",
    title: "Capital Allocation",
    summary: `Capex ${capex?.toExponential(2) ?? "—"}, dividends paid ${dividendsPaid?.toExponential(2) ?? "—"}.`,
    statements,
    assessment,
    periodKey: latest.periodKey,
  }
}
