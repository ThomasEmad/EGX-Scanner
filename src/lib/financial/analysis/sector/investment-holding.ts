// Investment holding sector — NAV, investments, associates, FV assets.
import type { AnalysisContext, AnalysisResult } from "../types"
import { insufficientDataStatement } from "../types"
import { ratioStatement } from "../narrative"

export function investmentHoldingAnalysis(ctx: AnalysisContext): AnalysisResult {
  const statements: AnalysisResult["statements"] = []
  const latest = ctx.periods[ctx.periods.length - 1]
  if (!latest) {
    return {
      category: "sector_overlay",
      title: "Investment Holding Sector Analysis",
      summary: "Insufficient data.",
      statements: [insufficientDataStatement("investment_holding_overlay", ["INVESTMENTS", "TOTAL_EQUITY", "ASSOCIATES_CARRYING"])],
      assessment: "UNKNOWN",
    }
  }
  const totalEquity = latest.values["TOTAL_EQUITY"]
  const investments = latest.values["INVESTMENTS"]
  const financialAssets = latest.values["FINANCIAL_ASSETS"]
  const fvpl = latest.values["FVPL_ASSETS"]
  const fvoci = latest.values["FVOCI_ASSETS"]
  const associates = latest.values["ASSOCIATES_CARRYING"]
  const jv = latest.values["JV_CARRYING"]
  const investmentProperty = latest.values["INVESTMENT_PROPERTY"]
  const shares = latest.values["SHARES_OUTSTANDING"]
  const associatesIncome = latest.values["ASSOCIATES_JV_INCOME"]
  const totalAssets = latest.values["TOTAL_ASSETS"]
  // NAV per share (proxy: total equity / shares)
  if (totalEquity !== undefined && shares !== undefined && shares > 0) {
    const nav = totalEquity / shares
    statements.push(ratioStatement({
      label: "NAV per share (book value proxy)",
      metricCode: "TOTAL_EQUITY",
      value: nav,
      periodKey: latest.periodKey,
      interpretation: "Equity per share — proxy for net asset value",
    }))
  }
  // Investments as % of total assets
  const totalInv = (investments ?? 0) + (financialAssets ?? 0) + (fvpl ?? 0) + (fvoci ?? 0) +
    (associates ?? 0) + (jv ?? 0) + (investmentProperty ?? 0)
  if (totalAssets !== undefined && totalAssets !== 0 && totalInv > 0) {
    const invPct = (totalInv / totalAssets) * 100
    statements.push(ratioStatement({
      label: "Investments as % of total assets",
      metricCode: "INVESTMENTS",
      value: invPct,
      periodKey: latest.periodKey,
      interpretation: "Concentration in investment assets",
    }))
  }
  if (associates !== undefined) statements.push(ratioStatement({ label: "Associates carrying value", metricCode: "ASSOCIATES_CARRYING", value: associates, periodKey: latest.periodKey }))
  if (jv !== undefined) statements.push(ratioStatement({ label: "Joint ventures carrying value", metricCode: "JV_CARRYING", value: jv, periodKey: latest.periodKey }))
  if (fvpl !== undefined) statements.push(ratioStatement({ label: "FVTPL assets", metricCode: "FVPL_ASSETS", value: fvpl, periodKey: latest.periodKey }))
  if (fvoci !== undefined) statements.push(ratioStatement({ label: "FVOCI assets", metricCode: "FVOCI_ASSETS", value: fvoci, periodKey: latest.periodKey }))
  if (associatesIncome !== undefined) statements.push(ratioStatement({ label: "Share of associates/JV profit", metricCode: "ASSOCIATES_JV_INCOME", value: associatesIncome, periodKey: latest.periodKey }))
  if (statements.length === 0) {
    return {
      category: "sector_overlay",
      title: "Investment Holding Sector Analysis",
      summary: "Insufficient data — no investment metrics disclosed.",
      statements: [insufficientDataStatement("investment_holding_overlay", ["INVESTMENTS", "TOTAL_EQUITY", "ASSOCIATES_CARRYING"])],
      assessment: "UNKNOWN",
      periodKey: latest.periodKey,
    }
  }
  const assessment = totalEquity !== undefined && totalEquity > 0 ? "HEALTHY" : "WEAK"
  return {
    category: "sector_overlay",
    title: "Investment Holding Sector Analysis",
    titleAr: "تحليل قطاع الاستثمار القابض",
    summary: `Investments/total assets ${totalAssets ? ((totalInv / totalAssets) * 100).toFixed(1) : "—"}%, NAV per share ${totalEquity && shares ? (totalEquity / shares).toFixed(2) : "—"}.`,
    statements,
    assessment,
    periodKey: latest.periodKey,
  }
}
