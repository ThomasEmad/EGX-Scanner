// Healthcare sector overlay — bed capacity, occupancy, patient revenue mix,
// pharmacy revenue, admissions, doctor count, capex intensity.
//
// Spec section 12 (Healthcare):
//   - Patient revenue
//   - Hospital revenue
//   - Pharmacy revenue
//   - Bed capacity
//   - Utilization where disclosed
//   - Receivables
//   - Consumables
//   - Acquisition activity

import type { AnalysisContext, AnalysisResult } from "../types"
import { insufficientDataStatement } from "../types"
import { ratioStatement } from "../narrative"

interface HealthcareKpis {
  bedCapacity?: number
  occupancy?: number // already a percent (0-100)
  patientRevenue?: number
  pharmacyRevenue?: number
  doctorsCount?: number
  admissions?: number
}

function readHealthcareKpis(period: { values: Record<string, number> }): HealthcareKpis {
  return {
    bedCapacity: period.values["HEALTH_BED_CAPACITY"],
    occupancy: period.values["HEALTH_OCCUPANCY"],
    patientRevenue: period.values["HEALTH_PATIENT_REVENUE"],
    pharmacyRevenue: period.values["HEALTH_PHARMACY_REVENUE"],
    doctorsCount: period.values["HEALTH_DOCTORS_COUNT"],
    admissions: period.values["HEALTH_ADMISSIONS"],
  }
}

export function healthcareAnalysis(ctx: AnalysisContext): AnalysisResult {
  const statements: AnalysisResult["statements"] = []
  const latest = ctx.periods[ctx.periods.length - 1]
  if (!latest) {
    return {
      category: "sector_overlay",
      title: "Healthcare Sector Analysis",
      summary: "Insufficient data.",
      statements: [insufficientDataStatement("healthcare_overlay", ["HEALTH_BED_CAPACITY", "HEALTH_OCCUPANCY"])],
      assessment: "UNKNOWN",
    }
  }
  const kpi = readHealthcareKpis(latest)
  const revenue = latest.values["REVENUE"]
  const receivables = latest.values["ACCOUNTS_RECEIVABLE"]
  const ocf = latest.values["OPERATING_CASH_FLOW"]
  const capex = latest.values["CAPEX"]

  // Bed capacity
  if (kpi.bedCapacity !== undefined) {
    statements.push(ratioStatement({
      label: "Bed capacity",
      metricCode: "HEALTH_BED_CAPACITY",
      value: kpi.bedCapacity,
      periodKey: latest.periodKey,
      interpretation: "Total licensed beds across facilities",
    }))
  }
  // Occupancy
  if (kpi.occupancy !== undefined) {
    statements.push(ratioStatement({
      label: "Bed occupancy rate",
      metricCode: "HEALTH_OCCUPANCY",
      value: kpi.occupancy,
      periodKey: latest.periodKey,
      interpretation: kpi.occupancy > 75 ? "High occupancy — limited growth headroom" : kpi.occupancy < 50 ? "Underutilized capacity" : "Healthy occupancy",
    }))
  }
  // Patient revenue mix
  if (kpi.patientRevenue !== undefined && revenue !== undefined && revenue !== 0) {
    const patientPct = (kpi.patientRevenue / revenue) * 100
    statements.push(ratioStatement({
      label: "Patient revenue % of total",
      metricCode: "HEALTH_PATIENT_REVENUE",
      value: patientPct,
      periodKey: latest.periodKey,
      interpretation: patientPct > 80 ? "Pure-play healthcare services" : "Diversified revenue mix",
    }))
  }
  // Pharmacy revenue mix
  if (kpi.pharmacyRevenue !== undefined && revenue !== undefined && revenue !== 0) {
    const pharmacyPct = (kpi.pharmacyRevenue / revenue) * 100
    statements.push(ratioStatement({
      label: "Pharmacy revenue % of total",
      metricCode: "HEALTH_PHARMACY_REVENUE",
      value: pharmacyPct,
      periodKey: latest.periodKey,
      interpretation: pharmacyPct > 30 ? "Pharmacy dominates — higher inventory risk" : "Pharmacy supplementary to services",
    }))
  }
  // Revenue per bed
  if (revenue !== undefined && kpi.bedCapacity && kpi.bedCapacity > 0) {
    const revenuePerBed = revenue / kpi.bedCapacity
    statements.push(ratioStatement({
      label: "Revenue per bed",
      metricCode: "REVENUE",
      value: revenuePerBed,
      periodKey: latest.periodKey,
      interpretation: "Annualized revenue generated per licensed bed",
    }))
  }
  // Revenue per doctor
  if (revenue !== undefined && kpi.doctorsCount && kpi.doctorsCount > 0) {
    const revenuePerDoctor = revenue / kpi.doctorsCount
    statements.push(ratioStatement({
      label: "Revenue per doctor",
      metricCode: "REVENUE",
      value: revenuePerDoctor,
      periodKey: latest.periodKey,
      interpretation: "Annualized revenue per physician — productivity indicator",
    }))
  }
  // Receivables / Revenue (healthcare often has high receivables due to insurer/patient credit)
  if (receivables !== undefined && revenue !== undefined && revenue !== 0) {
    const recToRev = (receivables / revenue) * 100
    statements.push(ratioStatement({
      label: "Receivables / Revenue",
      metricCode: "ACCOUNTS_RECEIVABLE",
      value: recToRev,
      periodKey: latest.periodKey,
      interpretation: recToRev > 60 ? "High receivables — insurer/patient collection risk" : "Acceptable receivables level",
    }))
  }
  // Capex intensity (healthcare = asset-heavy)
  if (capex !== undefined && revenue !== undefined && revenue !== 0) {
    const capexIntensity = (capex / revenue) * 100
    statements.push(ratioStatement({
      label: "Capex / Revenue",
      metricCode: "CAPEX",
      value: capexIntensity,
      periodKey: latest.periodKey,
      interpretation: capexIntensity > 15 ? "Heavy expansion / facility investment" : capexIntensity < 5 ? "Maintenance-only capex" : "Standard healthcare capex",
    }))
  }
  // OCF margin (healthcare should generate strong cash)
  if (ocf !== undefined && revenue !== undefined && revenue !== 0) {
    const ocfMargin = (ocf / revenue) * 100
    statements.push(ratioStatement({
      label: "Operating cash flow margin",
      metricCode: "OPERATING_CASH_FLOW",
      value: ocfMargin,
      periodKey: latest.periodKey,
    }))
  }

  if (statements.length === 0) {
    return {
      category: "sector_overlay",
      title: "Healthcare Sector Analysis",
      summary: "Insufficient data — healthcare KPIs (HEALTH_BED_CAPACITY, HEALTH_OCCUPANCY) missing.",
      statements: [insufficientDataStatement("healthcare_overlay", ["HEALTH_BED_CAPACITY", "HEALTH_OCCUPANCY"])],
      assessment: "UNKNOWN",
      periodKey: latest.periodKey,
    }
  }
  const occupancyScore = kpi.occupancy ? (kpi.occupancy > 70 ? 2 : kpi.occupancy > 50 ? 1 : 0) : 0
  const ocfScore = ocf && revenue ? (ocf / revenue > 0.15 ? 2 : ocf / revenue > 0.05 ? 1 : 0) : 0
  const total = occupancyScore + ocfScore
  const assessment = total >= 3 ? "STRONG" : total >= 2 ? "HEALTHY" : total >= 1 ? "ADEQUATE" : "WEAK"

  return {
    category: "sector_overlay",
    title: "Healthcare Sector Analysis",
    titleAr: "تحليل قطاع الرعاية الصحية",
    summary: `Beds ${kpi.bedCapacity ?? "—"}, occupancy ${kpi.occupancy ?? "—"}%, OCF margin ${ocf && revenue ? ((ocf / revenue) * 100).toFixed(1) : "—"}%.`,
    statements,
    assessment,
    periodKey: latest.periodKey,
  }
}
