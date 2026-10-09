// Consumer / Food sector overlay — gross margin, raw material cost ratio,
// distribution expense ratio, inventory turnover, working capital intensity,
// export sales mix, brand portfolio context.
//
// Spec section 12 (Consumer / Food):
//   - Volume where disclosed
//   - Revenue
//   - Gross margin
//   - Raw material costs
//   - Distribution expenses
//   - Inventory
//   - Working capital
//   - Export sales

import type { AnalysisContext, AnalysisResult } from "../types"
import { insufficientDataStatement } from "../types"
import { ratioStatement } from "../narrative"

interface FoodKpis {
  rawMaterialCost?: number
  distributionExpenses?: number
  volumeSold?: number
  exportRevenue?: number
  brandsCount?: number
  skuCount?: number
}

function readFoodKpis(period: { values: Record<string, number> }): FoodKpis {
  return {
    rawMaterialCost: period.values["FOOD_RAW_MATERIAL_COST"],
    distributionExpenses: period.values["FOOD_DISTRIBUTION_EXPENSES"],
    volumeSold: period.values["FOOD_VOLUME_SOLD"],
    exportRevenue: period.values["FOOD_EXPORT_REVENUE"],
    brandsCount: period.values["FOOD_BRANDS_COUNT"],
    skuCount: period.values["FOOD_SKU_COUNT"],
  }
}

export function consumerFoodAnalysis(ctx: AnalysisContext): AnalysisResult {
  const statements: AnalysisResult["statements"] = []
  const latest = ctx.periods[ctx.periods.length - 1]
  if (!latest) {
    return {
      category: "sector_overlay",
      title: "Consumer / Food Sector Analysis",
      summary: "Insufficient data.",
      statements: [insufficientDataStatement("food_overlay", ["REVENUE", "GROSS_PROFIT", "INVENTORY"])],
      assessment: "UNKNOWN",
    }
  }
  const kpi = readFoodKpis(latest)
  const revenue = latest.values["REVENUE"]
  const grossProfit = latest.values["GROSS_PROFIT"]
  const cogs = latest.values["COGS"]
  const inventory = latest.values["INVENTORY"]
  const receivables = latest.values["ACCOUNTS_RECEIVABLE"]
  const payables = latest.values["TRADE_PAYABLES"]
  const ocf = latest.values["OPERATING_CASH_FLOW"]
  const adminExpenses = latest.values["ADMIN_EXPENSES"]
  const sellingExpenses = latest.values["SELLING_EXPENSES"] ?? kpi.distributionExpenses

  // Gross margin — primary profitability indicator for CPG
  if (grossProfit !== undefined && revenue !== undefined && revenue !== 0) {
    const gm = (grossProfit / revenue) * 100
    statements.push(ratioStatement({
      label: "Gross margin",
      metricCode: "GROSS_PROFIT",
      value: gm,
      periodKey: latest.periodKey,
      interpretation: gm > 40 ? "Premium brand gross margin" : gm > 20 ? "Healthy CPG margin" : "Commodity-like margin — pricing pressure",
    }))
  }
  // Raw material cost ratio (when raw material disclosed separately)
  if (kpi.rawMaterialCost !== undefined && revenue !== undefined && revenue !== 0) {
    const rmRatio = (kpi.rawMaterialCost / revenue) * 100
    statements.push(ratioStatement({
      label: "Raw material cost / Revenue",
      metricCode: "FOOD_RAW_MATERIAL_COST",
      value: rmRatio,
      periodKey: latest.periodKey,
      interpretation: rmRatio > 60 ? "Commodity-input exposure — margin risk" : "Diversified input cost structure",
    }))
  }
  // Distribution / selling expense ratio
  if (sellingExpenses !== undefined && revenue !== undefined && revenue !== 0) {
    const distRatio = (sellingExpenses / revenue) * 100
    statements.push(ratioStatement({
      label: "Distribution expense / Revenue",
      metricCode: "SELLING_EXPENSES",
      value: distRatio,
      periodKey: latest.periodKey,
      interpretation: distRatio > 20 ? "Heavy distribution / marketing spend" : distRatio < 8 ? "Lean distribution — likely direct channels" : "Standard CPG distribution cost",
    }))
  }
  // Admin expense ratio
  if (adminExpenses !== undefined && revenue !== undefined && revenue !== 0) {
    const adminRatio = (adminExpenses / revenue) * 100
    statements.push(ratioStatement({
      label: "G&A expense / Revenue",
      metricCode: "ADMIN_EXPENSES",
      value: adminRatio,
      periodKey: latest.periodKey,
      interpretation: adminRatio > 10 ? "Heavy overhead — operational leverage risk" : "Lean G&A",
    }))
  }
  // Inventory turnover / days inventory outstanding (DIO)
  if (inventory !== undefined && cogs !== undefined && cogs !== 0) {
    const dio = (inventory / Math.abs(cogs)) * 365
    statements.push(ratioStatement({
      label: "Days Inventory Outstanding (DIO)",
      metricCode: "INVENTORY",
      value: dio,
      periodKey: latest.periodKey,
      interpretation: dio > 120 ? "High inventory — slow-moving / write-down risk" : dio < 45 ? "Fast inventory turn — fresh product" : "Normal CPG inventory turn",
    }))
  }
  // Receivables / Revenue (DSO)
  if (receivables !== undefined && revenue !== undefined && revenue !== 0) {
    const dso = (receivables / revenue) * 365
    statements.push(ratioStatement({
      label: "Days Sales Outstanding (DSO)",
      metricCode: "ACCOUNTS_RECEIVABLE",
      value: dso,
      periodKey: latest.periodKey,
      interpretation: dso > 90 ? "Long collection cycle — distributor/retailer credit risk" : dso < 30 ? "Short cash cycle — mostly cash sales" : "Standard CPG DSO",
    }))
  }
  // Trade payables / Revenue (DPO) — negotiating power with suppliers
  if (payables !== undefined && cogs !== undefined && cogs !== 0) {
    const dpo = (payables / Math.abs(cogs)) * 365
    statements.push(ratioStatement({
      label: "Days Payables Outstanding (DPO)",
      metricCode: "TRADE_PAYABLES",
      value: dpo,
      periodKey: latest.periodKey,
      interpretation: dpo > 90 ? "Strong supplier credit terms" : dpo < 30 ? "Weak negotiating power with suppliers" : "Standard DPO",
    }))
  }
  // Cash conversion cycle = DSO + DIO − DPO
  const dso = receivables && revenue && revenue !== 0 ? (receivables / revenue) * 365 : undefined
  const dio = inventory && cogs && cogs !== 0 ? (inventory / Math.abs(cogs)) * 365 : undefined
  const dpo = payables && cogs && cogs !== 0 ? (payables / Math.abs(cogs)) * 365 : undefined
  if (dso !== undefined && dio !== undefined && dpo !== undefined) {
    const ccc = dso + dio - dpo
    statements.push(ratioStatement({
      label: "Cash Conversion Cycle (days)",
      metricCode: "INVENTORY",
      value: ccc,
      periodKey: latest.periodKey,
      interpretation: ccc > 90 ? "Long cash cycle — heavy working capital needs" : ccc < 30 ? "Short cash cycle — efficient working capital" : "Standard CPG cycle",
    }))
  }
  // Export sales mix
  if (kpi.exportRevenue !== undefined && revenue !== undefined && revenue !== 0) {
    const exportPct = (kpi.exportRevenue / revenue) * 100
    statements.push(ratioStatement({
      label: "Export revenue % of total",
      metricCode: "FOOD_EXPORT_REVENUE",
      value: exportPct,
      periodKey: latest.periodKey,
      interpretation: exportPct > 30 ? "Significant export exposure (FX risk & upside)" : exportPct > 0 ? "Some export revenue" : "Domestic-only revenue",
    }))
  }
  // OCF margin — should be high for healthy CPG
  if (ocf !== undefined && revenue !== undefined && revenue !== 0) {
    const ocfMargin = (ocf / revenue) * 100
    statements.push(ratioStatement({
      label: "Operating cash flow margin",
      metricCode: "OPERATING_CASH_FLOW",
      value: ocfMargin,
      periodKey: latest.periodKey,
      interpretation: ocfMargin > 12 ? "Strong cash generation" : ocfMargin < 5 ? "Weak cash conversion" : "Acceptable CPG cash margin",
    }))
  }

  if (statements.length === 0) {
    return {
      category: "sector_overlay",
      title: "Consumer / Food Sector Analysis",
      summary: "Insufficient data — food/CPG KPIs missing.",
      statements: [insufficientDataStatement("food_overlay", ["REVENUE", "GROSS_PROFIT", "INVENTORY"])],
      assessment: "UNKNOWN",
      periodKey: latest.periodKey,
    }
  }
  const gmScore = grossProfit && revenue ? (grossProfit / revenue > 0.3 ? 2 : grossProfit / revenue > 0.15 ? 1 : 0) : 0
  const ocfScore = ocf && revenue ? (ocf / revenue > 0.1 ? 2 : ocf / revenue > 0.03 ? 1 : 0) : 0
  const total = gmScore + ocfScore
  const assessment = total >= 3 ? "STRONG" : total >= 2 ? "HEALTHY" : total >= 1 ? "ADEQUATE" : "WEAK"

  return {
    category: "sector_overlay",
    title: "Consumer / Food Sector Analysis",
    titleAr: "تحليل قطاع الاستهلاكي والأغذية",
    summary: `Gross margin ${grossProfit && revenue ? ((grossProfit / revenue) * 100).toFixed(1) : "—"}%, DIO ${dio ? dio.toFixed(0) : "—"} days, DSO ${dso ? dso.toFixed(0) : "—"} days.`,
    statements,
    assessment,
    periodKey: latest.periodKey,
  }
}
