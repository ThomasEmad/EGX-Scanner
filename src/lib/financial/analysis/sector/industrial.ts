// Industrial sector — operating leverage, DIO, capex intensity.
import type { AnalysisContext, AnalysisResult } from "../types"
import { insufficientDataStatement } from "../types"
import { ratioStatement } from "../narrative"

export function industrialAnalysis(ctx: AnalysisContext): AnalysisResult {
  const statements: AnalysisResult["statements"] = []
  const latest = ctx.periods[ctx.periods.length - 1]
  if (!latest) {
    return {
      category: "sector_overlay",
      title: "Industrial Sector Analysis",
      summary: "Insufficient data.",
      statements: [insufficientDataStatement("industrial_overlay", ["REVENUE", "OPERATING_INCOME", "INVENTORY", "CAPEX"])],
      assessment: "UNKNOWN",
    }
  }
  const revenue = latest.values["REVENUE"]
  const opIncome = latest.values["OPERATING_INCOME"]
  const inventory = latest.values["INVENTORY"]
  const capex = latest.values["CAPEX"]
  const cogs = latest.values["COGS"]
  // Operating leverage — revenue growth vs operating income growth
  const prior = ctx.periods.find((p) => p.periodKey === priorYearKey(latest.periodKey))
  if (prior && revenue !== undefined && opIncome !== undefined && prior.values.REVENUE && prior.values.OPERATING_INCOME) {
    const revGrowth = (revenue - prior.values.REVENUE) / Math.abs(prior.values.REVENUE) * 100
    const opGrowth = (opIncome - prior.values.OPERATING_INCOME) / Math.abs(prior.values.OPERATING_INCOME) * 100
    const leverage = opGrowth - revGrowth
    statements.push(ratioStatement({
      label: "Operating leverage (ΔOp growth − ΔRev growth)",
      metricCode: "OPERATING_INCOME",
      value: leverage,
      periodKey: latest.periodKey,
      interpretation: leverage > 0 ? "Positive operating leverage" : "Negative operating leverage",
    }))
  }
  if (inventory !== undefined && cogs !== undefined && cogs !== 0) {
    const dio = (inventory / Math.abs(cogs)) * 365
    statements.push(ratioStatement({ label: "Days Inventory Outstanding", metricCode: "INVENTORY", value: dio, periodKey: latest.periodKey, interpretation: "Days to clear inventory" }))
  }
  if (capex !== undefined && revenue !== undefined && revenue !== 0) {
    const capexIntensity = (capex / revenue) * 100
    statements.push(ratioStatement({
      label: "Capex intensity (capex/revenue)",
      metricCode: "CAPEX",
      value: capexIntensity,
      periodKey: latest.periodKey,
      interpretation: capexIntensity > 10 ? "High reinvestment" : "Moderate reinvestment",
    }))
  }
  if (statements.length === 0) {
    return {
      category: "sector_overlay",
      title: "Industrial Sector Analysis",
      summary: "Insufficient data — revenue, operating income, inventory or capex missing.",
      statements: [insufficientDataStatement("industrial_overlay", ["REVENUE", "OPERATING_INCOME", "INVENTORY", "CAPEX"])],
      assessment: "UNKNOWN",
      periodKey: latest.periodKey,
    }
  }
  const assessment = revenue !== undefined && opIncome !== undefined && opIncome / revenue > 0.1 ? "STRONG" :
    revenue !== undefined && opIncome !== undefined && opIncome / revenue > 0.05 ? "HEALTHY" : "ADEQUATE"
  return {
    category: "sector_overlay",
    title: "Industrial Sector Analysis",
    titleAr: "تحليل القطاع الصناعي",
    summary: `Capex intensity ${capex && revenue ? ((capex / revenue) * 100).toFixed(1) : "—"}%, DIO ${inventory && cogs ? ((inventory / Math.abs(cogs)) * 365).toFixed(0) : "—"} days.`,
    statements,
    assessment,
    periodKey: latest.periodKey,
  }
}

function priorYearKey(key: string): string {
  const [type, yearStr, sub] = key.split(":")
  return `${type}:${Number(yearStr) - 1}:${sub ?? ""}`
}
