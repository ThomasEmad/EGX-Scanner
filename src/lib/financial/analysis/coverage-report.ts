// Coverage Report Engine — produces a per-statement extraction coverage report
// as required by spec section 27.
//
// The coverage report tells the developer/investor:
//   - How many of the *expected* metrics were extracted for each statement
//   - How many of the *critical* metrics are missing (red flag)
//   - How many breakdown children are present for each parent (e.g. does
//     TOTAL_DEBT have ST + LT + LEASE breakdowns?)
//   - How many investor-relevant metrics are present (CRITICAL/HIGH tier)
//
// Example output:
//   Income Statement   34 / 38 relevant metrics found   (89%)
//   Balance Sheet      42 / 45 relevant metrics found   (93%)
//   Cash Flow          27 / 31 relevant metrics found   (87%)
//   Debt                8 / 10 breakdown components    (80%)
//   Notes              73 / 90 relevant facts found     (81%)
//   Investor Critical   8 / 9 critical metrics found    (89%)

import {
  INVESTOR_RELEVANCE,
  getInvestorRelevance,
  type InvestorRelevanceTier,
} from "../ontology/investor-relevance"
import { detectSector, getSectorMetricCodes, type SectorCode } from "../ontology/sector-applicability"
import { computeBreakdownCoverage, getBreakdownChildren } from "../ontology/fact-graph"
import { isFlowMetric } from "../ontology/metric-period-types"
import { RAW_METRIC_MAP } from "../registry"

export interface StatementCoverageRow {
  statementType: string
  statementLabel: string
  statementLabelAr?: string
  expectedCount: number
  foundCount: number
  missingCount: number
  coveragePct: number // 0..1
  foundMetrics: string[]
  missingMetrics: string[]
  /** Tier breakdown for the statement */
  byTier: Record<InvestorRelevanceTier, { expected: number; found: number }>
}

export interface BreakdownCoverageRow {
  parent: string
  parentLabel: string
  totalChildren: number
  foundChildren: string[]
  missingChildren: string[]
  coveragePct: number
  /** True when the parent itself is missing — means breakdowns cannot be validated */
  parentMissing: boolean
}

export interface InvestorCoverageRow {
  tier: InvestorRelevanceTier
  expected: number
  found: number
  missing: string[]
  coveragePct: number
}

export interface CoverageReport {
  companyId: string
  sector: SectorCode
  periodKey: string
  /** Per-statement coverage (Income Statement / Balance Sheet / Cash Flow / Notes / Equity / Segments) */
  statements: StatementCoverageRow[]
  /** Breakdown coverage (TOTAL_DEBT → ST + LT + LEASES, etc.) */
  breakdowns: BreakdownCoverageRow[]
  /** Coverage by investor-relevance tier (CRITICAL / HIGH / MEDIUM / LOW) */
  investorCoverage: InvestorCoverageRow[]
  /** Top-level quality dimensions (spec section 26) */
  quality: {
    statementCoverage: number // avg of statements coveragePct
    breakdownCoverage: number // avg of breakdowns coveragePct
    criticalCoverage: number // CRITICAL tier coverage
    investorMetricCoverage: number // CRITICAL + HIGH tier coverage
    noteCoverage: number // notes-specific coverage
    overall: number // weighted
  }
  /** Red flags — material gaps that should be addressed */
  redFlags: string[]
  summary: string
  generatedAt: string
}

const STATEMENT_LABELS: Record<string, { en: string; ar: string }> = {
  INCOME_STATEMENT: { en: "Income Statement", ar: "قائمة الدخل" },
  BALANCE_SHEET: { en: "Balance Sheet", ar: "قائمة المركز المالي" },
  CASH_FLOW: { en: "Cash Flow Statement", ar: "قائمة التدفقات النقدية" },
  OTHER: { en: "Notes & Other", ar: "الملاحظات وأخرى" },
}

/** Build a coverage report from the set of metric codes that were successfully
 *  extracted for a given company / period.
 *
 *  @param companyId — the company ID
 *  @param sector — the company's industry string (used to detect sector)
 *  @param periodKey — the period key for this coverage report
 *  @param foundCodes — set of metric codes successfully extracted
 *  @param expectedByStatement — optional override of expected metrics per statement
 */
export function buildCoverageReport(opts: {
  companyId: string
  sector?: string | null
  periodKey: string
  foundCodes: Set<string>
  /** Sector-aware expected metrics — if not provided, uses sector-applicability defaults */
  expectedByStatement?: Record<string, string[]>
}): CoverageReport {
  const sectorCode = detectSector(opts.sector)
  const sectorMetrics = getSectorMetricCodes(sectorCode)
  const foundCodes = opts.foundCodes

  // Group metrics by statement type
  const byStatement: Record<string, string[]> = {
    INCOME_STATEMENT: [],
    BALANCE_SHEET: [],
    CASH_FLOW: [],
    OTHER: [],
  }
  for (const code of sectorMetrics) {
    const def = RAW_METRIC_MAP[code]
    if (!def) continue
    const stmt = def.statementType
    if (!byStatement[stmt]) byStatement[stmt] = []
    byStatement[stmt].push(code)
  }

  // Build statement coverage rows
  const statements: StatementCoverageRow[] = []
  for (const [stmtType, codes] of Object.entries(byStatement)) {
    if (codes.length === 0) continue
    const found = codes.filter((c) => foundCodes.has(c))
    const missing = codes.filter((c) => !foundCodes.has(c))
    const byTier: Record<InvestorRelevanceTier, { expected: number; found: number }> = {
      CRITICAL: { expected: 0, found: 0 },
      HIGH: { expected: 0, found: 0 },
      MEDIUM: { expected: 0, found: 0 },
      LOW: { expected: 0, found: 0 },
    }
    for (const c of codes) {
      const tier = getInvestorRelevance(c)
      byTier[tier].expected++
      if (foundCodes.has(c)) byTier[tier].found++
    }
    statements.push({
      statementType: stmtType,
      statementLabel: STATEMENT_LABELS[stmtType]?.en ?? stmtType,
      statementLabelAr: STATEMENT_LABELS[stmtType]?.ar,
      expectedCount: codes.length,
      foundCount: found.length,
      missingCount: missing.length,
      coveragePct: codes.length === 0 ? 1 : found.length / codes.length,
      foundMetrics: found,
      missingMetrics: missing,
      byTier,
    })
  }

  // Build breakdown coverage rows for important parent metrics
  const breakdownParents = [
    "TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY",
    "TOTAL_DEBT", "LEASE_LIABILITIES", "CURRENT_ASSETS",
    "NON_CURRENT_ASSETS", "CURRENT_LIABILITIES", "NON_CURRENT_LIABILITIES",
    "OPERATING_CASH_FLOW", "INVESTING_CASH_FLOW", "FINANCING_CASH_FLOW",
    "OPERATING_EXPENSES_TOTAL", "INCOME_TAX", "OCI_TOTAL",
    "EQUITY_PARENT", "TOTAL_COMPREHENSIVE_INCOME",
  ]
  const breakdowns: BreakdownCoverageRow[] = []
  for (const parent of breakdownParents) {
    const children = getBreakdownChildren(parent)
    if (children.length === 0) continue
    const parentMissing = !foundCodes.has(parent)
    const foundChildren = children.filter((c) => foundCodes.has(c))
    const missingChildren = children.filter((c) => !foundCodes.has(c))
    const def = RAW_METRIC_MAP[parent]
    breakdowns.push({
      parent,
      parentLabel: def?.labelEn ?? parent,
      totalChildren: children.length,
      foundChildren,
      missingChildren,
      coveragePct: children.length === 0 ? 1 : foundChildren.length / children.length,
      parentMissing,
    })
  }

  // Build investor coverage by tier
  const tierCounts: Record<InvestorRelevanceTier, { expected: number; found: number; missing: string[] }> = {
    CRITICAL: { expected: 0, found: 0, missing: [] },
    HIGH: { expected: 0, found: 0, missing: [] },
    MEDIUM: { expected: 0, found: 0, missing: [] },
    LOW: { expected: 0, found: 0, missing: [] },
  }
  for (const code of sectorMetrics) {
    const tier = getInvestorRelevance(code)
    tierCounts[tier].expected++
    if (foundCodes.has(code)) {
      tierCounts[tier].found++
    } else {
      tierCounts[tier].missing.push(code)
    }
  }
  const investorCoverage: InvestorCoverageRow[] = (Object.keys(tierCounts) as InvestorRelevanceTier[])
    .map((tier) => ({
      tier,
      expected: tierCounts[tier].expected,
      found: tierCounts[tier].found,
      missing: tierCounts[tier].missing,
      coveragePct: tierCounts[tier].expected === 0 ? 1 : tierCounts[tier].found / tierCounts[tier].expected,
    }))

  // Quality dimensions
  const statementCoverage = statements.length === 0 ? 0 :
    statements.reduce((s, r) => s + r.coveragePct, 0) / statements.length
  const breakdownCoverage = breakdowns.length === 0 ? 1 :
    breakdowns.reduce((s, r) => s + r.coveragePct, 0) / breakdowns.length
  const criticalCoverage = tierCounts.CRITICAL.expected === 0 ? 1 : tierCounts.CRITICAL.found / tierCounts.CRITICAL.expected
  const investorHighCoverage = (tierCounts.CRITICAL.found + tierCounts.HIGH.found) /
    Math.max(1, tierCounts.CRITICAL.expected + tierCounts.HIGH.expected)
  const notesRow = statements.find((s) => s.statementType === "OTHER")
  const noteCoverage = notesRow ? notesRow.coveragePct : 0
  const overall = Math.round(
    (statementCoverage * 0.30 +
      criticalCoverage * 0.25 +
      investorHighCoverage * 0.20 +
      breakdownCoverage * 0.15 +
      noteCoverage * 0.10) * 100,
  ) / 100

  // Red flags
  const redFlags: string[] = []
  if (criticalCoverage < 1) {
    redFlags.push(`Missing ${tierCounts.CRITICAL.missing.length} critical metric(s): ${tierCounts.CRITICAL.missing.slice(0, 5).join(", ")}`)
  }
  for (const b of breakdowns) {
    if (!b.parentMissing && b.coveragePct < 0.5 && b.totalChildren >= 3) {
      redFlags.push(`${b.parentLabel}: only ${b.foundChildren.length}/${b.totalChildren} breakdown components extracted`)
    }
    if (b.parentMissing && b.totalChildren >= 3) {
      redFlags.push(`${b.parentLabel}: parent metric missing — breakdowns cannot be validated`)
    }
  }
  if (statementCoverage < 0.5) {
    redFlags.push(`Overall statement coverage only ${(statementCoverage * 100).toFixed(0)}% — extraction may be incomplete`)
  }

  const summary = [
    `${statements.length} statements analyzed`,
    `${tierCounts.CRITICAL.found}/${tierCounts.CRITICAL.expected} critical metrics`,
    `${tierCounts.HIGH.found}/${tierCounts.HIGH.expected} high-priority metrics`,
    `${breakdowns.filter((b) => b.coveragePct >= 0.5).length}/${breakdowns.length} breakdown groups ≥50% covered`,
    overall >= 0.85 ? "Excellent extraction coverage" : overall >= 0.65 ? "Acceptable coverage" : "Coverage gaps — review needed",
  ].join("; ")

  return {
    companyId: opts.companyId,
    sector: sectorCode,
    periodKey: opts.periodKey,
    statements,
    breakdowns,
    investorCoverage,
    quality: {
      statementCoverage: Math.round(statementCoverage * 100) / 100,
      breakdownCoverage: Math.round(breakdownCoverage * 100) / 100,
      criticalCoverage: Math.round(criticalCoverage * 100) / 100,
      investorMetricCoverage: Math.round(investorHighCoverage * 100) / 100,
      noteCoverage: Math.round(noteCoverage * 100) / 100,
      overall,
    },
    redFlags,
    summary,
    generatedAt: new Date().toISOString(),
  }
}
