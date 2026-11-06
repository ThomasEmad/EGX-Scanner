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
// as zero. Events are NOT detected on TTM periods (they stay on filing periods).

import { db } from "@/lib/db"
import type { CalculatedMetric } from "@prisma/client"
import {
  bookValuePerShare, debtToEquity, dividendYield, eps, margin, marketCap,
  priceToBook, priceToEarnings, ratio, roa, roe, type MetricResult,
} from "./calc"
import { detectEvents, EVENTS_RULE_VERSION, type PeriodData } from "./events"
import { reportPeriodKey, parsePeriodKey, periodKeyLabel, periodKey, quarterSequenceIndex } from "./periods"
import { getLatestPrice, sumDps12m } from "./market"
import { nonAuthoritativeReason } from "./integrity-policy"

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
  "SHORT_TERM_DEBT", "LONG_TERM_DEBT", "INVENTORY", "EBITDA", "NON_CURRENT_ASSETS",
  "RETAINED_EARNINGS", "INVESTING_CASH_FLOW", "FINANCING_CASH_FLOW",
  "CASH_AND_EQUIVALENTS", "CURRENT_ASSETS", "NON_CURRENT_ASSETS", "CURRENT_LIABILITIES",
  "NON_CURRENT_LIABILITIES", "ACCOUNTS_RECEIVABLE", "INVENTORY", "INVESTMENTS",
  "SHORT_TERM_DEBT", "LONG_TERM_DEBT", "RETAINED_EARNINGS", "EQUITY_PARENT",
  "NON_CONTROLLING_INTERESTS", "TOTAL_EQUITY_AND_LIABILITIES", "SHARES_OUTSTANDING",
  "BOOK_VALUE_PER_SHARE",
])

/**
 * Headline net income for a bucket: NET_PROFIT (total, including minority
 * interests) when present, otherwise NET_PROFIT_PARENT (attributable).
 * Some issuers only carry trustworthy attributable figures (e.g. CCAP, whose
 * Yahoo-sourced total-NI rows were quarantined as garbage while
 * NET_PROFIT_PARENT matches AskBorsa ground truth exactly) — the fallback
 * keeps roe / eps / p_e / margins computable instead of degrading to
 * DATA_UNAVAILABLE. Never mixes the two within one period.
 */
const niOf = (vals: Record<string, number | undefined>): number | undefined =>
  vals["NET_PROFIT"] ?? vals["NET_PROFIT_PARENT"]

/**
 * Net income attributable to the parent, for shareholder-return ratios.
 *
 * ROE/ROA answer "what did shareholders earn on their equity/assets?". Using
 * total net income that includes minority interests overstates that return:
 * MCQE FY2025 has 2.558bn total but 2.033bn attributable (1.004bn NCI), so total
 * NI gives 55.9% ROE instead of 44.4%; UNIT FY2024 is 130m total vs 91.3m
 * attributable (16.4% vs 11.5%). Prefer the attributable line, fall back to
 * total only when no attributable figure exists.
 */
const niParentOf = (vals: Record<string, number | undefined>): number | undefined =>
  vals["NET_PROFIT_PARENT"] ?? vals["NET_PROFIT"]

/**
 * Normalize a report statementType to a calculation-bucket statement type.
 * UNKNOWN (and anything unexpected) resolves to CONSOLIDATED — the dominant filing
 * form on the EGX — so that unknown-typed reports still participate in calculations
 * instead of being silently dropped. Documented default, never mixed with STANDALONE.
 */
function bucketStatementType(statementType: string): "CONSOLIDATED" | "STANDALONE" {
  return statementType === "STANDALONE" ? "STANDALONE" : "CONSOLIDATED"
}

/** Sub-period token carried by the report itself (Q1..Q4 / H1 / 9M). */
function subOf(r: { periodType: string; periodLabel: string }): string | null {
  const l = r.periodLabel.toUpperCase()
  if (r.periodType === "QUARTERLY") { const m = l.match(/Q([1-4])/); return m ? `Q${m[1]}` : null }
  if (r.periodType === "SEMIANNUAL") { const m = l.match(/H([1-2])/); return m ? `H${m[1]}` : null }
  if (r.periodType === "NINE_MONTH") return "9M"
  return null
}

interface SourceValue {
  metricCode: string
  normalizedValue: number
  subPeriod: string | null
  validationStatus: string
  validationNotes: string | null
  originalLabel: string | null
}

/**
 * The values that truly belong to THIS report's own period.
 *
 * A harvested report often stores two columns per metric: CURRENT (the period
 * being reported) and PREVIOUS/Q1…Q4 (the comparative column). The old
 * recompute loop simply overwrote by iteration order, so a comparative column
 * could win and poison TTM sums / ROE. Rule (same as the audit engine):
 * CURRENT wins; otherwise the sub-period matching the report type; a single
 * unambiguous value is accepted; anything else is ambiguous and skipped.
 *
 * Quarantined values (NEEDS_REVIEW / FAILED), carried-forward copies and zero
 * placeholders are excluded here too — calculations must never certify data
 * users cannot see.
 */
function ownValues(r: { periodType: string; periodLabel: string; values: SourceValue[] }): SourceValue[] {
  const byMetric = new Map<string, SourceValue[]>()
  for (const v of r.values) {
    if (!byMetric.has(v.metricCode)) byMetric.set(v.metricCode, [])
    byMetric.get(v.metricCode)!.push(v)
  }
  const expected = subOf(r)
  const out: SourceValue[] = []
  for (const list of byMetric.values()) {
    const current = list.find(v => v.subPeriod === "CURRENT")
    let chosen: SourceValue | undefined
    if (current) chosen = current
    else {
      const matching = expected ? list.find(v => v.subPeriod === expected) : undefined
      if (matching) chosen = matching
      else if (list.length === 1) chosen = list[0]
    }
    if (!chosen) continue
    if (chosen.validationStatus !== "VALID" && chosen.validationStatus !== "PENDING") continue
    if (nonAuthoritativeReason(chosen) !== null) continue
    out.push(chosen)
  }
  return out
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

/**
 * Detect fiscal years whose quarterly flow values are NOT discrete quarters.
 *
 * Some import paths store the annual figure in every quarter (RAYA FY2025 has
 * 2.588bn in Q1, Q2, Q3 and Q4) or store cumulative year-to-date figures. Summing
 * those four rows creates a fake TTM (RAYA: 8.2bn vs a 2.9bn annual profit) and a
 * fake 90% ROE. A quarter set is only trusted when its sum is within 25% of the
 * audited annual figure for the same fiscal year. When it is not, the year/code
 * is excluded from every TTM window rather than silently over-counted.
 */
function ttmInconsistentKeys(quarterly: PeriodBucket[], annual: PeriodBucket[]): Set<string> {
  const out = new Set<string>()
  for (const a of annual) {
    const qs = quarterly.filter(
      (q) => q.statementType === a.statementType && q.fiscalYear === a.fiscalYear && q.periodType === "QUARTERLY",
    )
    if (qs.length < 2) continue
    const codes = new Set<string>()
    for (const q of qs) for (const code of Object.keys(q.values)) if (TTM_FLOW_CODES.has(code)) codes.add(code)
    for (const code of codes) {
      if (a.values[code] === undefined) continue
      if (!qs.every((q) => q.values[code] !== undefined)) continue
      // A quarter that is byte-for-byte the annual figure is an annual copy,
      // not a discrete quarter. Two such rows are enough to distrust the year
      // even when only three quarters were imported (MCQE, MPRC, ATLC, ASPI,
      // DSCW). This check runs before the four-quarter sum check.
      const sameAsAnnual = qs.filter((q) => {
        const v = q.values[code] as number
        return Math.abs(v - a.values[code]) / Math.max(Math.abs(a.values[code]), 1) < 0.005
      }).length
      if (sameAsAnnual >= 2) {
        out.add(`${a.statementType}|${a.fiscalYear}|${code}`)
        continue
      }
      if (qs.length < 4) continue // cannot validate an incomplete year by sum
      const sum = qs.reduce((acc, q) => acc + q.values[code], 0)
      const denom = Math.abs(a.values[code])
      if (denom > 0 && Math.abs(sum - a.values[code]) / denom > 0.25) {
        out.add(`${a.statementType}|${a.fiscalYear}|${code}`)
      }
    }
  }

  // Even without an annual row, a fiscal year whose three or more quarterly
  // flow values are identical is an annual figure repeated across quarters
  // (HELI FY2025: 478,056,306 in Q1–Q4). Exclude those years from TTM.
  const groups = new Map<string, { code: string; rows: PeriodBucket[] }>()
  for (const q of quarterly) {
    if (q.periodType !== "QUARTERLY") continue
    for (const code of Object.keys(q.values)) {
      if (!TTM_FLOW_CODES.has(code)) continue
      const key = `${q.statementType}|${q.fiscalYear}|${code}`
      if (!groups.has(key)) groups.set(key, { code, rows: [] })
      groups.get(key)!.rows.push(q)
    }
  }
  for (const [key, g] of groups) {
    if (g.rows.length < 3) continue
    const vals = g.rows.map((q) => q.values[g.code])
    if (vals.every((v) => v !== undefined && Math.abs((v as number) - (vals[0] as number)) / Math.max(Math.abs(vals[0] as number), 1) < 0.005)) {
      out.add(key)
    }
  }
  return out
}

/**
 * CROSS-PERIOD COHERENCE GUARD (valueStatus=NEEDS_REVIEW, never silent).
 *
 * Aggregator imports (Yahoo/Reuters/TradingView) mix year-to-date cumulative
 * figures with discrete quarters and repeat annual figures across quarter
 * columns. The TTM guard (ttmInconsistentKeys) already refuses to SUM such
 * years — but the individual buckets still reached rankings/company pages as
 * valueStatus=OK. Verified market-wide cases this guard now blocks:
 *   HDBK  Q3 2025 revenue 30.6bn vs its own 9M cumulative 7.68bn (impossible)
 *   HDBK  FY 2025 revenue == Q3 2025 revenue (annual is a partial-period copy)
 *   EGBE  Q2 == Q3 == FY 2025 revenue 10.68bn vs 9M 2.81bn
 *   GROV  Q2 == Q3 == FY 2025 (identical-value annual-copy pattern)
 *   AMOC  "Q1 2026" and "Q3 2026" reports with the SAME period end (label collision)
 *   RAYA/HELI  the annual figure stored in every quarter column
 *
 * Rules (flow codes only, positive magnitudes, tiny values < 1K EGP ignored):
 *   R1 a discrete quarter may never exceed a cumulative period that covers it
 *      (H1 covers Q1-Q2, 9M covers Q1-Q3, annual covers Q1-Q4) by more than 5%.
 *   R2 an annual figure equal (±0.5%) to a quarter is a partial-period copy when
 *      a contradicting H1/9M cumulative exists, or when TWO+ quarters match it.
 *   R3 two or more quarters of the same fiscal year with identical flow values
 *      (±0.5%) are annual copies, not discrete quarters.
 *   R4 two quarterly buckets whose period ends are within 45 days but whose
 *      period keys differ — one of the labels is wrong (TradingView duplicate).
 *
 * Flagged (statementType, periodKey, code) pairs downgrade every metric that
 * depends on them to NEEDS_REVIEW with an explicit reason, and exclude the year
 * from TTM windows. Raw values are untouched — provenance stays visible.
 */
const CROSS_PERIOD_FLOW_CODES = new Set([
  "REVENUE", "COGS", "GROSS_PROFIT", "OPERATING_INCOME", "NET_INTEREST_INCOME",
  "NET_PROFIT", "NET_PROFIT_PARENT", "PROFIT_BEFORE_TAX", "INCOME_TAX",
])

/** Quarter index Q1..Q4, or the number of quarters a cumulative period spans. */
function subQuarterIndex(sub: string | null): number | null {
  if (!sub) return null
  const m = sub.match(/^Q([1-4])$/)
  if (m) return Number(m[1])
  if (sub === "H1") return 2
  if (sub === "9M") return 3
  return null
}

function cumulativeCoverage(periodType: string, sub: string | null): number | null {
  if (periodType === "ANNUAL") return 4
  if (periodType === "NINE_MONTH") return 3
  if (periodType === "SEMIANNUAL") return sub === "H1" ? 2 : null
  return null
}

function crossPeriodIncoherence(ordered: PeriodBucket[]): Map<string, string> {
  const flags = new Map<string, string>()
  const flag = (b: PeriodBucket, code: string, reason: string) => {
    const key = `${b.statementType}|${b.periodKey}|${code}`
    if (!flags.has(key)) flags.set(key, reason)
  }
  const groups = new Map<string, PeriodBucket[]>()
  for (const b of ordered) {
    const k = `${b.statementType}|${b.fiscalYear}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(b)
  }

  for (const [, gs] of groups) {
    const quarters = gs.filter((b) => b.periodType === "QUARTERLY")
    const cumuls = gs.filter((b) => ["SEMIANNUAL", "NINE_MONTH", "ANNUAL"].includes(b.periodType))

    // R4 — period-end collision between two quarterly buckets
    for (let i = 0; i < quarters.length; i++) {
      for (let j = i + 1; j < quarters.length; j++) {
        const a = quarters[i]
        const b = quarters[j]
        if (a.periodKey === b.periodKey || !a.periodEnd || !b.periodEnd) continue
        if (Math.abs(a.periodEnd.getTime() - b.periodEnd.getTime()) > 45 * 86_400_000) continue
        const codes = new Set([...Object.keys(a.values), ...Object.keys(b.values)])
        for (const code of codes) {
          if (!CROSS_PERIOD_FLOW_CODES.has(code)) continue
          const end = a.periodEnd.toISOString().slice(0, 10)
          flag(a, code, `period-end collision with ${b.periodLabel} (both end ${end}) — period labels ambiguous`)
          flag(b, code, `period-end collision with ${a.periodLabel} (both end ${end}) — period labels ambiguous`)
        }
      }
    }

    // R1 — a discrete quarter exceeding a cumulative period that covers it
    for (const q of quarters) {
      const qi = subQuarterIndex(parsePeriodKey(q.periodKey).sub)
      if (qi === null) continue
      for (const c of cumuls) {
        const cov = cumulativeCoverage(c.periodType, parsePeriodKey(c.periodKey).sub)
        if (cov === null || cov < qi) continue
        for (const code of Object.keys(q.values)) {
          if (!CROSS_PERIOD_FLOW_CODES.has(code)) continue
          const qv = q.values[code]
          const cv = c.values[code]
          if (qv === undefined || cv === undefined) continue
          if (Math.max(Math.abs(qv), Math.abs(cv)) < 1_000) continue
          if (qv > 0 && cv > 0 && qv > cv * 1.05) {
            flag(q, code, `quarter value ${qv.toExponential(3)} exceeds the ${c.periodLabel} cumulative total ${cv.toExponential(3)} — year-to-date figure stored as a discrete quarter`)
          }
        }
      }
    }

    // R2 — annual figure equal to a quarter (partial-period copy).
    // A pure year-to-date filer legitimately satisfies FY == Q4 (the Q4
    // cumulative IS the annual figure) together with Q3 == 9M / Q2 == H1.
    // The exemption below only applies when every verifiable pair in that
    // signature matches — otherwise the equality is a copy, not YTD.
    const pairEqual = (x: number | undefined, y: number | undefined) => {
      if (x === undefined || y === undefined || Math.max(Math.abs(x), Math.abs(y)) < 1_000) return true
      return Math.abs(x - y) / Math.max(Math.abs(x), Math.abs(y)) < 0.005
    }
    const bySub = (sub: string) => quarters.find((q) => parsePeriodKey(q.periodKey).sub === sub)
    const byCumul = (type: string) => cumuls.find((c) => c.periodType === type)
    for (const a of cumuls.filter((b) => b.periodType === "ANNUAL")) {
      for (const code of Object.keys(a.values)) {
        if (!CROSS_PERIOD_FLOW_CODES.has(code)) continue
        const av = a.values[code]
        if (av === undefined || Math.abs(av) < 1_000) continue
        const same = quarters.filter((q) => {
          const v = q.values[code]
          if (v === undefined || Math.abs(v) < 1_000) return false
          return Math.abs(v - av) / Math.max(Math.abs(av), Math.abs(v)) < 0.005
        })
        if (same.length === 0) continue
        const nonQ4 = same.some((q) => parsePeriodKey(q.periodKey).sub !== "Q4")
        const ytdConsistent = !nonQ4
          && pairEqual(bySub("Q4")?.values[code], av)
          && pairEqual(bySub("Q3")?.values[code], byCumul("NINE_MONTH")?.values[code])
          && pairEqual(bySub("Q2")?.values[code], byCumul("SEMIANNUAL")?.values[code])
        const contradicting = cumuls.some((c) => {
          if (c === a || c.periodType === "ANNUAL") return false
          const cv = c.values[code]
          if (cv === undefined || Math.abs(cv) < 1_000) return false
          return Math.abs(cv - av) / Math.max(Math.abs(av), Math.abs(cv)) > 0.10
        })
        if (same.length >= 2 || (contradicting && !ytdConsistent)) {
          flag(a, code, `annual figure equals ${same.map((s) => s.periodLabel).join(" & ")} — partial-period copy, not the audited year`)
          for (const s of same) flag(s, code, `identical to the ${a.periodLabel} annual figure — not a discrete quarter`)
        }
      }
    }

    // R3 — two+ quarters of the same fiscal year with identical flow values
    for (let i = 0; i < quarters.length; i++) {
      for (let j = i + 1; j < quarters.length; j++) {
        for (const code of Object.keys(quarters[i].values)) {
          if (!CROSS_PERIOD_FLOW_CODES.has(code)) continue
          const vi = quarters[i].values[code]
          const vj = quarters[j].values[code]
          if (vi === undefined || vj === undefined) continue
          const denom = Math.max(Math.abs(vi), Math.abs(vj))
          if (denom < 1_000) continue
          if (Math.abs(vi - vj) / denom < 0.005) {
            flag(quarters[i], code, `identical to ${quarters[j].periodLabel} — annual-copy pattern, not a discrete quarter`)
            flag(quarters[j], code, `identical to ${quarters[i].periodLabel} — annual-copy pattern, not a discrete quarter`)
          }
        }
      }
    }
  }
  return flags
}

/** Build TTM buckets from consecutive quarterly buckets (sum flows, point balance sheet). */
function buildTtmBuckets(quarterly: PeriodBucket[], inconsistent: Set<string>): PeriodBucket[] {
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
        // Skip a flow code when any fiscal year in the window failed the
        // discrete-quarter consistency check (annual-copy / cumulative rows).
        if (window.some((b) => inconsistent.has(`${b.statementType}|${b.fiscalYear}|${code}`))) continue
        // sum only when the metric exists in ALL four quarters (never zero-fill);
        // NET_PROFIT falls back to NET_PROFIT_PARENT for the whole window when the
        // total-NI line is missing in any quarter (never mixes the two definitions)
        if (code === "NET_PROFIT") {
          if (window.every((b) => b.values[code] !== undefined)) {
            values[code] = window.reduce((acc, b) => acc + b.values[code], 0)
          } else if (window.every((b) => b.values["NET_PROFIT_PARENT"] !== undefined)) {
            values[code] = window.reduce((acc, b) => acc + (b.values["NET_PROFIT_PARENT"] as number), 0)
          }
        } else if (window.every((b) => b.values[code] !== undefined)) {
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
    for (const v of ownValues(report)) {
      bucket.values[v.metricCode] = v.normalizedValue
    }
  }

  const ordered = [...buckets.values()].sort((a, b) =>
    (a.statementType + "|" + a.periodKey).localeCompare(b.statementType + "|" + b.periodKey)
  )

  // Cross-period coherence guard: year-to-date/discrete mixups, annual copies
  // and period-label collisions are downgraded to NEEDS_REVIEW (see function doc).
  const incoherent = crossPeriodIncoherence(ordered)
  // Any fiscal year with a flagged flow code must not be summed into TTM windows.
  const yearIncoherent = new Set<string>()
  for (const key of incoherent.keys()) {
    const [st, pk, code] = key.split("|")
    yearIncoherent.add(`${st}|${parsePeriodKey(pk).fiscalYear}|${code}`)
  }

  // Synthetic TTM windows from consecutive quarters — built PER statement type
  const ttmBuckets: PeriodBucket[] = []
  const byStatement = new Map<string, PeriodBucket[]>()
  for (const b of ordered) {
    const list = byStatement.get(b.statementType) ?? []
    list.push(b)
    byStatement.set(b.statementType, list)
  }
  const annualBuckets = ordered.filter((b) => b.periodType === "ANNUAL")
  for (const [, quarterlyBuckets] of byStatement) {
    const quarters = quarterlyBuckets.filter((b) => b.periodType === "QUARTERLY")
    const inconsistent = ttmInconsistentKeys(quarters, annualBuckets)
    for (const k of yearIncoherent) inconsistent.add(k)
    ttmBuckets.push(...buildTtmBuckets(quarters, inconsistent))
  }
  const allBuckets = [...ordered, ...ttmBuckets]

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
    const cur = bucket.values
    const metrics: Record<string, MetricResult> = {}

    // Per-period share count (a COUNT, never unit-scaled) preferred over the
    // company-level sharesOutstanding when the filing reports its own figure
    const periodShares = cur["SHARES_OUTSTANDING"] ?? companyShares

    const push = (code: string, result: MetricResult, sources: string[], formulaVersion: string, dependsOn: string[] = []) => {
      // Downgrade an OK metric when a raw value it depends on failed the
      // cross-period coherence guard (YTD/discrete mixup, annual copy, label
      // collision). NEEDS_REVIEW carries the explicit reason — never silent.
      const blocked = result.status === "OK"
        ? dependsOn
            .map((d) => incoherent.get(`${bucket.statementType}|${bucket.periodKey}|${d}`))
            .find(Boolean)
        : undefined
      const final = blocked ? ({ status: "NEEDS_REVIEW", detail: blocked } as MetricResult) : result
      metrics[code] = final
      calcRows.push({
        companyId,
        code,
        periodKey: bucket.periodKey,
        periodType: bucket.periodType,
        fiscalYear: bucket.fiscalYear,
        periodLabel: bucket.periodLabel,
        value: final.status === "OK" ? final.value ?? null : null,
        valueStatus: final.status,
        statusDetail: final.detail ?? null,
        formulaVersion,
        sourcePeriods: JSON.stringify(sources),
        statementType: bucket.statementType,
      })
    }

    // Margins
    push("gross_margin", margin(cur["GROSS_PROFIT"], cur["REVENUE"]), [bucket.periodKey], "gross_margin@1", ["GROSS_PROFIT", "REVENUE"])
    push("operating_margin", margin(cur["OPERATING_INCOME"], cur["REVENUE"]), [bucket.periodKey], "operating_margin@1", ["OPERATING_INCOME", "REVENUE"])
    push("net_margin", margin(niOf(cur), cur["REVENUE"]), [bucket.periodKey], "net_margin@1", ["NET_PROFIT", "NET_PROFIT_PARENT", "REVENUE"])

    // Ratios
    // ROE/ROA use net income attributable to the parent (see niParentOf).
    push("roe", roe(niParentOf(cur), cur["TOTAL_EQUITY"]), [bucket.periodKey], "roe@1", ["NET_PROFIT", "NET_PROFIT_PARENT"])
    push("roa", roa(niParentOf(cur), cur["TOTAL_ASSETS"]), [bucket.periodKey], "roa@1", ["NET_PROFIT", "NET_PROFIT_PARENT"])
    push("debt_to_equity", debtToEquity(cur["TOTAL_DEBT"], cur["TOTAL_EQUITY"]), [bucket.periodKey], "debt_to_equity@1")
    // liabilities-to-equity — fills the leverage gap: total liabilities coverage
    // is near-universal across sources, unlike the debt-only split
    push("liabilities_to_equity", debtToEquity(cur["TOTAL_LIABILITIES"], cur["TOTAL_EQUITY"]), [bucket.periodKey], "liabilities_to_equity@1")
    push("eps", eps(niOf(cur), periodShares), [bucket.periodKey], "eps@1", ["NET_PROFIT", "NET_PROFIT_PARENT"])
    push("book_value_per_share", bookValuePerShare(cur["TOTAL_EQUITY"], periodShares), [bucket.periodKey], "book_value_per_share@1")

    // Passthroughs (so scanners can threshold absolute values)
    const passthrough = (code: string, rawCode: string, fv: string) => {
      const v = cur[rawCode]
      push(code, v !== undefined ? { status: "OK", value: v } : { status: "DATA_UNAVAILABLE", detail: `${rawCode} not available for this period` }, [bucket.periodKey], fv, [rawCode])
    }
    passthrough("revenue", "REVENUE", "revenue@1")
    {
      // net_profit passthrough with NET_PROFIT_PARENT fallback (see niOf)
      const ni = niOf(cur)
      push("net_profit", ni !== undefined
        ? { status: "OK", value: ni }
        : { status: "DATA_UNAVAILABLE", detail: "NET_PROFIT not available for this period" },
        [bucket.periodKey], "net_profit@1", ["NET_PROFIT", "NET_PROFIT_PARENT"])
    }
    passthrough("operating_cash_flow", "OPERATING_CASH_FLOW", "operating_cash_flow@1")
    passthrough("total_assets", "TOTAL_ASSETS", "total_assets@1")
    passthrough("total_equity", "TOTAL_EQUITY", "total_equity@1")
    passthrough("total_debt", "TOTAL_DEBT", "total_debt@1")
    passthrough("short_term_debt", "SHORT_TERM_DEBT", "short_term_debt@1")
    passthrough("long_term_debt", "LONG_TERM_DEBT", "long_term_debt@1")
    passthrough("inventory", "INVENTORY", "inventory@1")
    passthrough("ebitda", "EBITDA", "ebitda@1")
    passthrough("non_current_assets", "NON_CURRENT_ASSETS", "non_current_assets@1")
    passthrough("retained_earnings", "RETAINED_EARNINGS", "retained_earnings@1")
    passthrough("investing_cash_flow", "INVESTING_CASH_FLOW", "investing_cash_flow@1")
    passthrough("financing_cash_flow", "FINANCING_CASH_FLOW", "financing_cash_flow@1")

    // Market metrics — computed from the latest observed price point (p_b@2 …).
    // No price => DATA_UNAVAILABLE; negative earnings/book => NOT_APPLICABLE with reason.
    push("p_b", priceToBook(priceValue, periodShares, cur["TOTAL_EQUITY"]), [bucket.periodKey], "p_b@2")
    push("p_e", priceToEarnings(priceValue, periodShares, niOf(cur)), [bucket.periodKey], "p_e@2", ["NET_PROFIT", "NET_PROFIT_PARENT"])
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

// Single-flight guard: two concurrent recomputeAll() passes would interleave
// writes to CalculatedMetric/FinancialEvent for the same companies (the HTTP
// admin route, the cron endpoint and CLI scripts all funnel here). The flag
// is set synchronously before the first await, so a second caller in the same
// process always observes it.
let recomputeAllBusy = false

/** True while a full recompute is running (poll before starting another). */
export function isRecomputeAllBusy(): boolean {
  return recomputeAllBusy
}

/** Thrown by recomputeAll() when a run is already in progress. */
export class RecomputeBusyError extends Error {
  constructor() {
    super("A full recompute is already running")
    this.name = "RECOMPUTE_BUSY"
  }
}

/** Recompute every active company (used by seed + admin actions) */
export async function recomputeAll(): Promise<RecomputeResult[]> {
  if (recomputeAllBusy) throw new RecomputeBusyError()
  recomputeAllBusy = true
  try {
    const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true } })
    const results: RecomputeResult[] = []
    for (const c of companies) {
      results.push(await recomputeCompany(c.id))
    }
    return results
  } finally {
    recomputeAllBusy = false
  }
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
