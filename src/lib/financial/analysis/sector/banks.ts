// Banks sector — Net Interest Margin (NIM), loan growth, deposit growth, LDR,
// cost-to-income ratio, ROAA, ROAE.
import type { AnalysisContext, AnalysisResult } from "../types"
import { insufficientDataStatement } from "../types"
import { ratioStatement } from "../narrative"

export function banksAnalysis(ctx: AnalysisContext): AnalysisResult {
  const statements: AnalysisResult["statements"] = []
  const latest = ctx.periods[ctx.periods.length - 1]
  if (!latest) {
    return {
      category: "sector_overlay",
      title: "Banks Sector Analysis",
      summary: "Insufficient data.",
      statements: [insufficientDataStatement("banks_overlay", ["NET_INTEREST_INCOME", "LOANS_NET", "DEPOSITS"])],
      assessment: "UNKNOWN",
    }
  }
  const nii = latest.values["NET_INTEREST_INCOME"]
  const loans = latest.values["LOANS_NET"]
  const deposits = latest.values["DEPOSITS"]
  const totalAssets = latest.values["TOTAL_ASSETS"]
  const equity = latest.values["TOTAL_EQUITY"]
  const np = latest.values["NET_PROFIT"]
  const operatingIncome = latest.values["OPERATING_INCOME"]
  const adminExp = latest.values["ADMIN_EXPENSES"]
  const sellExp = latest.values["SELLING_EXPENSES"]
  const operatingExpensesTotal = latest.values["OPERATING_EXPENSES_TOTAL"] ??
    ((adminExp ?? 0) + (sellExp ?? 0) || undefined)
  // NIM
  if (nii !== undefined && totalAssets !== undefined && totalAssets !== 0) {
    const nim = (nii / totalAssets) * 100
    statements.push(ratioStatement({
      label: "Net Interest Margin (approx, on assets)",
      metricCode: "NET_INTEREST_INCOME",
      value: nim,
      periodKey: latest.periodKey,
      interpretation: "NII as % of total assets (a simplified NIM proxy)",
    }))
  }
  // LDR
  if (loans !== undefined && deposits !== undefined && deposits !== 0) {
    const ldr = (loans / deposits) * 100
    statements.push(ratioStatement({
      label: "Loan-to-Deposit Ratio",
      metricCode: "LOANS_NET",
      value: ldr,
      periodKey: latest.periodKey,
      interpretation: ldr > 90 ? "High LDR — liquidity tight" : ldr < 60 ? "Low LDR — under-utilized deposits" : "Healthy LDR",
    }))
  }
  // Cost-to-income
  if (operatingExpensesTotal !== undefined && operatingIncome !== undefined && operatingIncome !== 0) {
    const cir = (operatingExpensesTotal / operatingIncome) * 100
    statements.push(ratioStatement({
      label: "Cost-to-Income Ratio",
      metricCode: "OPERATING_EXPENSES_TOTAL",
      value: cir,
      periodKey: latest.periodKey,
      interpretation: "Operating expenses as % of operating income",
    }))
  }
  // ROAA (Return on Average Assets — simplified to end-of-period)
  if (np !== undefined && totalAssets !== undefined && totalAssets !== 0) {
    const roaa = (np / totalAssets) * 100
    statements.push(ratioStatement({ label: "ROAA", metricCode: "NET_PROFIT", value: roaa, periodKey: latest.periodKey }))
  }
  // ROAE (Return on Average Equity — simplified to end-of-period)
  if (np !== undefined && equity !== undefined && equity !== 0) {
    const roae = (np / equity) * 100
    statements.push(ratioStatement({ label: "ROAE", metricCode: "NET_PROFIT", value: roae, periodKey: latest.periodKey }))
  }
  // Loan growth + deposit growth (prior year)
  const prior = ctx.periods.find((p) => p.periodKey === priorYearKey(latest.periodKey))
  if (prior) {
    if (loans !== undefined && prior.values.LOANS_NET && prior.values.LOANS_NET > 0) {
      const loanGrowth = ((loans - prior.values.LOANS_NET) / Math.abs(prior.values.LOANS_NET)) * 100
      statements.push(ratioStatement({ label: "Loan growth YoY", metricCode: "LOANS_NET", value: loanGrowth, periodKey: latest.periodKey }))
    }
    if (deposits !== undefined && prior.values.DEPOSITS && prior.values.DEPOSITS > 0) {
      const depGrowth = ((deposits - prior.values.DEPOSITS) / Math.abs(prior.values.DEPOSITS)) * 100
      statements.push(ratioStatement({ label: "Deposit growth YoY", metricCode: "DEPOSITS", value: depGrowth, periodKey: latest.periodKey }))
    }
  }
  if (statements.length === 0) {
    return {
      category: "sector_overlay",
      title: "Banks Sector Analysis",
      summary: "Insufficient data — bank-specific metrics (NII, LOANS_NET, DEPOSITS) missing.",
      statements: [insufficientDataStatement("banks_overlay", ["NET_INTEREST_INCOME", "LOANS_NET", "DEPOSITS"])],
      assessment: "UNKNOWN",
      periodKey: latest.periodKey,
    }
  }
  const assessment = np !== undefined && equity !== undefined && np / equity > 0.15 ? "STRONG" :
    np !== undefined && equity !== undefined && np / equity > 0.08 ? "HEALTHY" : "ADEQUATE"
  return {
    category: "sector_overlay",
    title: "Banks Sector Analysis",
    titleAr: "تحليل قطاع البنوك",
    summary: `NII ${nii?.toExponential(2) ?? "—"}, LDR ${loans && deposits ? ((loans / deposits) * 100).toFixed(1) : "—"}%.`,
    statements,
    assessment,
    periodKey: latest.periodKey,
  }
}

function priorYearKey(key: string): string {
  const [type, yearStr, sub] = key.split(":")
  return `${type}:${Number(yearStr) - 1}:${sub ?? ""}`
}
