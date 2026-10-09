// Real estate sector — gross margin, inventory vs revenue, CFO margin.
import type { AnalysisContext, AnalysisResult } from "../types"
import { insufficientDataStatement } from "../types"
import { ratioStatement } from "../narrative"

export function realEstateAnalysis(ctx: AnalysisContext): AnalysisResult {
  const statements: AnalysisResult["statements"] = []
  const latest = ctx.periods[ctx.periods.length - 1]
  if (!latest) {
    return {
      category: "sector_overlay",
      title: "Real Estate Sector Analysis",
      summary: "Insufficient data.",
      statements: [insufficientDataStatement("real_estate_overlay", ["REVENUE", "INVENTORY", "GROSS_PROFIT"])],
      assessment: "UNKNOWN",
    }
  }
  const revenue = latest.values["REVENUE"]
  const grossProfit = latest.values["GROSS_PROFIT"]
  const inventory = latest.values["INVENTORY"]
  const ocf = latest.values["OPERATING_CASH_FLOW"]
  const cogs = latest.values["COGS"]
  if (revenue !== undefined && grossProfit !== undefined && revenue !== 0) {
    const gm = (grossProfit / revenue) * 100
    statements.push(ratioStatement({ label: "Gross margin", metricCode: "GROSS_PROFIT", value: gm, periodKey: latest.periodKey, interpretation: "Profit retained on each EGP of revenue" }))
  }
  if (inventory !== undefined && revenue !== undefined && revenue !== 0) {
    const invToRev = (inventory / revenue) * 100
    statements.push(ratioStatement({
      label: "Inventory to revenue",
      metricCode: "INVENTORY",
      value: invToRev,
      periodKey: latest.periodKey,
      interpretation: invToRev > 200 ? "Very high unsold inventory" : "Inventory relative to revenue",
    }))
  }
  if (ocf !== undefined && revenue !== undefined && revenue !== 0) {
    const cfoMargin = (ocf / revenue) * 100
    statements.push(ratioStatement({ label: "CFO margin", metricCode: "OPERATING_CASH_FLOW", value: cfoMargin, periodKey: latest.periodKey, interpretation: "Cash generation per EGP of revenue" }))
  }
  if (inventory !== undefined && cogs !== undefined && cogs !== 0) {
    const inventoryDays = (inventory / Math.abs(cogs)) * 365
    statements.push(ratioStatement({ label: "Inventory days", metricCode: "INVENTORY", value: inventoryDays, periodKey: latest.periodKey, interpretation: "Days to sell through inventory" }))
  }
  if (statements.length === 0) {
    return {
      category: "sector_overlay",
      title: "Real Estate Sector Analysis",
      summary: "Insufficient data — revenue, inventory or gross profit missing.",
      statements: [insufficientDataStatement("real_estate_overlay", ["REVENUE", "INVENTORY", "GROSS_PROFIT"])],
      assessment: "UNKNOWN",
      periodKey: latest.periodKey,
    }
  }
  const assessment = revenue !== undefined && grossProfit !== undefined && grossProfit / revenue > 0.25 ? "STRONG" :
    revenue !== undefined && grossProfit !== undefined && grossProfit / revenue > 0.1 ? "HEALTHY" : "ADEQUATE"
  return {
    category: "sector_overlay",
    title: "Real Estate Sector Analysis",
    titleAr: "تحليل قطاع العقارات",
    summary: `Gross margin ${revenue && grossProfit ? ((grossProfit / revenue) * 100).toFixed(1) : "—"}%, inventory/revenue ${inventory && revenue ? ((inventory / revenue) * 100).toFixed(1) : "—"}%.`,
    statements,
    assessment,
    periodKey: latest.periodKey,
  }
}
