// Balance sheet quality — leverage, liquidity, asset composition.
import { debtToEquity, debtToAssets, currentRatio, quickRatio } from "../calc/advanced"
import type { AnalysisResult, AnalysisContext, EvidenceStatement } from "./types"
import { insufficientDataStatement } from "./types"
import { ratioStatement } from "./narrative"

export function balanceSheetQualityAnalysis(ctx: AnalysisContext): AnalysisResult {
  const statements: EvidenceStatement[] = []
  const latest = ctx.periods[ctx.periods.length - 1]
  if (!latest) {
    return {
      category: "balance_sheet_quality",
      title: "Balance Sheet Quality",
      summary: "Insufficient data.",
      statements: [insufficientDataStatement("balance_sheet_quality", ["TOTAL_ASSETS", "TOTAL_DEBT", "TOTAL_EQUITY"])],
      assessment: "UNKNOWN",
    }
  }
  const assets = latest.values["TOTAL_ASSETS"]
  const debt = latest.values["TOTAL_DEBT"]
  const equity = latest.values["TOTAL_EQUITY"]
  const currentAssets = latest.values["CURRENT_ASSETS"]
  const currentLiab = latest.values["CURRENT_LIABILITIES"]
  const inventory = latest.values["INVENTORY"]
  const missing: string[] = []
  if (assets === undefined) missing.push("TOTAL_ASSETS")
  if (debt === undefined) missing.push("TOTAL_DEBT")
  if (equity === undefined) missing.push("TOTAL_EQUITY")
  if (missing.length > 0) {
    return {
      category: "balance_sheet_quality",
      title: "Balance Sheet Quality",
      summary: `Insufficient data — ${missing.join(", ")} missing.`,
      statements: [insufficientDataStatement("balance_sheet_quality", missing)],
      assessment: "UNKNOWN",
      periodKey: latest.periodKey,
    }
  }
  const de = debtToEquity(debt, equity)
  const da = debtToAssets(debt, assets)
  if (de.status === "OK") statements.push(ratioStatement({ label: "Debt / Equity", metricCode: "TOTAL_DEBT", value: de.value!, periodKey: latest.periodKey, interpretation: de.value! > 2 ? "High leverage" : "Manageable leverage" }))
  if (da.status === "OK") statements.push(ratioStatement({ label: "Debt / Assets", metricCode: "TOTAL_DEBT", value: da.value!, periodKey: latest.periodKey }))
  if (currentAssets !== undefined && currentLiab !== undefined) {
    const cr = currentRatio(currentAssets, currentLiab)
    if (cr.status === "OK") statements.push(ratioStatement({ label: "Current ratio", metricCode: "CURRENT_ASSETS", value: cr.value!, periodKey: latest.periodKey, interpretation: cr.value! < 1 ? "Below 1 — short-term liquidity stress" : "Adequate liquidity" }))
    const qr = quickRatio(currentAssets, inventory, currentLiab)
    if (qr.status === "OK") statements.push(ratioStatement({ label: "Quick ratio", metricCode: "CURRENT_ASSETS", value: qr.value!, periodKey: latest.periodKey }))
  }
  const deVal = de.value ?? 0
  const crVal = currentRatio(currentAssets, currentLiab).value ?? 1
  const assessment = deVal > 2 || crVal < 1 ? "WEAK" : deVal > 1 || crVal < 1.5 ? "ADEQUATE" : "STRONG"
  return {
    category: "balance_sheet_quality",
    title: "Balance Sheet Quality",
    summary: `Debt/Equity ${de.value?.toFixed(2) ?? "—"}x, current ratio ${crVal.toFixed(2)}x.`,
    statements,
    assessment,
    periodKey: latest.periodKey,
  }
}
