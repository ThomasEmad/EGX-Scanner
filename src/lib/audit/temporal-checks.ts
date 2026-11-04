// CATEGORY 3: Temporal Anomalies — YoY jumps, period sequence, stale data,
// future-dated periods, duplicates.
//
// Precision rules: extreme YoY moves are advisories (acquisitions, rights
// issues and reclassifications are real), duplicates are blockers because they
// double-count data, and staleness is a coverage gap, not a data error.

import type { AuditCheckResult, AuditSeverity } from "./types"
import { isFuturePeriodEnd } from "../financial/period-validity"

export interface PeriodRecord {
  period: string          // "FY 2024" / "Q2 2025" …
  periodType: string      // ANNUAL | QUARTERLY | …
  fiscalYear: number
  periodEnd: Date
  sub?: string            // Q1..Q4 / H1 / 9M
  statementType?: string  // CONSOLIDATED | STANDALONE
  values: Map<string, number>
}

const CURRENT_DATE = new Date()

function overlapSimilarity(a: Map<string, number>, b: Map<string, number>): { overlap: number; same: number } {
  let overlap = 0
  let same = 0
  for (const [code, val] of a) {
    const bv = b.get(code)
    if (bv === undefined) continue
    overlap++
    if (Math.abs(val - bv) / Math.max(Math.abs(bv), 1) < 0.0005) same++
  }
  return { overlap, same }
}

export function runTemporalChecks(ticker: string, records: PeriodRecord[]): AuditCheckResult[] {
  const results: AuditCheckResult[] = []
  const annual = records.filter(r => r.periodType === "ANNUAL").sort((a, b) => a.fiscalYear - b.fiscalYear)

  // 3.1 YoY jumps for key metrics (>±thresholds) — advisory only
  const YOY_RULES: Array<[string, number, number]> = [
    ["REVENUE", 2.0, 0.5],
    ["NET_PROFIT", 5.0, 0.8],
    ["TOTAL_ASSETS", 1.0, 0.7],
    ["TOTAL_EQUITY", 2.0, 0.8],
  ]
  for (const [metric, maxUp, maxDown] of YOY_RULES) {
    for (let i = 1; i < annual.length; i++) {
      const prev = annual[i - 1].values.get(metric)
      const curr = annual[i].values.get(metric)
      if (prev === undefined || curr === undefined || prev === 0) continue
      const change = (curr - prev) / Math.abs(prev)
      if (change > maxUp || change < -maxDown) {
        const up = change > 0
        results.push({
          checkName: up ? "YOY_EXTREME_JUMP" : "YOY_EXTREME_DROP",
          category: "temporal", severity: "low",
          passed: false, ticker,
          period: `${annual[i - 1].fiscalYear}→${annual[i].fiscalYear}`,
          metricCode: metric, currentValue: curr, expectedValue: prev, autoFixable: false,
          issueClass: "advisory", rootCause: "YOY_MOVE",
          details: `${metric} ${up ? "jumped" : "dropped"} ${Math.abs(change * 100).toFixed(0)}% YoY (prev=${prev.toExponential(3)} → curr=${curr.toExponential(3)}) — acquisition, rights issue, reclassification or error; verify.`,
          detailsAr: `${metric} ${up ? "قفز" : "انخفض"} ${Math.abs(change * 100).toFixed(0)}% سنوياً — قد يكون استحواذاً أو إعادة تصنيف؛ يلزم التحقق.`,
        })
      }
    }
  }

  // 3.2 Exact duplicate periods (same type + statement basis + label)
  const seen = new Map<string, number>()
  for (const r of records) {
    const key = `${r.periodType}:${r.statementType ?? "ANY"}:${r.period}`
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  for (const [key, count] of seen) {
    if (count > 1) {
      results.push({
        checkName: "DUPLICATE_PERIOD", category: "temporal", severity: "high",
        passed: false, ticker, period: key, autoFixable: false,
        issueClass: "blocker", rootCause: "DUPLICATE_PERIOD",
        details: `${count} records share the same period "${key}" — deduplication needed.`,
        detailsAr: `توجد ${count} سجلات لنفس الفترة — يلزم إزالة المكررات.`,
      })
    }
  }

  // 3.2b Cross-quarter duplicates: a quarterly record whose overlapping values
  // are (nearly) identical to the previous quarter's record is a harvest copy.
  const quarterly = records
    .filter(r => r.periodType === "QUARTERLY")
    .sort((a, b) =>
      a.periodEnd.getTime() - b.periodEnd.getTime() ||
      (a.statementType ?? "").localeCompare(b.statementType ?? "")
    )
  for (let i = 1; i < quarterly.length; i++) {
    const cur = quarterly[i]
    const prev = quarterly[i - 1]
    if ((cur.statementType ?? "ANY") !== (prev.statementType ?? "ANY")) continue
    const { overlap, same } = overlapSimilarity(cur.values, prev.values)
    if (overlap >= 5 && same / overlap >= 0.9) {
      results.push({
        checkName: "CROSS_QUARTER_DUPLICATE", category: "temporal", severity: "high",
        passed: false, ticker, period: cur.period, autoFixable: false,
        issueClass: "blocker", rootCause: "DUPLICATE_PERIOD",
        details: `${cur.period} repeats ${same}/${overlap} values of the previous quarter ${prev.period} (±0.05%) — a tab-switch harvest copy; quarantine the later record and re-extract.`,
        detailsAr: `فترة ${cur.period} تكرر ${same}/${overlap} قيمة من الفترة السابقة ${prev.period} حرفيًا — نسخة خاطئة ناتجة عن عملية الاستخراج؛ يلزم العزل وإعادة الاستخراج.`,
      })
    }
  }

  // 3.2c Annual/Q4 copy: Q4 in Egypt is the annual cumulative report, so a
  // separate "Q4" row identical to the FY row is redundant and double-counts
  // the year. Advisory: dedupe, keep the highest-authority report.
  for (const a of annual) {
    for (const q of quarterly) {
      if (q.fiscalYear !== a.fiscalYear) continue
      if ((q.statementType ?? "ANY") !== (a.statementType ?? "ANY")) continue
      const days = Math.abs(q.periodEnd.getTime() - a.periodEnd.getTime()) / 86_400_000
      if (days > 45) continue
      const { overlap, same } = overlapSimilarity(q.values, a.values)
      if (overlap >= 5 && same / overlap >= 0.9) {
        results.push({
          checkName: "ANNUAL_QUARTER_DUPLICATE", category: "temporal", severity: "low",
          passed: false, ticker, period: q.period, autoFixable: false,
          issueClass: "advisory", rootCause: "DUPLICATE_PERIOD",
          details: `${q.period} duplicates the annual ${a.period} (${same}/${overlap} identical values) — redundant row; deduplicate to avoid double-counting the fiscal year.`,
          detailsAr: `فترة ${q.period} تكرر التقرير السنوي ${a.period} — صف زائد؛ أزله لتجنب احتساب السنة مرتين.`,
        })
      }
    }
  }

  for (const r of records) {
    // Any period ending beyond tomorrow cannot be an announced actual. The
    // previous 100-day tolerance let FY 2026 annuals (ending 31 Dec 2026)
    // pass as "latest results" in October 2026.
    if (isFuturePeriodEnd(r.periodEnd, CURRENT_DATE)) {
      results.push({
        checkName: "FUTURE_PERIOD", category: "temporal", severity: "critical",
        passed: false, ticker, period: r.period, autoFixable: false,
        issueClass: "blocker", rootCause: "FUTURE_PERIOD",
        details: `Period ends in the future (${r.periodEnd.toISOString().slice(0, 10)}) — data error.`,
        detailsAr: `الفترة تنتهي في المستقبل — خطأ في البيانات.`,
      })
    }
  }

  // 3.3 Sequence gap in annual reports — coverage, not an error
  if (annual.length >= 2) {
    const years = annual.map(a => a.fiscalYear)
    for (let i = 1; i < years.length; i++) {
      if (years[i] - years[i - 1] > 1) {
        results.push({
          checkName: "ANNUAL_SEQUENCE_GAP", category: "temporal", severity: "medium",
          passed: false, ticker, period: `${years[i - 1]}→${years[i]}`, autoFixable: false,
          issueClass: "coverage", rootCause: "TREND_COVERAGE",
          details: `Missing annual filings between ${years[i - 1]} and ${years[i]}.`,
          detailsAr: `فقدان تقرير سنوي بين هاتين السنتين.`,
        })
      }
    }
  }

  // 3.4 Stale data — coverage gap
  if (records.length > 0) {
    const latest = records.reduce((a, b) => (b.periodEnd > a.periodEnd ? b : a))
    const ageMonths = (CURRENT_DATE.getTime() - latest.periodEnd.getTime()) / (1000 * 60 * 60 * 24 * 30.4)
    if (ageMonths > 18) {
      results.push({
        checkName: "STALE_DATA", category: "temporal", severity: "high",
        passed: false, ticker, period: latest.period, autoFixable: false,
        issueClass: "coverage", rootCause: "FRESHNESS",
        details: `Latest data is ${ageMonths.toFixed(0)} months old (period ${latest.period}) — urgent refresh needed.`,
        detailsAr: `أحدث بيانات عمرها ${Math.floor(ageMonths)} شهر — يلزم تحديث عاجل.`,
      })
    } else if (ageMonths > 12) {
      results.push({
        checkName: "STALE_DATA", category: "temporal", severity: "medium",
        passed: false, ticker, period: latest.period, autoFixable: false,
        issueClass: "coverage", rootCause: "FRESHNESS",
        details: `Latest data is ${ageMonths.toFixed(0)} months old (period ${latest.period}) — refresh recommended.`,
        detailsAr: `أحدث بيانات عمرها ${Math.floor(ageMonths)} شهر — يُنصح بالتحديث.`,
      })
    }
  }

  return results
}

/** Helper for the runner: is the record the latest annual for its fiscal year? */
export function isLatestAnnual(r: PeriodRecord, records: PeriodRecord[]): boolean {
  const sameYear = records.filter(x => x.periodType === "ANNUAL" && x.fiscalYear === r.fiscalYear)
  if (sameYear.length === 0) return false
  const latest = sameYear.reduce((a, b) => (b.periodEnd > a.periodEnd ? b : a))
  return latest === r
}

export type { AuditSeverity }
