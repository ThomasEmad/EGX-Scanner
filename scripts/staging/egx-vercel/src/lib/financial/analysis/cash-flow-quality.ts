// Cash flow quality — operating cash flow trend, FCF generation, cash conversion.
import { freeCashFlow, fcfMargin, cashConversion } from "../calc/advanced"
import type { AnalysisResult, AnalysisContext, EvidenceStatement } from "./types"
import { insufficientDataStatement } from "./types"
import { ratioStatement } from "./narrative"

export function cashFlowQualityAnalysis(ctx: AnalysisContext): AnalysisResult {
  const statements: EvidenceStatement[] = []
  const latest = ctx.periods[ctx.periods.length - 1]
  if (!latest) {
    return {
      category: "cash_flow_quality",
      title: "Cash Flow Quality",
      summary: "Insufficient data.",
      statements: [insufficientDataStatement("cash_flow_quality", ["OPERATING_CASH_FLOW"])],
      assessment: "UNKNOWN",
    }
  }
  const ocf = latest.values["OPERATING_CASH_FLOW"]
  const capex = latest.values["CAPEX"]
  const fcfReported = latest.values["FREE_CASH_FLOW"]
  const revenue = latest.values["REVENUE"]
  const ebitda = latest.values["EBITDA"] ?? latest.values["OPERATING_INCOME"]
  const cfi = latest.values["INVESTING_CASH_FLOW"]
  const cff = latest.values["FINANCING_CASH_FLOW"]
  const netChgCash = latest.values["NET_CHANGE_IN_CASH"]
  const cashTaxes = latest.values["CASH_TAXES_PAID"]
  const incomeTax = latest.values["INCOME_TAX"]
  const cashInterest = latest.values["CASH_INTEREST_PAID"]
  const interestExp = latest.values["INTEREST_EXPENSE"] ?? latest.values["FINANCE_COST"]
  if (ocf === undefined) {
    return {
      category: "cash_flow_quality",
      title: "Cash Flow Quality",
      summary: "Insufficient data — OPERATING_CASH_FLOW missing.",
      statements: [insufficientDataStatement("cash_flow_quality", ["OPERATING_CASH_FLOW"])],
      assessment: "UNKNOWN",
      periodKey: latest.periodKey,
    }
  }
  statements.push({
    id: "cfq-ocf",
    label: "Operating cash flow level",
    narrative: `Operating cash flow for ${latest.periodLabel} is ${ocf.toExponential(2)}.`,
    metricCodes: ["OPERATING_CASH_FLOW"],
    periodKeys: [latest.periodKey],
    sources: [{ metricCode: "OPERATING_CASH_FLOW", periodKey: latest.periodKey, value: ocf }],
    tone: ocf >= 0 ? "positive" : "negative",
    confidence: 1,
    tags: ["cash_flow"],
  })
  // Reported FCF from the statement (TradingView publishes it) or derived
  // CFO − capex when only the components exist.
  const fcfValue = fcfReported ?? (capex !== undefined ? freeCashFlow(ocf, capex).status === "OK" ? freeCashFlow(ocf, capex).value : undefined : undefined)
  if (fcfValue !== undefined) {
    statements.push(
      ratioStatement({
        label: "Free cash flow",
        metricCode: fcfReported !== undefined ? "FREE_CASH_FLOW" : "OPERATING_CASH_FLOW",
        value: fcfValue,
        periodKey: latest.periodKey,
        interpretation: fcfValue >= 0 ? "Cash-generative after investment" : "Burning cash after investment",
      })
    )
    if (revenue !== undefined) {
      const m = fcfMargin(fcfValue, revenue)
      if (m.status === "OK") statements.push(ratioStatement({ label: "FCF margin", metricCode: "OPERATING_CASH_FLOW", value: m.value!, periodKey: latest.periodKey }))
    }
  }
  if (ebitda !== undefined) {
    const cc = cashConversion(ocf, ebitda)
    if (cc.status === "OK") {
      statements.push(ratioStatement({ label: "Cash conversion (CFO/EBITDA)", metricCode: "OPERATING_CASH_FLOW", value: cc.value!, periodKey: latest.periodKey, interpretation: cc.value! < 0.5 ? "Weak conversion — profits not becoming cash" : "Healthy conversion" }))
    }
  }
  // ΔCash identity: CFO + CFI + CFF (+ FX, misc) should reconcile with the
  // reported net change in cash. A large gap flags statement inconsistency.
  if (netChgCash !== undefined && cfi !== undefined && cff !== undefined) {
    const fx = latest.values["FX_CASH_EFFECT"] ?? 0
    const sum = ocf + cfi + cff + fx
    const tol = Math.max(Math.abs(netChgCash) * 0.03, 1_000_000)
    if (Math.abs(sum - netChgCash) > tol) {
      statements.push({
        id: "cfq-dcash-gap",
        label: "Cash flow identity gap",
        narrative: `CFO (${ocf.toExponential(2)}) + CFI (${cfi.toExponential(2)}) + CFF (${cff.toExponential(2)})${fx ? ` + FX (${fx.toExponential(2)})` : ""} = ${sum.toExponential(2)} vs reported net change in cash ${netChgCash.toExponential(2)} — a ${(Math.abs(sum - netChgCash) / Math.max(Math.abs(netChgCash), 1) * 100).toFixed(1)}% gap. Some movement is not classified in the three activities.`,
        metricCodes: ["NET_CHANGE_IN_CASH", "OPERATING_CASH_FLOW"],
        periodKeys: [latest.periodKey],
        sources: [
          { metricCode: "NET_CHANGE_IN_CASH", periodKey: latest.periodKey, value: netChgCash },
          { metricCode: "OPERATING_CASH_FLOW", periodKey: latest.periodKey, value: ocf },
        ],
        tone: "warning",
        confidence: 0.85,
        tags: ["coherence"],
      })
    }
  }
  // Cash-vs-accrual: cash taxes/interest paid against the P&L accruals — a
  // persistent cash figure far below the accrual flags aggressive booking.
  if (cashTaxes !== undefined && incomeTax !== undefined && incomeTax !== 0) {
    const ratio = cashTaxes / Math.abs(incomeTax)
    if (ratio < 0.5 || ratio > 2) {
      statements.push(
        ratioStatement({
          label: "Cash taxes vs accrued tax expense",
          metricCode: "CASH_TAXES_PAID",
          value: ratio,
          periodKey: latest.periodKey,
          interpretation: `Cash taxes paid equal ${(ratio * 100).toFixed(0)}% of the booked income-tax expense — ${ratio < 0.5 ? "timing differences or tax incentives" : "catch-up payments of prior-period taxes"}.`,
        })
      )
    }
  }
  if (cashInterest !== undefined && interestExp !== undefined && interestExp !== 0) {
    const ratio = cashInterest / Math.abs(interestExp)
    if (ratio < 0.5 || ratio > 2) {
      statements.push(
        ratioStatement({
          label: "Cash interest vs booked interest expense",
          metricCode: "CASH_INTEREST_PAID",
          value: ratio,
          periodKey: latest.periodKey,
          interpretation: `Cash interest paid equals ${(ratio * 100).toFixed(0)}% of booked interest expense — ${ratio < 0.5 ? "possible capitalization or accrual buildup" : "payments covering prior periods"}.`,
        })
      )
    }
  }
  const assessment = ocf <= 0 ? "WEAK" : fcfValue !== undefined ? (fcfValue > 0 ? "STRONG" : "ADEQUATE") : capex !== undefined && ocf - Math.abs(capex) > 0 ? "STRONG" : "HEALTHY"
  return {
    category: "cash_flow_quality",
    title: "Cash Flow Quality",
    summary: `Operating cash flow ${ocf.toExponential(2)}${fcfValue !== undefined ? `, FCF ${fcfValue.toExponential(2)}` : ""}${netChgCash !== undefined ? `, net change in cash ${netChgCash.toExponential(2)}` : ""}.`,
    statements,
    assessment,
    periodKey: latest.periodKey,
  }
}
