// Data quality scoring engine — five component scores + weighted overall +
// 4 diagnostic counts + 3 detail arrays. Used to surface the trust level of a
// given period's extracted values (CRITICAL / EXPECTED metric coverage,
// confidence distribution, validation status, reconciliation results, source
// coverage).
//
// CRITICAL_METRIC_CODES (5) — every report should have these or it's unusable.
// EXPECTED_METRIC_CODES (~25) — the working set a competent analyst would expect.

import type { ValidationCheckResult } from "./validation/accounting"

export const CRITICAL_METRIC_CODES = new Set<string>([
  "REVENUE", "NET_PROFIT", "TOTAL_ASSETS", "TOTAL_EQUITY", "TOTAL_LIABILITIES",
])

export const EXPECTED_METRIC_CODES = new Set<string>([
  // Core income
  "REVENUE", "COGS", "GROSS_PROFIT", "OPERATING_INCOME", "PROFIT_BEFORE_TAX",
  "INCOME_TAX", "NET_PROFIT", "NET_PROFIT_PARENT", "EPS",
  // Core balance sheet
  "TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY", "CURRENT_ASSETS",
  "NON_CURRENT_ASSETS", "CURRENT_LIABILITIES", "NON_CURRENT_LIABILITIES",
  "CASH_AND_EQUIVALENTS", "ACCOUNTS_RECEIVABLE", "INVENTORY",
  "SHORT_TERM_DEBT", "LONG_TERM_DEBT", "TOTAL_DEBT", "RETAINED_EARNINGS",
  "SHARES_OUTSTANDING",
  // Core cash flow
  "OPERATING_CASH_FLOW", "INVESTING_CASH_FLOW", "FINANCING_CASH_FLOW",
])

export const RECONCILIATION_CHECK_NAMES = new Set<string>([
  "BALANCE_SHEET_IDENTITY",
  "EQUITY_LIAB_ASSETS_CROSS",
  "GROSS_PROFIT_IDENTITY",
  "PBT_TAX_NET_PROFIT",
  "CASH_RECONCILIATION",
  "EQUITY_RECONCILIATION",
  "DEBT_COMPONENTS",
  "ASSET_COMPONENTS",
  "LIABILITY_COMPONENTS",
  "QUARTERLY_SUM_ANNUAL",
  "H1_VS_Q1Q2",
  "NINE_M_VS_Q1Q2Q3",
  "COMPARATIVE_CONSISTENCY",
])

export interface DataQualityValue {
  metricCode: string
  value: number
  confidence: number
  extractionMethod: string
  validationStatus: "VALID" | "NEEDS_REVIEW" | "FAILED" | "PENDING"
}

export interface DataQualityResult {
  completenessScore: number
  confidenceScore: number
  validationScore: number
  reconciliationScore: number
  sourceCoverageScore: number
  overallScore: number
  unresolvedFieldsCount: number
  ambiguousFieldsCount: number
  missingCriticalFieldsCount: number
  reconciliationFailuresCount: number
  missingMetrics: string[]
  lowConfidenceMetrics: string[]
  failedChecks: string[]
}

export function computeDataQuality(
  values: DataQualityValue[],
  validationResults: ValidationCheckResult[],
): DataQualityResult {
  // ---- Completeness: coverage of CRITICAL + EXPECTED metrics ----
  const presentCodes = new Set(values.map((v) => v.metricCode))
  const missingCritical = [...CRITICAL_METRIC_CODES].filter((c) => !presentCodes.has(c))
  const missingExpected = [...EXPECTED_METRIC_CODES].filter((c) => !presentCodes.has(c))
  const criticalRatio = (CRITICAL_METRIC_CODES.size - missingCritical.length) / CRITICAL_METRIC_CODES.size
  const expectedRatio = (EXPECTED_METRIC_CODES.size - missingExpected.length) / EXPECTED_METRIC_CODES.size
  // Completeness: 70% critical + 30% expected
  const completenessScore = Math.round((criticalRatio * 0.7 + expectedRatio * 0.3) * 100) / 100

  // ---- Confidence: mean confidence weighted toward low-confidence outliers ----
  let confidenceScore = 0
  const lowConfidenceMetrics: string[] = []
  if (values.length > 0) {
    const confidences = values.map((v) => {
      if (v.confidence < 0.7) lowConfidenceMetrics.push(v.metricCode)
      return v.confidence
    })
    const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length
    // penalty for low-confidence outliers
    const lowPct = lowConfidenceMetrics.length / values.length
    confidenceScore = Math.max(0, Math.round((mean - lowPct * 0.15) * 100) / 100)
  }

  // ---- Validation: % of values with VALID status ----
  const valid = values.filter((v) => v.validationStatus === "VALID").length
  const needsReview = values.filter((v) => v.validationStatus === "NEEDS_REVIEW").length
  const failed = values.filter((v) => v.validationStatus === "FAILED").length
  const total = values.length || 1
  const validationScore = Math.round((valid / total) * 100) / 100

  // ---- Reconciliation: % of reconciliation checks that PASSED ----
  const reconciliationChecks = validationResults.filter((r) => RECONCILIATION_CHECK_NAMES.has(r.checkName))
  const reconciliationFailures = reconciliationChecks.filter((r) => r.status === "FAILED" || r.status === "WARNING").length
  const reconciliationPassed = reconciliationChecks.filter((r) => r.status === "PASSED").length
  const reconciliationScore = reconciliationChecks.length > 0
    ? Math.round((reconciliationPassed / reconciliationChecks.length) * 100) / 100
    : 0.5 // neutral when no reconciliation data

  // ---- Source coverage: % of values carrying a non-default extraction method ----
  const documented = values.filter((v) => v.extractionMethod && v.extractionMethod !== "MANUAL_ENTRY").length
  const sourceCoverageScore = values.length > 0 ? Math.round((documented / values.length) * 100) / 100 : 0

  // ---- Overall: weighted (completeness 35% + confidence 15% + validation 25% + reconciliation 20% + source 5%) ----
  const overallScore = Math.round(
    (completenessScore * 0.35 +
      confidenceScore * 0.15 +
      validationScore * 0.25 +
      reconciliationScore * 0.20 +
      sourceCoverageScore * 0.05) * 100,
  ) / 100

  // ---- Diagnostics ----
  const unresolvedFieldsCount = needsReview + failed
  const ambiguousFieldsCount = lowConfidenceMetrics.length
  const missingCriticalFieldsCount = missingCritical.length
  const failedChecks = validationResults.filter((r) => r.status === "FAILED").map((r) => r.checkName)
  const missingMetrics = [...missingCritical, ...missingExpected]

  return {
    completenessScore,
    confidenceScore,
    validationScore,
    reconciliationScore,
    sourceCoverageScore,
    overallScore,
    unresolvedFieldsCount,
    ambiguousFieldsCount,
    missingCriticalFieldsCount,
    reconciliationFailuresCount: reconciliationFailures,
    missingMetrics,
    lowConfidenceMetrics,
    failedChecks,
  }
}

export type QualityTier = "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "VERY_POOR" | "UNKNOWN"

export function qualityTier(score: number): QualityTier {
  if (score >= 0.9) return "EXCELLENT"
  if (score >= 0.75) return "GOOD"
  if (score >= 0.6) return "FAIR"
  if (score >= 0.4) return "POOR"
  if (score >= 0) return "VERY_POOR"
  return "UNKNOWN"
}

export function qualityTierDescription(tier: QualityTier): string {
  switch (tier) {
    case "EXCELLENT": return "Excellent — data quality is high; safe to publish without manual review."
    case "GOOD": return "Good — minor gaps; safe to publish with light manual review."
    case "FAIR": return "Fair — material gaps; manual review recommended before publication."
    case "POOR": return "Poor — significant gaps; do not publish without comprehensive manual review."
    case "VERY_POOR": return "Very poor — extraction is unusable; reprocess or re-extract."
    default: return "Unknown — data quality not yet computed."
  }
}
