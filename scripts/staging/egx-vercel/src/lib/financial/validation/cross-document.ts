// Cross-document validation — compares the SAME period across multiple filings
// (or composite quarters across Q1+Q2+Q3+Q4 vs the FY).
//
// Use cases:
//   • Restatement detection: prior-period figure reported in two different filings
//     differs by more than 0.5% ⇒ flagged.
//   • Quarterly sum vs annual: Q1+Q2+Q3+Q4 ≈ FY (flow metrics only, 2% tol).
//   • Semiannual consistency: Q1+Q2 ≈ H1 (1.5% tol).
//   • Nine-month consistency: Q1+Q2+Q3 ≈ 9M (1.5% tol).
//
// Only FLOW_METRIC_CODES are eligible for summation checks — balance-sheet
// stocks are point-in-time, not additive.

import { FLOW_METRIC_CODES } from "../derivation/period-derivation"
import type { ValidationCheckResult } from "./accounting"

const TOL_RESTATEMENT = 0.005 // 0.5%
const TOL_QUARTERLY_SUM_ANNUAL = 0.02 // 2%
const TOL_H1_Q1Q2 = 0.015 // 1.5%
const TOL_9M_Q1Q2Q3 = 0.015 // 1.5%

export interface PeriodFilingValue {
  metricCode: string
  value: number
  /** Identifier of the filing the value came from (for cross-doc restatement) */
  documentId?: string
  sourcePage?: number | null
}

export interface PeriodFilingSnapshot {
  periodKey: string
  periodType: string
  sub?: string
  fiscalYear: number
  values: PeriodFilingValue[]
}

export interface ComparativeValuePair {
  metricCode: string
  valueA: number
  valueB: number
  documentA?: string
  documentB?: string
}

function relDiff(a: number, b: number): number {
  const base = Math.max(Math.abs(a), Math.abs(b))
  if (base === 0) return 0
  return Math.abs(a - b) / base
}

function buildCheck(
  checkName: string,
  status: ValidationCheckResult["status"],
  severity: ValidationCheckResult["severity"],
  details: string,
  affectedFields: string[],
  sourcePages: number[],
  tolerance: number,
  expectedValue?: number,
  actualValue?: number,
): ValidationCheckResult {
  let discrepancy: number | undefined
  let discrepancyPct: number | undefined
  if (expectedValue !== undefined && actualValue !== undefined) {
    discrepancy = Math.abs(expectedValue - actualValue)
    discrepancyPct = relDiff(expectedValue, actualValue) * 100
  }
  return {
    checkName,
    category: "MATH",
    status,
    severity,
    details,
    discrepancy,
    discrepancyPct,
    expectedValue,
    actualValue,
    affectedFields,
    sourcePages,
    toleranceApplied: tolerance,
  }
}

/**
 * Detect restatements by comparing values reported for the SAME period in two
 * different filings. Any difference > 0.5% is flagged as a restatement.
 */
export function checkComparativeConsistency(
  periodA: PeriodFilingSnapshot,
  periodB: PeriodFilingSnapshot,
): ValidationCheckResult[] {
  const out: ValidationCheckResult[] = []
  if (periodA.periodKey !== periodB.periodKey) {
    out.push(buildCheck("COMPARATIVE_CONSISTENCY", "SKIPPED", "INFO",
      `Comparative consistency not evaluated — period keys differ (${periodA.periodKey} vs ${periodB.periodKey}).`,
      [], [], TOL_RESTATEMENT))
    return out
  }
  const byCodeA = new Map(periodA.values.map((v) => [v.metricCode, v]))
  const byCodeB = new Map(periodB.values.map((v) => [v.metricCode, v]))
  const allCodes = new Set<string>([...byCodeA.keys(), ...byCodeB.keys()])
  let compared = 0
  let restated = 0
  for (const code of allCodes) {
    if (!FLOW_METRIC_CODES.has(code) && !isBalanceSheetStock(code)) continue
    const a = byCodeA.get(code)
    const b = byCodeB.get(code)
    if (!a || !b) continue
    compared++
    const diff = relDiff(a.value, b.value)
    if (diff > TOL_RESTATEMENT) {
      restated++
      const pages: number[] = []
      if (typeof a.sourcePage === "number") pages.push(a.sourcePage)
      if (typeof b.sourcePage === "number") pages.push(b.sourcePage)
      out.push(buildCheck("COMPARATIVE_CONSISTENCY", "WARNING", "WARNING",
        `Restatement detected for ${code}: ${a.value} in filing ${a.documentId ?? "A"} vs ${b.value} in filing ${b.documentId ?? "B"} (${(diff * 100).toFixed(2)}% difference).`,
        [code], pages, TOL_RESTATEMENT, a.value, b.value))
    }
  }
  if (compared === 0) {
    out.push(buildCheck("COMPARATIVE_CONSISTENCY", "SKIPPED", "INFO",
      "Comparative consistency not evaluated — no overlapping metrics in the two filings.",
      [], [], TOL_RESTATEMENT))
  } else if (restated === 0) {
    out.push(buildCheck("COMPARATIVE_CONSISTENCY", "PASSED", "INFO",
      `All ${compared} comparable metrics consistent across the two filings within ${(TOL_RESTATEMENT * 100).toFixed(1)}%.`,
      [], [], TOL_RESTATEMENT))
  }
  return out
}

const BALANCE_SHEET_STOCKS = new Set([
  "TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY", "TOTAL_DEBT",
  "CASH_AND_EQUIVALENTS", "INVENTORY", "CURRENT_ASSETS", "CURRENT_LIABILITIES",
  "NON_CURRENT_ASSETS", "NON_CURRENT_LIABILITIES", "ACCOUNTS_RECEIVABLE",
  "TRADE_PAYABLES", "SHARES_OUTSTANDING", "RETAINED_EARNINGS",
])
function isBalanceSheetStock(code: string): boolean {
  return BALANCE_SHEET_STOCKS.has(code)
}

/**
 * Quarterly sum vs annual: Q1+Q2+Q3+Q4 ≈ FY, flow metrics only, 2% tol.
 */
export function checkQuarterlySumAnnual(
  quarters: PeriodFilingSnapshot[],
  annual: PeriodFilingSnapshot,
): ValidationCheckResult[] {
  const out: ValidationCheckResult[] = []
  const qBySub = new Map(quarters.map((q) => [q.sub, q]))
  const q1 = qBySub.get("Q1")
  const q2 = qBySub.get("Q2")
  const q3 = qBySub.get("Q3")
  const q4 = qBySub.get("Q4")
  if (!q1 || !q2 || !q3 || !q4) {
    out.push(buildCheck("QUARTERLY_SUM_ANNUAL", "SKIPPED", "INFO",
      `Quarterly sum vs annual not evaluated — need all four quarters (have: ${[q1?.sub, q2?.sub, q3?.sub, q4?.sub].filter(Boolean).join(", ")}).`,
      [], [], TOL_QUARTERLY_SUM_ANNUAL))
    return out
  }
  let compared = 0, mismatch = 0
  const codes = new Set<string>([...annual.values.map((v) => v.metricCode)])
  for (const q of [q1, q2, q3, q4]) for (const v of q.values) codes.add(v.metricCode)
  for (const code of codes) {
    if (!FLOW_METRIC_CODES.has(code)) continue
    const annualVal = annual.values.find((v) => v.metricCode === code)
    const q1Val = q1.values.find((v) => v.metricCode === code)
    const q2Val = q2.values.find((v) => v.metricCode === code)
    const q3Val = q3.values.find((v) => v.metricCode === code)
    const q4Val = q4.values.find((v) => v.metricCode === code)
    if (!annualVal || !q1Val || !q2Val || !q3Val || !q4Val) continue
    const sumQ = q1Val.value + q2Val.value + q3Val.value + q4Val.value
    const diff = relDiff(sumQ, annualVal.value)
    compared++
    if (diff > TOL_QUARTERLY_SUM_ANNUAL) {
      mismatch++
      const pages: number[] = []
      for (const v of [annualVal, q1Val, q2Val, q3Val, q4Val]) {
        if (typeof v.sourcePage === "number") pages.push(v.sourcePage)
      }
      out.push(buildCheck("QUARTERLY_SUM_ANNUAL", "WARNING", "WARNING",
        `Quarterly sum for ${code}: Q1+Q2+Q3+Q4 = ${sumQ.toExponential(3)} ≠ FY = ${annualVal.value.toExponential(3)} (${(diff * 100).toFixed(2)}% difference).`,
        [code], pages, TOL_QUARTERLY_SUM_ANNUAL, annualVal.value, sumQ))
    }
  }
  if (compared > 0 && mismatch === 0) {
    out.push(buildCheck("QUARTERLY_SUM_ANNUAL", "PASSED", "INFO",
      `All ${compared} flow metrics consistent: Q1+Q2+Q3+Q4 ≈ FY within ${(TOL_QUARTERLY_SUM_ANNUAL * 100).toFixed(1)}%.`,
      [], [], TOL_QUARTERLY_SUM_ANNUAL))
  }
  return out
}

/** Q1+Q2 ≈ H1 (1.5% tol). */
export function checkH1VsQ1Q2(
  q1: PeriodFilingSnapshot | undefined,
  q2: PeriodFilingSnapshot | undefined,
  h1: PeriodFilingSnapshot | undefined,
): ValidationCheckResult[] {
  const out: ValidationCheckResult[] = []
  if (!q1 || !q2 || !h1) {
    out.push(buildCheck("H1_VS_Q1Q2", "SKIPPED", "INFO",
      "H1 vs Q1+Q2 not evaluated — Q1, Q2 or H1 missing.",
      [], [], TOL_H1_Q1Q2))
    return out
  }
  let compared = 0, mismatch = 0
  const codes = new Set<string>([...h1.values.map((v) => v.metricCode)])
  for (const q of [q1, q2]) for (const v of q.values) codes.add(v.metricCode)
  for (const code of codes) {
    if (!FLOW_METRIC_CODES.has(code)) continue
    const h1Val = h1.values.find((v) => v.metricCode === code)
    const q1Val = q1.values.find((v) => v.metricCode === code)
    const q2Val = q2.values.find((v) => v.metricCode === code)
    if (!h1Val || !q1Val || !q2Val) continue
    const sum = q1Val.value + q2Val.value
    const diff = relDiff(sum, h1Val.value)
    compared++
    if (diff > TOL_H1_Q1Q2) {
      mismatch++
      out.push(buildCheck("H1_VS_Q1Q2", "WARNING", "WARNING",
        `Q1+Q2 for ${code} = ${sum.toExponential(3)} ≠ H1 = ${h1Val.value.toExponential(3)} (${(diff * 100).toFixed(2)}%).`,
        [code], [], TOL_H1_Q1Q2, h1Val.value, sum))
    }
  }
  if (compared > 0 && mismatch === 0) {
    out.push(buildCheck("H1_VS_Q1Q2", "PASSED", "INFO",
      `All ${compared} flow metrics consistent: Q1+Q2 ≈ H1 within ${(TOL_H1_Q1Q2 * 100).toFixed(1)}%.`,
      [], [], TOL_H1_Q1Q2))
  }
  return out
}

/** Q1+Q2+Q3 ≈ 9M (1.5% tol). */
export function checkNineMVsQ1Q2Q3(
  q1: PeriodFilingSnapshot | undefined,
  q2: PeriodFilingSnapshot | undefined,
  q3: PeriodFilingSnapshot | undefined,
  nineM: PeriodFilingSnapshot | undefined,
): ValidationCheckResult[] {
  const out: ValidationCheckResult[] = []
  if (!q1 || !q2 || !q3 || !nineM) {
    out.push(buildCheck("NINE_M_VS_Q1Q2Q3", "SKIPPED", "INFO",
      "9M vs Q1+Q2+Q3 not evaluated — Q1, Q2, Q3 or 9M missing.",
      [], [], TOL_9M_Q1Q2Q3))
    return out
  }
  let compared = 0, mismatch = 0
  const codes = new Set<string>([...nineM.values.map((v) => v.metricCode)])
  for (const q of [q1, q2, q3]) for (const v of q.values) codes.add(v.metricCode)
  for (const code of codes) {
    if (!FLOW_METRIC_CODES.has(code)) continue
    const nineMVal = nineM.values.find((v) => v.metricCode === code)
    const q1Val = q1.values.find((v) => v.metricCode === code)
    const q2Val = q2.values.find((v) => v.metricCode === code)
    const q3Val = q3.values.find((v) => v.metricCode === code)
    if (!nineMVal || !q1Val || !q2Val || !q3Val) continue
    const sum = q1Val.value + q2Val.value + q3Val.value
    const diff = relDiff(sum, nineMVal.value)
    compared++
    if (diff > TOL_9M_Q1Q2Q3) {
      mismatch++
      out.push(buildCheck("NINE_M_VS_Q1Q2Q3", "WARNING", "WARNING",
        `Q1+Q2+Q3 for ${code} = ${sum.toExponential(3)} ≠ 9M = ${nineMVal.value.toExponential(3)} (${(diff * 100).toFixed(2)}%).`,
        [code], [], TOL_9M_Q1Q2Q3, nineMVal.value, sum))
    }
  }
  if (compared > 0 && mismatch === 0) {
    out.push(buildCheck("NINE_M_VS_Q1Q2Q3", "PASSED", "INFO",
      `All ${compared} flow metrics consistent: Q1+Q2+Q3 ≈ 9M within ${(TOL_9M_Q1Q2Q3 * 100).toFixed(1)}%.`,
      [], [], TOL_9M_Q1Q2Q3))
  }
  return out
}

export interface CrossDocInputs {
  /** All filings indexed by period key (Q1, Q2, Q3, Q4, H1, 9M, FY). */
  byPeriodKey: Map<string, PeriodFilingSnapshot>
}

/** Run every applicable cross-doc check. */
export function runCrossDocumentChecks(inputs: CrossDocInputs): ValidationCheckResult[] {
  const out: ValidationCheckResult[] = []
  const map = inputs.byPeriodKey
  const get = (sub: string, year: number, periodType: string) => {
    const key = `${periodType}:${year}:${sub}`
    return map.get(key)
  }
  // Try cross-doc consistency for any period that appears twice (two filings)
  const grouped: Record<string, PeriodFilingSnapshot[]> = {}
  for (const snap of map.values()) {
    if (!grouped[snap.periodKey]) grouped[snap.periodKey] = []
    grouped[snap.periodKey].push(snap)
  }
  for (const [key, snaps] of Object.entries(grouped)) {
    if (snaps.length >= 2) {
      out.push(...checkComparativeConsistency(snaps[0], snaps[1]))
    }
  }
  // For each fiscal year where we have quarterly data, check quarterly sum vs annual
  const years = new Set<number>()
  for (const s of map.values()) years.add(s.fiscalYear)
  for (const year of years) {
    const q1 = get("Q1", year, "QUARTERLY")
    const q2 = get("Q2", year, "QUARTERLY")
    const q3 = get("Q3", year, "QUARTERLY")
    const q4 = get("Q4", year, "QUARTERLY")
    const h1 = get("H1", year, "SEMIANNUAL")
    const nineM = get("9M", year, "NINE_MONTH")
    const annual = get("", year, "ANNUAL")
    if (q1 && q2 && q3 && q4 && annual) {
      out.push(...checkQuarterlySumAnnual([q1, q2, q3, q4], annual))
    }
    if (q1 && q2 && h1) {
      out.push(...checkH1VsQ1Q2(q1, q2, h1))
    }
    if (q1 && q2 && q3 && nineM) {
      out.push(...checkNineMVsQ1Q2Q3(q1, q2, q3, nineM))
    }
  }
  return out
}
