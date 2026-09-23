// Event Engine — detects financial events/patterns from ACTUAL stored values.
// Explanations are generated from stored values and rules — never invented by AI.
// Rule version is stored with every event so calculations remain auditable.

import { formatEgp, formatPercent } from "./units"
import type { MetricResult } from "./calc"

export const EVENTS_RULE_VERSION = "events@1"

export interface PeriodData {
  periodKey: string
  periodType: string
  fiscalYear: number
  periodLabel: string
  /** normalized raw values (plain EGP) present for this period, keyed by canonical metric code */
  values: Record<string, number>
  /** calculated metrics for this period (computed vs its comparable previous) */
  metrics: Record<string, MetricResult>
  sharesOutstanding?: number
}

export interface EventConditionDetail {
  metric: string
  current?: number
  previous?: number
  detail: string
  ok: boolean
}

export interface DetectedEvent {
  eventType: string
  periodKey: string
  previousPeriodKey: string
  periodType: string
  fiscalYear: number
  periodLabel: string
  conditions: EventConditionDetail[]
  explanationEn: string
  explanationAr: string
}

interface PeriodPair {
  cur: PeriodData
  prev: PeriodData
}

const cond = (metric: string, cur: number | undefined, prev: number | undefined, detail: string, ok: boolean): EventConditionDetail => ({
  metric,
  current: cur,
  previous: prev,
  detail,
  ok,
})

function valueOf(p: PeriodData, code: string): number | undefined {
  return p.values[code]
}

/** Detect all events for an ordered list of periods (per company). */
export function detectEvents(periods: PeriodData[]): DetectedEvent[] {
  const events: DetectedEvent[] = []
  const sorted = [...periods].sort((a, b) => a.periodKey.localeCompare(b.periodKey))
  const byKey = new Map(sorted.map((p) => [p.periodKey, p]))

  for (const cur of sorted) {
    // chain of 3 periods for acceleration
    const prevKey = previousKeyOf(cur)
    if (!prevKey) continue
    const prev = byKey.get(prevKey)
    if (!prev) continue
    const prevPrevKey = previousKeyOf(prev)
    const prevPrev = prevPrevKey ? byKey.get(prevPrevKey) : undefined

    const pair: PeriodPair = { cur, prev }
    const pairWith3 = prevPrev ? { ...pair, prevPrev } : null

    // ---- LOSS_TO_PROFIT / PROFIT_TO_LOSS ----
    const curNp = valueOf(cur, "NET_PROFIT")
    const prevNp = valueOf(prev, "NET_PROFIT")
    if (curNp !== undefined && prevNp !== undefined) {
      if (prevNp < 0 && curNp > 0) {
        events.push({
          eventType: "LOSS_TO_PROFIT",
          ...base(pair),
          conditions: [cond("NET_PROFIT", curNp, prevNp, `Net profit moved from ${formatEgp(prevNp)} to ${formatEgp(curNp)}`, true)],
          explanationEn: `Turnaround: net profit moved from a loss of ${formatEgp(Math.abs(prevNp))} in ${prev.periodLabel} to a profit of ${formatEgp(curNp)} in ${cur.periodLabel}.`,
          explanationAr: `تحول مالي: تحول صافي الربح من خسارة قدرها ${formatEgp(Math.abs(prevNp))} في ${prev.periodLabel} إلى ربح قدره ${formatEgp(curNp)} في ${cur.periodLabel}.`,
        })
      }
      if (prevNp > 0 && curNp < 0) {
        events.push({
          eventType: "PROFIT_TO_LOSS",
          ...base(pair),
          conditions: [cond("NET_PROFIT", curNp, prevNp, `Net profit moved from ${formatEgp(prevNp)} to ${formatEgp(curNp)}`, true)],
          explanationEn: `Deterioration: net profit moved from a profit of ${formatEgp(prevNp)} in ${prev.periodLabel} to a loss of ${formatEgp(Math.abs(curNp))} in ${cur.periodLabel}.`,
          explanationAr: `تدهور مالي: تحول صافي الربح من ربح قدره ${formatEgp(prevNp)} في ${prev.periodLabel} إلى خسارة قدرها ${formatEgp(Math.abs(curNp))} في ${cur.periodLabel}.`,
        })
      }
    }

    // ---- REVENUE_GROWTH (>= 15%) ----
    const revGrowth = cur.metrics["revenue_growth"]
    if (revGrowth?.status === "OK" && revGrowth.value !== undefined && revGrowth.value >= 15) {
      const curRev = valueOf(cur, "REVENUE")
      const prevRev = valueOf(prev, "REVENUE")
      events.push({
        eventType: "REVENUE_GROWTH",
        ...base(pair),
        conditions: [cond("revenue_growth", revGrowth.value, undefined, `Revenue growth = ${formatPercent(revGrowth.value, { sign: true })} (threshold ≥ 15%)`, true)],
        explanationEn: `Revenue grew ${formatPercent(revGrowth.value, { sign: true })} year-over-year (${formatEgp(prevRev)} in ${prev.periodLabel} → ${formatEgp(curRev)} in ${cur.periodLabel}).`,
        explanationAr: `نمت الإيرادات بنسبة ${formatPercent(revGrowth.value, { sign: true })} مقارنة بالعام السابق (${formatEgp(prevRev)} في ${prev.periodLabel} → ${formatEgp(curRev)} في ${cur.periodLabel}).`,
      })
    }

    // ---- DEBT_REDUCTION (<= -5%) ----
    const debtGrowth = cur.metrics["debt_growth"]
    if (debtGrowth?.status === "OK" && debtGrowth.value !== undefined && debtGrowth.value <= -5) {
      const curD = valueOf(cur, "TOTAL_DEBT")
      const prevD = valueOf(prev, "TOTAL_DEBT")
      events.push({
        eventType: "DEBT_REDUCTION",
        ...base(pair),
        conditions: [cond("debt_growth", debtGrowth.value, undefined, `Debt growth = ${formatPercent(debtGrowth.value, { sign: true })} (threshold ≤ -5%)`, true)],
        explanationEn: `Total debt decreased by ${formatPercent(Math.abs(debtGrowth.value))} (${formatEgp(prevD)} in ${prev.periodLabel} → ${formatEgp(curD)} in ${cur.periodLabel}).`,
        explanationAr: `انخفض إجمالي الدين بنسبة ${formatPercent(Math.abs(debtGrowth.value))} (${formatEgp(prevD)} في ${prev.periodLabel} → ${formatEgp(curD)} في ${cur.periodLabel}).`,
      })
    }

    // ---- EQUITY_GROWTH (>= 10%) ----
    const eqGrowth = cur.metrics["equity_growth"]
    if (eqGrowth?.status === "OK" && eqGrowth.value !== undefined && eqGrowth.value >= 10) {
      const curE = valueOf(cur, "TOTAL_EQUITY")
      const prevE = valueOf(prev, "TOTAL_EQUITY")
      events.push({
        eventType: "EQUITY_GROWTH",
        ...base(pair),
        conditions: [cond("equity_growth", eqGrowth.value, undefined, `Equity growth = ${formatPercent(eqGrowth.value, { sign: true })} (threshold ≥ 10%)`, true)],
        explanationEn: `Shareholders' equity increased by ${formatPercent(eqGrowth.value, { sign: true })} (${formatEgp(prevE)} in ${prev.periodLabel} → ${formatEgp(curE)} in ${cur.periodLabel}).`,
        explanationAr: `زادت حقوق الملكية بنسبة ${formatPercent(eqGrowth.value, { sign: true })} (${formatEgp(prevE)} في ${prev.periodLabel} → ${formatEgp(curE)} في ${cur.periodLabel}).`,
      })
    }

    // ---- CASH_FLOW_IMPROVEMENT ----
    const curOcf = valueOf(cur, "OPERATING_CASH_FLOW")
    const prevOcf = valueOf(prev, "OPERATING_CASH_FLOW")
    if (curOcf !== undefined && prevOcf !== undefined) {
      const turnedPositive = prevOcf <= 0 && curOcf > 0
      const improved = prevOcf > 0 && curOcf > prevOcf
      if (turnedPositive || improved) {
        const detail = turnedPositive
          ? `Operating cash flow turned positive: ${formatEgp(prevOcf)} → ${formatEgp(curOcf)}`
          : `Operating cash flow improved: ${formatEgp(prevOcf)} → ${formatEgp(curOcf)} (${formatPercent(((curOcf - prevOcf) / prevOcf) * 100, { sign: true })})`
        events.push({
          eventType: "CASH_FLOW_IMPROVEMENT",
          ...base(pair),
          conditions: [cond("OPERATING_CASH_FLOW", curOcf, prevOcf, detail, true)],
          explanationEn: `${detail} between ${prev.periodLabel} and ${cur.periodLabel}.`,
          explanationAr: `تحسن التدفق النقدي التشغيلي من ${formatEgp(prevOcf)} إلى ${formatEgp(curOcf)} بين ${prev.periodLabel} و ${cur.periodLabel}.`,
        })
      }
    }

    // ---- PROFIT_ACCELERATION (3 consecutive periods, growth positive & increasing) ----
    if (pairWith3) {
      const g1 = prev.metrics["profit_growth"]
      const g2 = cur.metrics["profit_growth"]
      if (
        g1?.status === "OK" && g2?.status === "OK" &&
        g1.value !== undefined && g2.value !== undefined &&
        g1.value > 0 && g2.value > g1.value
      ) {
        const oldNp = valueOf(pairWith3.prevPrev, "NET_PROFIT")
        const midNp = valueOf(prev, "NET_PROFIT")
        const curNpV = valueOf(cur, "NET_PROFIT")
        events.push({
          eventType: "PROFIT_ACCELERATION",
          ...base(pair),
          conditions: [
            cond("profit_growth", g1.value, undefined, `Prior-year profit growth = ${formatPercent(g1.value, { sign: true })} (> 0)`, true),
            cond("profit_growth", g2.value, undefined, `Current profit growth = ${formatPercent(g2.value, { sign: true })} (accelerating)`, true),
          ],
          explanationEn: `Profit growth is accelerating: net profit ${formatEgp(oldNp)} → ${formatEgp(midNp)} (${formatPercent(g1.value, { sign: true })}) → ${formatEgp(curNpV)} (${formatPercent(g2.value, { sign: true })}).`,
          explanationAr: `تسارع نمو الأرباح: صافي الربح ${formatEgp(oldNp)} → ${formatEgp(midNp)} (${formatPercent(g1.value, { sign: true })}) → ${formatEgp(curNpV)} (${formatPercent(g2.value, { sign: true })}).`,
        })
      }
    }

    // ---- STRONG_PROFITABILITY (ROE >= 15%) ----
    const roeMetric = cur.metrics["roe"]
    if (roeMetric?.status === "OK" && roeMetric.value !== undefined && roeMetric.value >= 15) {
      events.push({
        eventType: "STRONG_PROFITABILITY",
        ...base(pair),
        conditions: [cond("roe", roeMetric.value, undefined, `ROE = ${formatPercent(roeMetric.value)} (threshold ≥ 15%)`, true)],
        explanationEn: `Return on equity is ${formatPercent(roeMetric.value)} in ${cur.periodLabel} (threshold ≥ 15%).`,
        explanationAr: `العائد على حقوق الملكية ${formatPercent(roeMetric.value)} في ${cur.periodLabel} (الحد الأدنى 15%).`,
      })
    }

    // ---- HIGH_ASSETS (>= EGP 10B) ----
    const ta = valueOf(cur, "TOTAL_ASSETS")
    if (ta !== undefined && ta >= 10e9) {
      events.push({
        eventType: "HIGH_ASSETS",
        ...base(pair),
        conditions: [cond("TOTAL_ASSETS", ta, undefined, `Total assets = ${formatEgp(ta)} (threshold ≥ EGP 10B)`, true)],
        explanationEn: `Total assets are ${formatEgp(ta)} in ${cur.periodLabel} (threshold ≥ EGP 10B).`,
        explanationAr: `إجمالي الأصول ${formatEgp(ta)} في ${cur.periodLabel} (الحد الأدنى 10 مليار جنيه).`,
      })
    }

    // ---- FINANCIAL_RECOVERY (multi-condition pattern) ----
    const hasTurnaround = events.some((e) => e.eventType === "LOSS_TO_PROFIT" && e.periodKey === cur.periodKey)
    if (hasTurnaround) {
      const rg = cur.metrics["revenue_growth"]
      const dg = cur.metrics["debt_growth"]
      const recConds: EventConditionDetail[] = []
      const c1 = cond("LOSS_TO_PROFIT", curNp, prevNp, "Loss → Profit transition", true)
      const c2 = rg?.status === "OK" && rg.value !== undefined && rg.value >= 10
        ? cond("revenue_growth", rg.value, undefined, `Revenue growth = ${formatPercent(rg.value, { sign: true })} (≥ 10%)`, true)
        : null
      const c3 = curOcf !== undefined && curOcf > 0
        ? cond("OPERATING_CASH_FLOW", curOcf, undefined, `Operating cash flow = ${formatEgp(curOcf)} (positive)`, true)
        : null
      const c4 = dg?.status === "OK" && dg.value !== undefined && dg.value <= 0
        ? cond("debt_growth", dg.value, undefined, `Debt growth = ${formatPercent(dg.value, { sign: true })} (not increasing)`, true)
        : null
      if (c2 && c3 && c4) {
        recConds.push(c1, c2, c3, c4)
        events.push({
          eventType: "FINANCIAL_RECOVERY",
          ...base(pair),
          conditions: recConds,
          explanationEn: `Financial recovery pattern detected in ${cur.periodLabel}: loss→profit transition, revenue growth ${formatPercent((rg.value as number), { sign: true })}, positive operating cash flow (${formatEgp(curOcf)}), and debt growth ${formatPercent((dg.value as number), { sign: true })}.`,
          explanationAr: `نمط تعافي مالي في ${cur.periodLabel}: تحول من خسارة إلى ربح، نمو الإيرادات ${formatPercent((rg.value as number), { sign: true })}، تدفق نقدي تشغيلي إيجابي (${formatEgp(curOcf)})، ونمو الدين ${formatPercent((dg.value as number), { sign: true })}.`,
        })
      }
    }

    // ---- FINANCIAL_DETERIORATION ----
    const hasDeterioration = events.some((e) => e.eventType === "PROFIT_TO_LOSS" && e.periodKey === cur.periodKey)
    if (hasDeterioration) {
      const rg = cur.metrics["revenue_growth"]
      const revDecline = rg?.status === "OK" && rg.value !== undefined && rg.value < 0
      const ocfNegative = curOcf !== undefined && curOcf < 0
      if (revDecline || ocfNegative) {
        const detConds: EventConditionDetail[] = [
          cond("NET_PROFIT", curNp, prevNp, "Profit → Loss transition", true),
        ]
        if (revDecline) detConds.push(cond("revenue_growth", rg!.value, undefined, `Revenue declined ${formatPercent(rg!.value, { sign: true })}`, true))
        if (ocfNegative) detConds.push(cond("OPERATING_CASH_FLOW", curOcf, undefined, `Operating cash flow is negative (${formatEgp(curOcf)})`, true))
        events.push({
          eventType: "FINANCIAL_DETERIORATION",
          ...base(pair),
          conditions: detConds,
          explanationEn: `Financial deterioration pattern detected in ${cur.periodLabel}: profit turned into a loss${revDecline ? `, revenue declined ${formatPercent(rg!.value)}` : ""}${revDecline && ocfNegative ? " and" : ocfNegative ? " with" : ""}${ocfNegative ? ` operating cash flow is negative (${formatEgp(curOcf)})` : ""}.`,
          explanationAr: `نمط تدهور مالي في ${cur.periodLabel}: تحول الربح إلى خسارة${revDecline ? ` مع انخفاض الإيرادات ${formatPercent(rg!.value)}` : ""}${ocfNegative ? ` وتدفق نقدي تشغيلي سالب (${formatEgp(curOcf)})` : ""}.`,
        })
      }
    }
  }

  return events
}

function base(pair: PeriodPair) {
  return {
    periodKey: pair.cur.periodKey,
    previousPeriodKey: pair.prev.periodKey,
    periodType: pair.cur.periodType,
    fiscalYear: pair.cur.fiscalYear,
    periodLabel: pair.cur.periodLabel,
  }
}

function previousKeyOf(p: PeriodData): string | null {
  // uses the canonical previous comparable key convention
  const [type, yearStr, sub] = p.periodKey.split(":")
  const year = Number(yearStr)
  if (!["ANNUAL", "QUARTERLY", "SEMIANNUAL", "NINE_MONTH"].includes(type)) return null
  if (year <= 1900) return null
  return `${type}:${year - 1}:${sub ?? ""}`
}
