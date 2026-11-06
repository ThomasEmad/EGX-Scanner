// Returns analysis — ROE, ROA, ROIC, ROCE.
import { roe, roa, roic, roce } from "../calc/advanced"
import type { AnalysisResult, AnalysisContext, EvidenceStatement } from "./types"
import { insufficientDataStatement } from "./types"
import { ratioStatement } from "./narrative"

export function returnsAnalysis(ctx: AnalysisContext): AnalysisResult {
  const statements: EvidenceStatement[] = []
  const latest = ctx.periods[ctx.periods.length - 1]
  if (!latest) {
    return {
      category: "returns",
      title: "Returns Analysis",
      summary: "Insufficient data.",
      statements: [insufficientDataStatement("returns", ["NET_PROFIT", "TOTAL_EQUITY", "TOTAL_ASSETS"])],
      assessment: "UNKNOWN",
    }
  }
  const np = latest.values["NET_PROFIT"]
  const equity = latest.values["TOTAL_EQUITY"]
  const assets = latest.values["TOTAL_ASSETS"]
  const debt = latest.values["TOTAL_DEBT"]
  const cash = latest.values["CASH_AND_EQUIVALENTS"]
  const ebit = latest.values["EBIT"] ?? latest.values["OPERATING_INCOME"]
  const missing: string[] = []
  if (np === undefined) missing.push("NET_PROFIT")
  if (equity === undefined) missing.push("TOTAL_EQUITY")
  if (assets === undefined) missing.push("TOTAL_ASSETS")
  if (missing.length > 0) {
    return {
      category: "returns",
      title: "Returns Analysis",
      summary: `Insufficient data — ${missing.join(", ")} missing.`,
      statements: [insufficientDataStatement("returns", missing)],
      assessment: "UNKNOWN",
      periodKey: latest.periodKey,
    }
  }
  const roeRes = roe(np, equity)
  const roaRes = roa(np, assets)
  const roicRes = roic(np, debt, equity, cash)
  const roceRes = roce(ebit, debt, equity, cash)
  if (roeRes.status === "OK") statements.push(ratioStatement({ label: "Return on Equity", metricCode: "NET_PROFIT", value: roeRes.value!, periodKey: latest.periodKey, interpretation: roeRes.value! >= 15 ? "Strong profitability" : "Below threshold" }))
  if (roaRes.status === "OK") statements.push(ratioStatement({ label: "Return on Assets", metricCode: "NET_PROFIT", value: roaRes.value!, periodKey: latest.periodKey }))
  if (roicRes.status === "OK") statements.push(ratioStatement({ label: "Return on Invested Capital", metricCode: "NET_PROFIT", value: roicRes.value!, periodKey: latest.periodKey }))
  if (roceRes.status === "OK") statements.push(ratioStatement({ label: "Return on Capital Employed", metricCode: "OPERATING_INCOME", value: roceRes.value!, periodKey: latest.periodKey }))
  const roeVal = roeRes.value ?? 0
  const assessment = roeVal >= 15 ? "STRONG" : roeVal >= 8 ? "HEALTHY" : roeVal >= 3 ? "ADEQUATE" : "WEAK"
  return {
    category: "returns",
    title: "Returns Analysis",
    summary: `ROE ${roeRes.value?.toFixed(1) ?? "—"}%, ROA ${roaRes.value?.toFixed(1) ?? "—"}%.`,
    statements,
    assessment,
    periodKey: latest.periodKey,
  }
}
