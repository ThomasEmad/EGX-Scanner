// Energy / Utilities sector overlay — generation volume, installed capacity,
// utilization (capacity factor), tariff, fuel cost ratio, capex intensity.
//
// Spec section 12 (Energy / Utilities):
//   - Generation volumes
//   - Tariff / regulatory metrics
//   - Capacity utilization
//
// Energy companies are typically asset-heavy, regulated, with high fuel cost
// ratios (thermal generation). Renewable utilities have low fuel cost but
// high depreciation.

import type { AnalysisContext, AnalysisResult } from "../types"
import { insufficientDataStatement } from "../types"
import { ratioStatement } from "../narrative"

interface EnergyKpis {
  generationVolume?: number // MWh generated
  installedCapacity?: number // MW installed
  utilization?: number // capacity factor (%)
  tariff?: number // average tariff per MWh
  fuelCost?: number
  co2Emissions?: number
}

function readEnergyKpis(period: { values: Record<string, number> }): EnergyKpis {
  return {
    generationVolume: period.values["ENERGY_GENERATION_VOLUME"],
    installedCapacity: period.values["ENERGY_INSTALLED_CAPACITY"],
    utilization: period.values["ENERGY_UTILIZATION"],
    tariff: period.values["ENERGY_TARIFF"],
    fuelCost: period.values["ENERGY_FUEL_COST"],
    co2Emissions: period.values["ENERGY_CO2_EMISSIONS"],
  }
}

export function energyUtilitiesAnalysis(ctx: AnalysisContext): AnalysisResult {
  const statements: AnalysisResult["statements"] = []
  const latest = ctx.periods[ctx.periods.length - 1]
  if (!latest) {
    return {
      category: "sector_overlay",
      title: "Energy / Utilities Sector Analysis",
      summary: "Insufficient data.",
      statements: [insufficientDataStatement("energy_overlay", ["ENERGY_GENERATION_VOLUME", "ENERGY_INSTALLED_CAPACITY"])],
      assessment: "UNKNOWN",
    }
  }
  const kpi = readEnergyKpis(latest)
  const revenue = latest.values["REVENUE"]
  const grossProfit = latest.values["GROSS_PROFIT"]
  const totalAssets = latest.values["TOTAL_ASSETS"]
  const capex = latest.values["CAPEX"]
  const depreciation = latest.values["DEPRECIATION_EXPENSE"]
  const debt = latest.values["TOTAL_DEBT"]
  const ocf = latest.values["OPERATING_CASH_FLOW"]

  // Installed capacity
  if (kpi.installedCapacity !== undefined) {
    statements.push(ratioStatement({
      label: "Installed capacity (MW)",
      metricCode: "ENERGY_INSTALLED_CAPACITY",
      value: kpi.installedCapacity,
      periodKey: latest.periodKey,
      interpretation: "Total nameplate capacity across all generation units",
    }))
  }
  // Generation volume
  if (kpi.generationVolume !== undefined) {
    statements.push(ratioStatement({
      label: "Generation volume (MWh)",
      metricCode: "ENERGY_GENERATION_VOLUME",
      value: kpi.generationVolume,
      periodKey: latest.periodKey,
    }))
  }
  // Capacity utilization (capacity factor)
  const util = kpi.utilization ?? (
    kpi.generationVolume !== undefined && kpi.installedCapacity && kpi.installedCapacity > 0
      ? (kpi.generationVolume / (kpi.installedCapacity * 8760)) * 100
      : undefined
  )
  if (util !== undefined) {
    statements.push(ratioStatement({
      label: "Capacity utilization",
      metricCode: "ENERGY_UTILIZATION",
      value: util,
      periodKey: latest.periodKey,
      interpretation: util > 60 ? "High capacity factor — baseload asset" : util > 30 ? "Mid-merit / cycling operation" : util > 0 ? "Peaking / renewable (intermittent)" : "Idle capacity — utilization risk",
    }))
  }
  // Average tariff
  if (kpi.tariff !== undefined) {
    statements.push(ratioStatement({
      label: "Average tariff (per MWh)",
      metricCode: "ENERGY_TARIFF",
      value: kpi.tariff,
      periodKey: latest.periodKey,
      interpretation: "Blended average revenue per MWh sold",
    }))
  }
  // Implied tariff (revenue / generation)
  if (kpi.tariff === undefined && kpi.generationVolume !== undefined && revenue !== undefined && kpi.generationVolume !== 0) {
    const impliedTariff = revenue / kpi.generationVolume
    statements.push(ratioStatement({
      label: "Implied tariff (Revenue / MWh)",
      metricCode: "REVENUE",
      value: impliedTariff,
      periodKey: latest.periodKey,
      interpretation: "Calculated from revenue ÷ generation volume",
    }))
  }
  // Fuel cost ratio
  if (kpi.fuelCost !== undefined && revenue !== undefined && revenue !== 0) {
    const fuelRatio = (kpi.fuelCost / revenue) * 100
    statements.push(ratioStatement({
      label: "Fuel cost / Revenue",
      metricCode: "ENERGY_FUEL_COST",
      value: fuelRatio,
      periodKey: latest.periodKey,
      interpretation: fuelRatio > 50 ? "Thermal generation — fuel-dominated cost structure" : fuelRatio > 0 ? "Some fuel exposure" : "Likely renewable — minimal fuel cost",
    }))
  }
  // Gross margin
  if (grossProfit !== undefined && revenue !== undefined && revenue !== 0) {
    const gm = (grossProfit / revenue) * 100
    statements.push(ratioStatement({
      label: "Gross margin",
      metricCode: "GROSS_PROFIT",
      value: gm,
      periodKey: latest.periodKey,
      interpretation: gm > 50 ? "High gross margin — likely regulated utility" : gm > 25 ? "Healthy utility margin" : "Tight margin — commodity-exposed",
    }))
  }
  // Asset turnover (revenue / total assets) — utilities are asset-heavy
  if (revenue !== undefined && totalAssets !== undefined && totalAssets !== 0) {
    const assetTurn = revenue / totalAssets
    statements.push(ratioStatement({
      label: "Asset turnover",
      metricCode: "TOTAL_ASSETS",
      value: assetTurn,
      periodKey: latest.periodKey,
      interpretation: assetTurn < 0.3 ? "Very asset-heavy — capital-intensive utility" : "Standard utility asset intensity",
    }))
  }
  // Capex / Revenue — utilities reinvest heavily
  if (capex !== undefined && revenue !== undefined && revenue !== 0) {
    const capexIntensity = (capex / revenue) * 100
    statements.push(ratioStatement({
      label: "Capex / Revenue",
      metricCode: "CAPEX",
      value: capexIntensity,
      periodKey: latest.periodKey,
      interpretation: capexIntensity > 25 ? "Expansion / replacement cycle" : capexIntensity > 10 ? "Standard maintenance capex" : "Low reinvestment — mature asset base",
    }))
  }
  // Depreciation / Revenue — asset-heavy companies have high depreciation
  if (depreciation !== undefined && revenue !== undefined && revenue !== 0) {
    const depRatio = (depreciation / revenue) * 100
    statements.push(ratioStatement({
      label: "Depreciation / Revenue",
      metricCode: "DEPRECIATION_EXPENSE",
      value: depRatio,
      periodKey: latest.periodKey,
      interpretation: depRatio > 20 ? "Very high depreciation — large regulated asset base" : depRatio > 8 ? "Standard utility depreciation" : "Low depreciation — likely service-based",
    }))
  }
  // Debt / Assets — utilities carry significant debt
  if (debt !== undefined && totalAssets !== undefined && totalAssets !== 0) {
    const debtToAssets = (debt / totalAssets) * 100
    statements.push(ratioStatement({
      label: "Debt / Assets",
      metricCode: "TOTAL_DEBT",
      value: debtToAssets,
      periodKey: latest.periodKey,
      interpretation: debtToAssets > 60 ? "Highly leveraged — typical for regulated utility" : debtToAssets > 40 ? "Standard utility leverage" : "Conservative balance sheet",
    }))
  }
  // OCF margin
  if (ocf !== undefined && revenue !== undefined && revenue !== 0) {
    const ocfMargin = (ocf / revenue) * 100
    statements.push(ratioStatement({
      label: "Operating cash flow margin",
      metricCode: "OPERATING_CASH_FLOW",
      value: ocfMargin,
      periodKey: latest.periodKey,
      interpretation: ocfMargin > 25 ? "Strong cash generation — utility characteristic" : "Tight cash generation for utility",
    }))
  }
  // CO2 emissions (if disclosed)
  if (kpi.co2Emissions !== undefined) {
    statements.push(ratioStatement({
      label: "CO₂ emissions",
      metricCode: "ENERGY_CO2_EMISSIONS",
      value: kpi.co2Emissions,
      periodKey: latest.periodKey,
      interpretation: "Total direct emissions (tCO₂e) — thermal-heavy generators emit more",
    }))
  }

  if (statements.length === 0) {
    return {
      category: "sector_overlay",
      title: "Energy / Utilities Sector Analysis",
      summary: "Insufficient data — energy KPIs (ENERGY_GENERATION_VOLUME, ENERGY_INSTALLED_CAPACITY) missing.",
      statements: [insufficientDataStatement("energy_overlay", ["ENERGY_GENERATION_VOLUME", "ENERGY_INSTALLED_CAPACITY"])],
      assessment: "UNKNOWN",
      periodKey: latest.periodKey,
    }
  }
  const utilScore = util ? (util > 50 ? 2 : util > 30 ? 1 : 0) : 0
  const ocfScore = ocf && revenue ? (ocf / revenue > 0.2 ? 2 : ocf / revenue > 0.1 ? 1 : 0) : 0
  const total = utilScore + ocfScore
  const assessment = total >= 3 ? "STRONG" : total >= 2 ? "HEALTHY" : total >= 1 ? "ADEQUATE" : "WEAK"

  return {
    category: "sector_overlay",
    title: "Energy / Utilities Sector Analysis",
    titleAr: "تحليل قطاع الطاقة والمرافق",
    summary: `Capacity ${kpi.installedCapacity ?? "—"} MW, utilization ${util ? util.toFixed(1) : "—"}%, debt/assets ${debt && totalAssets ? ((debt / totalAssets) * 100).toFixed(1) : "—"}%.`,
    statements,
    assessment,
    periodKey: latest.periodKey,
  }
}
