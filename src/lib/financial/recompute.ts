// Recompute service (server-only): recalculates derived metrics + detects events
// for a company from validated source values. Calculated values are always stored
// separately from raw values, with formula version + source periods for auditability.

import { db } from "@/lib/db"
import {
  debtToEquity, eps, growth, margin, marketDependentUnavailable,
  ratio, roa, roe, type MetricResult,
} from "./calc"
import { detectEvents, type PeriodData } from "./events"
import { reportPeriodKey, previousComparableKey, parsePeriodKey, periodKeyLabel } from "./periods"

export interface RecomputeResult {
  companyId: string
  periods: string[]
  calculatedMetrics: number
  events: string[]
}

/** Which report processing statuses contain trustworthy (approved/validated) values */
const TRUSTED_STATUSES = ["VALIDATED", "APPROVED", "EXTRACTED"]

export async function recomputeCompany(companyId: string): Promise<RecomputeResult> {
  const company = await db.company.findUnique({ where: { id: companyId } })
  if (!company) throw new Error(`Company ${companyId} not found`)

  const reports = await db.financialReport.findMany({
    where: { companyId, processingStatus: { in: TRUSTED_STATUSES } },
    include: { values: true },
    orderBy: [{ fiscalYear: "asc" }, { periodLabel: "asc" }],
  })

  // Build period map: periodKey -> { report, values }
  interface PeriodBucket {
    periodKey: string
    periodType: string
    fiscalYear: number
    periodLabel: string
    values: Record<string, number>
    periodStart?: Date
    periodEnd?: Date
  }
  const buckets = new Map<string, PeriodBucket>()
  for (const report of reports) {
    const key = reportPeriodKey(report)
    if (!buckets.has(key)) {
      buckets.set(key, {
        periodKey: key,
        periodType: report.periodType,
        fiscalYear: report.fiscalYear,
        periodLabel: report.periodLabel,
        values: {},
      })
    }
    const bucket = buckets.get(key)!
    for (const v of report.values) {
      if (v.validationStatus === "VALID" || v.validationStatus === "PENDING") {
        bucket.values[v.metricCode] = v.normalizedValue
      }
    }
  }

  const ordered = [...buckets.values()].sort((a, b) => a.periodKey.localeCompare(b.periodKey))
  const byKey = new Map(ordered.map((b) => [b.periodKey, b]))

  // Compute calculated metrics for every period that has a comparable previous
  const calcRows: {
    companyId: string; code: string; periodKey: string; periodType: string; fiscalYear: number
    periodLabel: string; value: number | null; valueStatus: string; statusDetail: string | null
    formulaVersion: string; sourcePeriods: string
  }[] = []

  const eventPeriods: PeriodData[] = []

  for (const bucket of ordered) {
    const prevKey = previousComparableKey(bucket.periodKey)
    const prev = prevKey ? byKey.get(prevKey) : undefined
    const cur = bucket.values
    const prevValues = prev?.values ?? {}
    const metrics: Record<string, MetricResult> = {}

    const push = (code: string, result: MetricResult, sources: string[], formulaVersion: string) => {
      metrics[code] = result
      calcRows.push({
        companyId,
        code,
        periodKey: bucket.periodKey,
        periodType: bucket.periodType,
        fiscalYear: bucket.fiscalYear,
        periodLabel: bucket.periodLabel,
        value: result.status === "OK" ? result.value ?? null : null,
        valueStatus: result.status,
        statusDetail: result.detail ?? null,
        formulaVersion,
        sourcePeriods: JSON.stringify(sources),
      })
    }

    // Growth metrics (same-period basis only)
    push("revenue_growth", growth(cur["REVENUE"], prevValues["REVENUE"]), prev ? [bucket.periodKey, prevKey!] : [bucket.periodKey], "revenue_growth@1")
    push("profit_growth", growth(cur["NET_PROFIT"], prevValues["NET_PROFIT"], {
      signTransitionDetail: "Previous net profit is negative (loss). Percentage growth is not meaningful — see LOSS_TO_PROFIT / PROFIT_TO_LOSS events instead",
    }), prev ? [bucket.periodKey, prevKey!] : [bucket.periodKey], "profit_growth@1")
    push("debt_growth", growth(cur["TOTAL_DEBT"], prevValues["TOTAL_DEBT"]), prev ? [bucket.periodKey, prevKey!] : [bucket.periodKey], "debt_growth@1")
    push("equity_growth", growth(cur["TOTAL_EQUITY"], prevValues["TOTAL_EQUITY"]), prev ? [bucket.periodKey, prevKey!] : [bucket.periodKey], "equity_growth@1")
    push("ocf_growth", growth(cur["OPERATING_CASH_FLOW"], prevValues["OPERATING_CASH_FLOW"], {
      signTransitionDetail: "Previous operating cash flow is negative — percentage growth is not meaningful; compare absolute values or see cash-flow events",
    }), prev ? [bucket.periodKey, prevKey!] : [bucket.periodKey], "ocf_growth@1")

    // Margins
    push("gross_margin", margin(cur["GROSS_PROFIT"], cur["REVENUE"]), [bucket.periodKey], "gross_margin@1")
    push("operating_margin", margin(cur["OPERATING_INCOME"], cur["REVENUE"]), [bucket.periodKey], "operating_margin@1")
    push("net_margin", margin(cur["NET_PROFIT"], cur["REVENUE"]), [bucket.periodKey], "net_margin@1")

    // Ratios
    push("roe", roe(cur["NET_PROFIT"], cur["TOTAL_EQUITY"]), [bucket.periodKey], "roe@1")
    push("roa", roa(cur["NET_PROFIT"], cur["TOTAL_ASSETS"]), [bucket.periodKey], "roa@1")
    push("debt_to_equity", debtToEquity(cur["TOTAL_DEBT"], cur["TOTAL_EQUITY"]), [bucket.periodKey], "debt_to_equity@1")
    push("eps", eps(cur["NET_PROFIT"], company.sharesOutstanding ?? undefined), [bucket.periodKey], "eps@1")

    // Passthroughs (so scanners can threshold absolute values)
    const passthrough = (code: string, rawCode: string, fv: string) => {
      const v = cur[rawCode]
      push(code, v !== undefined ? { status: "OK", value: v } : { status: "DATA_UNAVAILABLE", detail: `${rawCode} not available for this period` }, [bucket.periodKey], fv)
    }
    passthrough("revenue", "REVENUE", "revenue@1")
    passthrough("net_profit", "NET_PROFIT", "net_profit@1")
    passthrough("operating_cash_flow", "OPERATING_CASH_FLOW", "operating_cash_flow@1")
    passthrough("total_assets", "TOTAL_ASSETS", "total_assets@1")
    passthrough("total_equity", "TOTAL_EQUITY", "total_equity@1")
    passthrough("total_debt", "TOTAL_DEBT", "total_debt@1")

    // Market-dependent metrics — never fabricated
    push("p_b", marketDependentUnavailable("P/B", "requires market price and book value per share"), [bucket.periodKey], "p_b@1")
    push("p_e", marketDependentUnavailable("P/E", "requires market price and EPS"), [bucket.periodKey], "p_e@1")
    push("market_cap", marketDependentUnavailable("Market capitalization", "requires market price and shares outstanding"), [bucket.periodKey], "market_cap@1")
    push("dividend_yield", marketDependentUnavailable("Dividend yield", "requires market price"), [bucket.periodKey], "dividend_yield@1")

    eventPeriods.push({
      periodKey: bucket.periodKey,
      periodType: bucket.periodType,
      fiscalYear: bucket.fiscalYear,
      periodLabel: bucket.periodLabel,
      values: bucket.values,
      metrics,
      sharesOutstanding: company.sharesOutstanding ?? undefined,
    })
  }

  // Detect events
  const detected = detectEvents(eventPeriods)

  // Persist atomically-ish (delete + recreate for this company)
  await db.$transaction(async (tx) => {
    await tx.calculatedMetric.deleteMany({ where: { companyId } })
    await tx.financialEvent.deleteMany({ where: { companyId } })
    if (calcRows.length) {
      await tx.calculatedMetric.createMany({ data: calcRows })
    }
    if (detected.length) {
      await tx.financialEvent.createMany({
        data: detected.map((e) => ({
          companyId,
          eventType: e.eventType,
          periodType: e.periodType,
          fiscalYear: e.fiscalYear,
          periodLabel: e.periodLabel,
          currentPeriodKey: e.periodKey,
          previousPeriodKey: e.previousPeriodKey,
          conditions: JSON.stringify(e.conditions),
          explanationEn: e.explanationEn,
          explanationAr: e.explanationAr,
          ruleVersion: "events@1",
        })),
      })
    }
  })

  await db.auditLog.create({
    data: {
      actor: "system",
      action: "CALCULATE",
      entityType: "Company",
      entityId: companyId,
      details: `Recomputed ${calcRows.length} calculated metrics across ${ordered.length} periods; detected ${detected.length} events (${detected.map((e) => e.eventType).join(", ") || "none"})`,
    },
  })

  return {
    companyId,
    periods: ordered.map((b) => b.periodKey),
    calculatedMetrics: calcRows.length,
    events: detected.map((e) => `${e.eventType}@${e.periodKey}`),
  }
}

/** Recompute every active company (used by seed + admin actions) */
export async function recomputeAll(): Promise<RecomputeResult[]> {
  const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true } })
  const results: RecomputeResult[] = []
  for (const c of companies) {
    results.push(await recomputeCompany(c.id))
  }
  return results
}

/** Latest period keys (annual + quarterly) for a company from stored calculated metrics */
export async function latestPeriodKeys(companyId: string): Promise<{ annual?: string; quarterly?: string }> {
  const metrics = await db.calculatedMetric.findMany({
    where: { companyId, code: "revenue" },
    select: { periodKey: true, periodType: true, fiscalYear: true },
  })
  let annual: string | undefined
  let quarterly: string | undefined
  for (const m of metrics) {
    if (m.periodType === "ANNUAL" && (!annual || m.fiscalYear > parsePeriodKey(annual).fiscalYear)) annual = m.periodKey
    if (m.periodType === "QUARTERLY" && (!quarterly || m.fiscalYear > parsePeriodKey(quarterly).fiscalYear)) quarterly = m.periodKey
  }
  return { annual, quarterly }
}

export { periodKeyLabel }
