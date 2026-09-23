// Recompute service (server-only): recalculates derived metrics + detects events
// for a company from validated source values. Calculated values are always stored
// separately from raw values, with formula version + source periods for auditability.
//
// STATEMENT-TYPE SEPARATION (critical):
//   Consolidated and standalone filings of the same period are NEVER mixed in one
//   calculation bucket. Every bucket key is `${statementType}|${periodKey}` and every
//   CalculatedMetric row carries its statementType (unique is
//   [companyId, code, periodKey, statementType]). UNKNOWN statementType on a report is
//   treated as CONSOLIDATED (documented default — most EGX filings are consolidated).
//   TTM windows are built per statement type from that type's own quarters.
//   Events are detected ONLY from the preferred statement type (CONSOLIDATED when any
//   consolidated filing buckets exist, else STANDALONE) — this avoids FinancialEvent
//   unique-key collisions across statement types and prevents mixing.
//
// TTM (trailing twelve months): synthetic periods built from four consecutive
// quarterly reports. Flow metrics (income / cash flow) are SUMS of the four
// quarters; balance-sheet metrics are the END-quarter values. A TTM period is
// only built when all four quarters exist — missing quarters are never treated
// as zero. TTM growth compares TTM ending Q(n) year Y against TTM ending Q(n)
// year Y-1. Events are NOT detected on TTM periods (they stay on filing periods).

import { db } from "@/lib/db"
import type { CalculatedMetric } from "@prisma/client"
import {
  bookValuePerShare, currentRatio, debtToEquity, dividendYield, eps, growth, margin, marketCap,
  priceToBook, priceToEarnings, ratio, roa, roe, type MetricResult,
} from "./calc"
import { detectEvents, EVENTS_RULE_VERSION, type PeriodData } from "./events"
import { reportPeriodKey, previousComparableKey, parsePeriodKey, periodKeyLabel, periodKey, quarterSequenceIndex } from "./periods"
import { getLatestPrice, sumDps12m } from "./market"

export interface RecomputeResult {
  companyId: string
  periods: string[]
  calculatedMetrics: number
  events: string[]
  statementTypes: string[]
  preferredStatementType: "CONSOLIDATED" | "STANDALONE" | "NONE"
}

/** Which report processing statuses contain trustworthy (approved/validated) values */
const TRUSTED_STATUSES = ["VALIDATED", "APPROVED", "EXTRACTED"]

/** Raw metrics that are flows for TTM purposes — summed across the four quarters */
const TTM_FLOW_CODES = new Set([
  "REVENUE", "COGS", "GROSS_PROFIT", "OPERATING_INCOME", "NET_INTEREST_INCOME",
  "NET_PROFIT", "EPS", "OPERATING_CASH_FLOW", "INVESTING_CASH_FLOW", "FINANCING_CASH_FLOW",
  "PROFIT_BEFORE_TAX", "INCOME_TAX", "FINANCE_COST", "NET_PROFIT_PARENT",
  "NET_CHANGE_IN_CASH", "DIVIDEND_PER_SHARE",
])

/** Raw metrics that are point-in-time (balance sheet) — taken from the end quarter */
const TTM_POINT_CODES = new Set([
  "TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY", "TOTAL_DEBT", "DEPOSITS", "LOANS_NET",
  "CASH_AND_EQUIVALENTS", "CURRENT_ASSETS", "NON_CURRENT_ASSETS", "CURRENT_LIABILITIES",
  "NON_CURRENT_LIABILITIES", "ACCOUNTS_RECEIVABLE", "INVENTORY", "INVESTMENTS",
  "SHORT_TERM_DEBT", "LONG_TERM_DEBT", "RETAINED_EARNINGS", "EQUITY_PARENT",
  "NON_CONTROLLING_INTERESTS", "TOTAL_EQUITY_AND_LIABILITIES", "SHARES_OUTSTANDING",
  "BOOK_VALUE_PER_SHARE",
])

/**
 * Normalize a report statementType to a calculation-bucket statement type.
 * UNKNOWN (and anything unexpected) resolves to CONSOLIDATED — the dominant filing
 * form on the EGX — so that unknown-typed reports still participate in calculations
 * instead of being silently dropped. Documented default, never mixed with STANDALONE.
 */
function bucketStatementType(statementType: string): "CONSOLIDATED" | "STANDALONE" {
  return statementType === "STANDALONE" ? "STANDALONE" : "CONSOLIDATED"
}

interface PeriodBucket {
  /** "CONSOLIDATED" | "STANDALONE" — part of the bucket identity, never mixed */
  statementType: "CONSOLIDATED" | "STANDALONE"
  periodKey: string
  periodType: string
  fiscalYear: number
  periodLabel: string
  values: Record<string, number>
  periodStart?: Date
  periodEnd?: Date
  sourcePeriodKeys: string[]
  /** highest report version that contributed values (restatements overwrite older data) */
  version: number
}

/** Build TTM buckets from consecutive quarterly buckets (sum flows, point balance sheet). */
function buildTtmBuckets(quarterly: PeriodBucket[]): PeriodBucket[] {
  const sorted = [...quarterly].sort((a, b) => {
    const ia = quarterSequenceIndex(parsePeriodKey(a.periodKey).fiscalYear, parsePeriodKey(a.periodKey).sub)
    const ib = quarterSequenceIndex(parsePeriodKey(b.periodKey).fiscalYear, parsePeriodKey(b.periodKey).sub)
    return (ia ?? 0) - (ib ?? 0)
  })

  const out: PeriodBucket[] = []
  for (let i = 3; i < sorted.length; i++) {
    const window = sorted.slice(i - 3, i + 1)
    const idxs = window.map((b) => {
      const p = parsePeriodKey(b.periodKey)
      return quarterSequenceIndex(p.fiscalYear, p.sub)
    })
    // require strictly consecutive quarters — a gap means no TTM window
    if (idxs.some((v) => v === null)) continue
    let consecutive = true
    for (let k = 1; k < idxs.length; k++) {
      if ((idxs[k] as number) - (idxs[k - 1] as number) !== 1) consecutive = false
    }
    if (!consecutive) continue

    const end = window[3]
    const values: Record<string, number> = {}
    const codes = new Set<string>()
    for (const b of window) for (const code of Object.keys(b.values)) codes.add(code)
    for (const code of codes) {
      if (TTM_FLOW_CODES.has(code)) {
        // sum only when the metric exists in ALL four quarters (never zero-fill)
        if (window.every((b) => b.values[code] !== undefined)) {
          values[code] = window.reduce((acc, b) => acc + b.values[code], 0)
        }
      } else if (TTM_POINT_CODES.has(code)) {
        const v = end.values[code]
        if (v !== undefined) values[code] = v
      }
      // other codes are ignored for TTM windows
    }

    out.push({
      statementType: end.statementType,
      periodKey: periodKey("TTM", end.fiscalYear, parsePeriodKey(end.periodKey).sub),
      periodType: "TTM",
      fiscalYear: end.fiscalYear,
      periodLabel: `TTM ending ${parsePeriodKey(end.periodKey).sub} ${end.fiscalYear}`,
      values,
      periodStart: window[0].periodStart,
      periodEnd: end.periodEnd,
      sourcePeriodKeys: window.map((b) => b.periodKey),
      version: Math.max(...window.map((b) => b.version)),
    })
  }
  return out
}

export async function recomputeCompany(companyId: string): Promise<RecomputeResult> {
  const company = await db.company.findUnique({ where: { id: companyId } })
  if (!company) throw new Error(`Company ${companyId} not found`)

  const reports = await db.financialReport.findMany({
    where: { companyId, processingStatus: { in: TRUSTED_STATUSES } },
    include: { values: true },
    // version ascending so a newer restatement overwrites the same bucket
    orderBy: [{ fiscalYear: "asc" }, { periodLabel: "asc" }, { version: "asc" }],
  })

  // Build period map: `${statementType}|${periodKey}` -> bucket (statement types never mix)
  const buckets = new Map<string, PeriodBucket>()
  for (const report of reports) {
    const statementType = bucketStatementType(report.statementType)
    const key = reportPeriodKey(report)
    const bucketKey = `${statementType}|${key}`
    let bucket = buckets.get(bucketKey)
    if (!bucket) {
      buckets.set(bucketKey, {
        statementType,
        periodKey: key,
        periodType: report.periodType,
        fiscalYear: report.fiscalYear,
        periodLabel: report.periodLabel,
        values: {},
        periodStart: report.periodStart ?? undefined,
        periodEnd: report.periodEnd,
        sourcePeriodKeys: [key],
        version: report.version,
      })
      bucket = buckets.get(bucketKey)!
    } else if (report.version > bucket.version) {
      // a higher-version restatement of the same (statementType, period) replaces values
      bucket.periodType = report.periodType
      bucket.fiscalYear = report.fiscalYear
      bucket.periodLabel = report.periodLabel
      bucket.periodStart = report.periodStart ?? undefined
      bucket.periodEnd = report.periodEnd
      bucket.values = {}
      bucket.version = report.version
    }
    for (const v of report.values) {
      if (v.validationStatus === "VALID" || v.validationStatus === "PENDING") {
        bucket.values[v.metricCode] = v.normalizedValue
      }
    }
  }

  const ordered = [...buckets.values()].sort((a, b) =>
    (a.statementType + "|" + a.periodKey).localeCompare(b.statementType + "|" + b.periodKey)
  )

  // Synthetic TTM windows from consecutive quarters — built PER statement type
  const ttmBuckets: PeriodBucket[] = []
  const byStatement = new Map<string, PeriodBucket[]>()
  for (const b of ordered) {
    const list = byStatement.get(b.statementType) ?? []
    list.push(b)
    byStatement.set(b.statementType, list)
  }
  for (const [, quarterlyBuckets] of byStatement) {
    ttmBuckets.push(...buildTtmBuckets(quarterlyBuckets.filter((b) => b.periodType === "QUARTERLY")))
  }
  const allBuckets = [...ordered, ...ttmBuckets]
  // byKey includes TTM buckets so a TTM window can find the prior-year window for growth
  // (keyed by statementType|periodKey — same periodKey of different statement types never collide)
  const byKey = new Map(allBuckets.map((b) => [`${b.statementType}|${b.periodKey}`, b]))

  // Market data (observed price points — never fabricated)
  const latestPrice = await getLatestPrice(companyId)
  const priceValue = latestPrice?.price
  const companyShares = company.sharesOutstanding ?? undefined
  const dpsInfo = latestPrice ? await sumDps12m(companyId, latestPrice.asOf) : { hasRecords: false }

  // Compute calculated metrics for every period (incl. TTM) that has a comparable previous
  const calcRows: {
    companyId: string; code: string; periodKey: string; periodType: string; fiscalYear: number
    periodLabel: string; value: number | null; valueStatus: string; statusDetail: string | null
    formulaVersion: string; sourcePeriods: string; statementType: string
  }[] = []

  const eventPeriods: PeriodData[] = []

  // Events come ONLY from the preferred statement type: CONSOLIDATED when any consolidated
  // filing bucket exists, else STANDALONE (else nothing). Prevents FinancialEvent unique-key
  // collisions across statement types and never mixes consolidated + standalone figures.
  const hasConsolidatedFilings = ordered.some((b) => b.statementType === "CONSOLIDATED")
  const preferredStatementType: "CONSOLIDATED" | "STANDALONE" | "NONE" = hasConsolidatedFilings
    ? "CONSOLIDATED"
    : ordered.some((b) => b.statementType === "STANDALONE")
      ? "STANDALONE"
      : "NONE"

  for (const bucket of allBuckets) {
    const isTtm = bucket.periodType === "TTM"
    const prevKey = previousComparableKey(bucket.periodKey)
    const prev = prevKey ? byKey.get(`${bucket.statementType}|${prevKey}`) : undefined
    const cur = bucket.values
    const prevValues = prev?.values ?? {}
    const metrics: Record<string, MetricResult> = {}

    // Per-period share count (a COUNT, never unit-scaled) preferred over the
    // company-level sharesOutstanding when the filing reports its own figure
    const periodShares = cur["SHARES_OUTSTANDING"] ?? companyShares

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
        statementType: bucket.statementType,
      })
    }

    // Growth metrics (same-period basis only; TTM compares same trailing window)
    const growthSources = prev ? [bucket.periodKey, prevKey!] : [bucket.periodKey]
    push("revenue_growth", growth(cur["REVENUE"], prevValues["REVENUE"]), growthSources, "revenue_growth@1")
    push("profit_growth", growth(cur["NET_PROFIT"], prevValues["NET_PROFIT"], {
      signTransitionDetail: "Previous net profit is negative (loss). Percentage growth is not meaningful — see LOSS_TO_PROFIT / PROFIT_TO_LOSS events instead",
    }), growthSources, "profit_growth@1")
    push("debt_growth", growth(cur["TOTAL_DEBT"], prevValues["TOTAL_DEBT"]), growthSources, "debt_growth@1")
    push("equity_growth", growth(cur["TOTAL_EQUITY"], prevValues["TOTAL_EQUITY"]), growthSources, "equity_growth@1")
    push("ocf_growth", growth(cur["OPERATING_CASH_FLOW"], prevValues["OPERATING_CASH_FLOW"], {
      signTransitionDetail: "Previous operating cash flow is negative — percentage growth is not meaningful; compare absolute values or see cash-flow events",
    }), growthSources, "ocf_growth@1")
    push("eps_growth", growth(cur["EPS"], prevValues["EPS"]), growthSources, "eps_growth@1")
    push("asset_growth", growth(cur["TOTAL_ASSETS"], prevValues["TOTAL_ASSETS"]), growthSources, "asset_growth@1")

    // Margins
    push("gross_margin", margin(cur["GROSS_PROFIT"], cur["REVENUE"]), [bucket.periodKey], "gross_margin@1")
    push("operating_margin", margin(cur["OPERATING_INCOME"], cur["REVENUE"]), [bucket.periodKey], "operating_margin@1")
    push("net_margin", margin(cur["NET_PROFIT"], cur["REVENUE"]), [bucket.periodKey], "net_margin@1")

    // Ratios
    push("roe", roe(cur["NET_PROFIT"], cur["TOTAL_EQUITY"]), [bucket.periodKey], "roe@1")
    push("roa", roa(cur["NET_PROFIT"], cur["TOTAL_ASSETS"]), [bucket.periodKey], "roa@1")
    push("debt_to_equity", debtToEquity(cur["TOTAL_DEBT"], cur["TOTAL_EQUITY"]), [bucket.periodKey], "debt_to_equity@1")
    push("current_ratio", currentRatio(cur["CURRENT_ASSETS"], cur["CURRENT_LIABILITIES"]), [bucket.periodKey], "current_ratio@1")
    push("eps", eps(cur["NET_PROFIT"], periodShares), [bucket.periodKey], "eps@1")
    push("book_value_per_share", bookValuePerShare(cur["TOTAL_EQUITY"], periodShares), [bucket.periodKey], "book_value_per_share@1")

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

    // Market metrics — computed from the latest observed price point (p_b@2 …).
    // No price => DATA_UNAVAILABLE; negative earnings/book => NOT_APPLICABLE with reason.
    push("p_b", priceToBook(priceValue, periodShares, cur["TOTAL_EQUITY"]), [bucket.periodKey], "p_b@2")
    push("p_e", priceToEarnings(priceValue, periodShares, cur["NET_PROFIT"]), [bucket.periodKey], "p_e@2")
    push("market_cap", marketCap(priceValue, periodShares), [bucket.periodKey], "market_cap@2")
    push("dividend_yield", dividendYield(priceValue, dpsInfo.dps12m, dpsInfo.hasRecords), [bucket.periodKey], "dividend_yield@2")

    // Events are detected on filing periods only (not synthetic TTM windows) and only
    // for the preferred statement type
    if (!isTtm && bucket.statementType === preferredStatementType) {
      eventPeriods.push({
        periodKey: bucket.periodKey,
        periodType: bucket.periodType,
        fiscalYear: bucket.fiscalYear,
        periodLabel: bucket.periodLabel,
        values: bucket.values,
        metrics,
        sharesOutstanding: periodShares,
      })
    }
  }

  // Detect events
  const detected = preferredStatementType === "NONE" ? [] : detectEvents(eventPeriods)

  // Persist atomically-ish (delete + recreate for this company, both statement types)
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
          ruleVersion: EVENTS_RULE_VERSION,
        })),
      })
    }
  })

  const statementTypesUsed = [...new Set(allBuckets.map((b) => b.statementType))].sort()

  await db.auditLog.create({
    data: {
      actor: "system",
      action: "CALCULATE",
      entityType: "Company",
      entityId: companyId,
      details: `Recomputed ${calcRows.length} calculated metrics across ${allBuckets.length} period buckets (statement types: ${statementTypesUsed.join(", ") || "none"}; ${ttmBuckets.length} TTM; preferred for events: ${preferredStatementType}); detected ${detected.length} events (${detected.map((e) => e.eventType).join(", ") || "none"})`,
    },
  })

  return {
    companyId,
    periods: [...new Set(allBuckets.map((b) => b.periodKey))],
    calculatedMetrics: calcRows.length,
    events: detected.map((e) => `${e.eventType}@${e.periodKey}`),
    statementTypes: statementTypesUsed,
    preferredStatementType,
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

/**
 * Latest period keys (annual + quarterly + TTM) for a company from stored calculated metrics.
 * Statement-type aware: when duplicates exist for the same period across CONSOLIDATED and
 * STANDALONE rows, the CONSOLIDATED rows win (unless an explicit statementType is requested).
 */
export async function latestPeriodKeys(
  companyId: string,
  opts?: { statementType?: "CONSOLIDATED" | "STANDALONE" }
): Promise<{ annual?: string; quarterly?: string; ttm?: string }> {
  const metrics = await db.calculatedMetric.findMany({
    where: { companyId, code: "revenue" },
    select: { periodKey: true, periodType: true, fiscalYear: true, statementType: true },
  })
  let rows = metrics
  if (opts?.statementType) {
    rows = metrics.filter((m) => m.statementType === opts.statementType)
  } else {
    // auto-preference: CONSOLIDATED when present, else STANDALONE
    const hasConsolidated = metrics.some((m) => m.statementType === "CONSOLIDATED")
    rows = metrics.filter((m) => (hasConsolidated ? m.statementType === "CONSOLIDATED" : m.statementType === "STANDALONE"))
  }
  let annual: string | undefined
  let quarterly: string | undefined
  let ttm: string | undefined
  for (const m of rows) {
    if (m.periodType === "ANNUAL" && (!annual || m.fiscalYear > parsePeriodKey(annual).fiscalYear)) annual = m.periodKey
    if (m.periodType === "QUARTERLY" && (!quarterly || m.fiscalYear > parsePeriodKey(quarterly).fiscalYear)) quarterly = m.periodKey
    if (m.periodType === "TTM" && (!ttm || m.fiscalYear > parsePeriodKey(ttm).fiscalYear)) ttm = m.periodKey
  }
  return { annual, quarterly, ttm }
}

/**
 * Read-path helper: return a company's calculated metrics for ONE statement type.
 * Reads rows for BOTH statement types and returns the preferred set — CONSOLIDATED
 * when the company has any CONSOLIDATED rows, else STANDALONE. An explicit
 * opts.statementType filters strictly to that type (rows carry statementType so
 * consumers can always verify what they got). Used by read-path APIs and the scanner.
 */
export async function getCompanyCalcMetrics(
  companyId: string,
  opts?: { statementType?: "CONSOLIDATED" | "STANDALONE" }
): Promise<CalculatedMetric[]> {
  const rows = await db.calculatedMetric.findMany({
    where: { companyId },
    orderBy: [{ periodType: "asc" }, { fiscalYear: "asc" }, { periodKey: "asc" }, { code: "asc" }],
  })
  if (opts?.statementType) {
    return rows.filter((r) => r.statementType === opts.statementType)
  }
  const hasConsolidated = rows.some((r) => r.statementType === "CONSOLIDATED")
  const preferred = hasConsolidated ? "CONSOLIDATED" : "STANDALONE"
  return rows.filter((r) => r.statementType === preferred)
}

export { periodKeyLabel, bucketStatementType }
