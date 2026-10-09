// Working capital analysis — DSO, DIO, DPO, cash conversion cycle.
import { dso, dio, dpo, cashConversionCycle } from "../calc/advanced"
import type { AnalysisResult, AnalysisContext, EvidenceStatement } from "./types"
import { insufficientDataStatement } from "./types"
import { ratioStatement } from "./narrative"

export function workingCapitalAnalysis(ctx: AnalysisContext): AnalysisResult {
  const statements: EvidenceStatement[] = []
  const latest = ctx.periods[ctx.periods.length - 1]
  if (!latest) {
    return {
      category: "working_capital",
      title: "Working Capital",
      summary: "Insufficient data.",
      statements: [insufficientDataStatement("working_capital", ["REVENUE", "TRADE_RECEIVABLES", "INVENTORY", "TRADE_PAYABLES", "COGS"])],
      assessment: "UNKNOWN",
    }
  }
  const revenue = latest.values["REVENUE"]
  const receivables = latest.values["TRADE_RECEIVABLES"] ?? latest.values["ACCOUNTS_RECEIVABLE"]
  const inventory = latest.values["INVENTORY"]
  const payables = latest.values["TRADE_PAYABLES"]
  const cogs = latest.values["COGS"]
  const missing: string[] = []
  if (revenue === undefined) missing.push("REVENUE")
  if (receivables === undefined) missing.push("TRADE_RECEIVABLES")
  if (inventory === undefined) missing.push("INVENTORY")
  if (payables === undefined) missing.push("TRADE_PAYABLES")
  if (cogs === undefined) missing.push("COGS")
  if (missing.length > 0) {
    return {
      category: "working_capital",
      title: "Working Capital",
      summary: `Insufficient data — ${missing.join(", ")} missing.`,
      statements: [insufficientDataStatement("working_capital", missing)],
      assessment: "UNKNOWN",
      periodKey: latest.periodKey,
    }
  }
  const dsoRes = dso(receivables, revenue)
  const dioRes = dio(inventory, cogs)
  const dpoRes = dpo(payables, cogs)
  if (dsoRes.status === "OK") statements.push(ratioStatement({ label: "Days Sales Outstanding", metricCode: "TRADE_RECEIVABLES", value: dsoRes.value!, periodKey: latest.periodKey, interpretation: "Average collection period" }))
  if (dioRes.status === "OK") statements.push(ratioStatement({ label: "Days Inventory Outstanding", metricCode: "INVENTORY", value: dioRes.value!, periodKey: latest.periodKey, interpretation: "Average inventory days" }))
  if (dpoRes.status === "OK") statements.push(ratioStatement({ label: "Days Payables Outstanding", metricCode: "TRADE_PAYABLES", value: dpoRes.value!, periodKey: latest.periodKey, interpretation: "Average payment period" }))
  if (dsoRes.status === "OK" && dioRes.status === "OK" && dpoRes.status === "OK") {
    const ccc = cashConversionCycle(dsoRes.value, dioRes.value, dpoRes.value)
    if (ccc.status === "OK") {
      statements.push({
        id: "wc-ccc",
        label: "Cash Conversion Cycle",
        narrative: `Cash conversion cycle is ${ccc.value!.toFixed(0)} days (DSO + DIO − DPO).`,
        metricCodes: ["TRADE_RECEIVABLES", "INVENTORY", "TRADE_PAYABLES"],
        periodKeys: [latest.periodKey],
        sources: [
          { metricCode: "TRADE_RECEIVABLES", periodKey: latest.periodKey, value: receivables! },
          { metricCode: "INVENTORY", periodKey: latest.periodKey, value: inventory! },
          { metricCode: "TRADE_PAYABLES", periodKey: latest.periodKey, value: payables! },
        ],
        tone: ccc.value! > 90 ? "warning" : "neutral",
        confidence: 0.85,
        tags: ["working_capital"],
      })
    }
  }
  const cccVal = (dsoRes.value ?? 0) + (dioRes.value ?? 0) - (dpoRes.value ?? 0)
  const assessment = cccVal > 90 ? "WEAK" : cccVal > 45 ? "ADEQUATE" : "STRONG"
  return {
    category: "working_capital",
    title: "Working Capital",
    summary: `CCC ${cccVal.toFixed(0)} days (DSO ${dsoRes.value?.toFixed(0) ?? "—"} + DIO ${dioRes.value?.toFixed(0) ?? "—"} − DPO ${dpoRes.value?.toFixed(0) ?? "—"}).`,
    statements,
    assessment,
    periodKey: latest.periodKey,
  }
}
