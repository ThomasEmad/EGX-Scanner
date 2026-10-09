// Telecom / Technology sector overlay — ARPU, subscriber base, churn,
// service revenue, data revenue, EBITDA margin, network capex intensity.
//
// Spec section 12 (Telecom / Technology):
//   - Subscribers
//   - ARPU
//   - Service revenue
//   - Data revenue
//   - EBITDA
//   - Capex
//   - Network investments
//   - Churn where disclosed

import type { AnalysisContext, AnalysisResult } from "../types"
import { insufficientDataStatement } from "../types"
import { ratioStatement } from "../narrative"

interface TelecomKpis {
  subscribers?: number
  arpu?: number
  churn?: number
  serviceRevenue?: number
  dataRevenue?: number
  ebitda?: number
  networkCapex?: number
}

function readTelecomKpis(period: { values: Record<string, number> }): TelecomKpis {
  return {
    subscribers: period.values["TELECOM_SUBSCRIBERS"],
    arpu: period.values["TELECOM_ARPU"],
    churn: period.values["TELECOM_CHURN"],
    serviceRevenue: period.values["TELECOM_SERVICE_REVENUE"],
    dataRevenue: period.values["TELECOM_DATA_REVENUE"],
    ebitda: period.values["TELECOM_EBITDA"],
    networkCapex: period.values["TELECOM_NETWORK_CAPEX"],
  }
}

export function telecomAnalysis(ctx: AnalysisContext): AnalysisResult {
  const statements: AnalysisResult["statements"] = []
  const latest = ctx.periods[ctx.periods.length - 1]
  if (!latest) {
    return {
      category: "sector_overlay",
      title: "Telecom / Technology Sector Analysis",
      summary: "Insufficient data.",
      statements: [insufficientDataStatement("telecom_overlay", ["TELECOM_SUBSCRIBERS", "TELECOM_ARPU"])],
      assessment: "UNKNOWN",
    }
  }
  const kpi = readTelecomKpis(latest)
  const revenue = latest.values["REVENUE"]
  const ocf = latest.values["OPERATING_CASH_FLOW"]
  const capex = latest.values["CAPEX"] ?? kpi.networkCapex
  const totalAssets = latest.values["TOTAL_ASSETS"]

  // ARPU
  if (kpi.arpu !== undefined) {
    statements.push(ratioStatement({
      label: "ARPU (Average Revenue Per User)",
      metricCode: "TELECOM_ARPU",
      value: kpi.arpu,
      periodKey: latest.periodKey,
      interpretation: kpi.arpu < 30 ? "Low ARPU — prepaid-heavy mix" : kpi.arpu > 100 ? "Premium ARPU — postpaid mix" : "Mid-range ARPU",
    }))
  }
  // Subscriber base
  if (kpi.subscribers !== undefined) {
    statements.push(ratioStatement({
      label: "Subscriber base",
      metricCode: "TELECOM_SUBSCRIBERS",
      value: kpi.subscribers,
      periodKey: latest.periodKey,
      interpretation: "Total active subscribers (millions)",
    }))
  }
  // Service revenue mix
  if (kpi.serviceRevenue !== undefined && revenue !== undefined && revenue !== 0) {
    const servicePct = (kpi.serviceRevenue / revenue) * 100
    statements.push(ratioStatement({
      label: "Service revenue % of total",
      metricCode: "TELECOM_SERVICE_REVENUE",
      value: servicePct,
      periodKey: latest.periodKey,
      interpretation: servicePct < 60 ? "Significant non-service (handset/equipment) revenue" : "Predominantly recurring service revenue",
    }))
  }
  // Data revenue mix
  if (kpi.dataRevenue !== undefined && kpi.serviceRevenue !== undefined && kpi.serviceRevenue !== 0) {
    const dataPct = (kpi.dataRevenue / kpi.serviceRevenue) * 100
    statements.push(ratioStatement({
      label: "Data revenue % of service revenue",
      metricCode: "TELECOM_DATA_REVENUE",
      value: dataPct,
      periodKey: latest.periodKey,
      interpretation: dataPct > 50 ? "Data-dominant revenue mix" : "Voice/legacy still significant",
    }))
  }
  // EBITDA margin
  if (kpi.ebitda !== undefined && revenue !== undefined && revenue !== 0) {
    const ebitdaMargin = (kpi.ebitda / revenue) * 100
    statements.push(ratioStatement({
      label: "EBITDA margin",
      metricCode: "TELECOM_EBITDA",
      value: ebitdaMargin,
      periodKey: latest.periodKey,
      interpretation: ebitdaMargin > 40 ? "Healthy telecom EBITDA margin" : ebitdaMargin > 25 ? "Acceptable telecom EBITDA margin" : "Weak EBITDA margin — pricing pressure",
    }))
  }
  // Network capex intensity
  if (capex !== undefined && revenue !== undefined && revenue !== 0) {
    const capexIntensity = (capex / revenue) * 100
    statements.push(ratioStatement({
      label: "Network capex / revenue",
      metricCode: "CAPEX",
      value: capexIntensity,
      periodKey: latest.periodKey,
      interpretation: capexIntensity > 25 ? "Heavy network investment cycle" : capexIntensity < 10 ? "Mature — low reinvestment" : "Standard capex intensity",
    }))
  }
  // Churn
  if (kpi.churn !== undefined) {
    statements.push(ratioStatement({
      label: "Churn rate",
      metricCode: "TELECOM_CHURN",
      value: kpi.churn,
      periodKey: latest.periodKey,
      interpretation: kpi.churn > 5 ? "High churn — customer retention issue" : kpi.churn < 1.5 ? "Low churn — sticky customer base" : "Normal churn",
    }))
  }
  // OCF / Revenue
  if (ocf !== undefined && revenue !== undefined && revenue !== 0) {
    const ocfMargin = (ocf / revenue) * 100
    statements.push(ratioStatement({
      label: "Operating cash flow margin",
      metricCode: "OPERATING_CASH_FLOW",
      value: ocfMargin,
      periodKey: latest.periodKey,
      interpretation: ocfMargin > 30 ? "Strong cash generation" : ocfMargin < 10 ? "Weak cash conversion" : "Acceptable cash margin",
    }))
  }

  // Subscriber growth YoY
  const priorKey = priorYearKey(latest.periodKey)
  const prior = ctx.periods.find((p) => p.periodKey === priorKey)
  if (prior && kpi.subscribers !== undefined && prior.values.TELECOM_SUBSCRIBERS) {
    const priorSubs = prior.values.TELECOM_SUBSCRIBERS
    if (priorSubs > 0) {
      const growth = ((kpi.subscribers - priorSubs) / Math.abs(priorSubs)) * 100
      statements.push(ratioStatement({
        label: "Subscriber growth YoY",
        metricCode: "TELECOM_SUBSCRIBERS",
        value: growth,
        periodKey: latest.periodKey,
        interpretation: growth < 0 ? "Subscriber base shrinking" : growth > 5 ? "Strong subscriber growth" : "Steady subscriber growth",
      }))
    }
  }

  if (statements.length === 0) {
    return {
      category: "sector_overlay",
      title: "Telecom / Technology Sector Analysis",
      summary: "Insufficient data — telecom KPIs (TELECOM_SUBSCRIBERS, TELECOM_ARPU) missing.",
      statements: [insufficientDataStatement("telecom_overlay", ["TELECOM_SUBSCRIBERS", "TELECOM_ARPU"])],
      assessment: "UNKNOWN",
      periodKey: latest.periodKey,
    }
  }
  // Assessment: strong if EBITDA margin > 35% AND subscriber growth > 3%
  const ebitdaMargin = kpi.ebitda && revenue ? kpi.ebitda / revenue : 0
  const subscriberGrowth = prior && kpi.subscribers && prior.values.TELECOM_SUBSCRIBERS
    ? (kpi.subscribers - prior.values.TELECOM_SUBSCRIBERS) / Math.abs(prior.values.TELECOM_SUBSCRIBERS)
    : 0
  const assessment = ebitdaMargin > 0.35 && subscriberGrowth > 0.03 ? "STRONG"
    : ebitdaMargin > 0.25 || subscriberGrowth > 0 ? "HEALTHY"
    : ebitdaMargin > 0.15 ? "ADEQUATE" : "WEAK"

  return {
    category: "sector_overlay",
    title: "Telecom / Technology Sector Analysis",
    titleAr: "تحليل قطاع الاتصالات والتكنولوجيا",
    summary: `ARPU ${kpi.arpu ?? "—"}, subscribers ${kpi.subscribers ?? "—"}, EBITDA margin ${ebitdaMargin ? (ebitdaMargin * 100).toFixed(1) : "—"}%.`,
    statements,
    assessment,
    periodKey: latest.periodKey,
  }
}

function priorYearKey(key: string): string {
  const [type, yearStr, sub] = key.split(":")
  return `${type}:${Number(yearStr) - 1}:${sub ?? ""}`
}
