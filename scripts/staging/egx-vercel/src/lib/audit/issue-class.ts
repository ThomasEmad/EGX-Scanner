// Precision layer for the data-quality audit.
//
// Not every finding is a "data error". A scanner-grade dataset must separate:
//   • blocker  — the numbers contradict each other beyond materiality → data is
//                demonstrably wrong and must be quarantined/re-extracted.
//   • coverage — a metric/period is absent or stale → the data may be correct
//                but incomplete; this must never be reported as an error.
//   • advisory — a ratio is outside a healthy band or a movement is unusual;
//                it is a reason to look, not proof of bad data.
//   • metadata — ISIN / URL / timestamps. Administrative, not financial.
//
// Only blockers may reduce the accuracy score. Coverage reduces completeness.
// This prevents a company with perfect figures but a missing ISIN from being
// scored as if its financials were wrong.
//
// All materiality comparisons use BOTH a relative tolerance and an absolute
// floor, because a 20% difference on a EGP 100M cash-flow delta is immaterial
// to a company with EGP 400B of operating cash flow.

import type { AuditCheckResult, AuditCategory, AuditSeverity } from "./types"

export type IssueClass = "blocker" | "coverage" | "advisory" | "metadata"

export type RootCause =
  | "BS_IDENTITY"
  | "BS_MAPPING"
  | "BS_COMPONENTS"
  | "IS_GROSS_PROFIT"
  | "IS_TAX_BASIS"
  | "IS_MARGIN"
  | "IS_OPERATING"
  | "CF_IDENTITY"
  | "CASH_QUALITY"
  | "DEBT_DEFINITION"
  | "SIGN_INVERSION"
  | "NEGATIVE_EQUITY"
  | "DUPLICATE_PERIOD"
  | "FUTURE_PERIOD"
  | "FRESHNESS"
  | "MISSING_METRIC"
  | "TREND_COVERAGE"
  | "ISIN"
  | "SOURCE_METADATA"
  | "RATIO_OUTLIER"
  | "YOY_MOVE"
  | "CROSS_SOURCE"
  | "SECTOR_RULE"
  | "OTHER"

export interface IssueClassification {
  issueClass: IssueClass
  rootCause: RootCause
}

/** Absolute materiality floor in EGP (1 million). Differences below this are
 * rounding/scale noise even when the relative percentage looks large. */
export const ABS_MATERIALITY_FLOOR = 1_000_000

export interface MaterialityResult {
  /** diff / base (0 when base is 0) */
  rel: number
  /** absolute difference */
  abs: number
  /** the effective threshold = max(base × relTolerance, absFloor) */
  threshold: number
  /** true when the difference exceeds the effective threshold */
  material: boolean
}

/**
 * Materiality-aware difference test.
 * `base` should be the natural scale of the statement (total assets, revenue,
 * the largest cash-flow leg, …) — never the small delta itself.
 */
export function materiality(
  diff: number,
  base: number,
  relTolerance: number,
  absFloor: number = ABS_MATERIALITY_FLOOR,
): MaterialityResult {
  const absBase = Math.abs(base)
  const abs = Math.abs(diff)
  // The absolute floor must never dominate a genuinely small statement scale
  // (synthetic/test vectors or micro-caps), so cap it at 0.1% of the base.
  const floor = absBase === 0 ? 0 : Math.min(absFloor, absBase * 0.001)
  const threshold = Math.max(absBase * relTolerance, floor)
  return {
    rel: absBase === 0 ? 0 : abs / absBase,
    abs,
    threshold,
    material: abs > threshold,
  }
}

/** Severity for an identity/blocker finding once materiality is known. */
export function identitySeverity(
  m: MaterialityResult,
  opts: { relTolerance: number; criticalMultiple?: number; highMultiple?: number },
): AuditSeverity {
  const t = opts.relTolerance
  const criticalAt = t * (opts.criticalMultiple ?? 4)
  const highAt = t * (opts.highMultiple ?? 2)
  if (m.rel >= criticalAt) return "critical"
  if (m.rel >= highAt) return "high"
  return "medium"
}

const BLOCKER_CHECKS = new Set([
  "SIGN_ERROR",
  "GROSS_PROFIT_EXCEEDS_REVENUE",
  "NET_PROFIT_EXCEEDS_REVENUE",
  "NET_MARGIN_IMPOSSIBLE",
  "GROSS_MARGIN_IMPOSSIBLE",
  "DUPLICATE_PERIOD",
  "CROSS_QUARTER_DUPLICATE",
  "FUTURE_PERIOD",
  "SECTOR_FORBIDDEN_METRIC",
  "CURRENCY_MISMATCH",
  "UNIT_MISMATCH",
])

const COVERAGE_CHECKS = new Set([
  "MISSING_CRITICAL_METRIC",
  "MISSING_SECTOR_METRIC",
  "PERIOD_GAP",
  "INSUFFICIENT_TREND_DATA",
  "ANNUAL_SEQUENCE_GAP",
  "STALE_DATA",
  "SECTOR_REQUIRED_METRIC_MISSING",
])

const METADATA_CHECKS = new Set([
  "ISIN_MISSING",
  "ISIN_PLACEHOLDER",
  "ISIN_CHECKSUM_INVALID",
  "SOURCE_URL_MALFORMED",
  "EXTRACTED_AT_FUTURE",
])

/** Classify a check result into blocker / coverage / advisory / metadata.
 * Checks may override classification explicitly (e.g. a cash-flow identity is a
 * blocker for industrials but advisory for banks). */
export function classifyCheck(i: AuditCheckResult): IssueClassification {
  if (i.issueClass) return { issueClass: i.issueClass, rootCause: (i.rootCause as RootCause) ?? rootCauseOf(i) }
  if (BLOCKER_CHECKS.has(i.checkName)) return { issueClass: "blocker", rootCause: rootCauseOf(i) }
  if (COVERAGE_CHECKS.has(i.checkName)) return { issueClass: "coverage", rootCause: rootCauseOf(i) }
  if (METADATA_CHECKS.has(i.checkName)) return { issueClass: "metadata", rootCause: rootCauseOf(i) }

  // Accounting identities are blockers only when materiality escalated the
  // severity to high/critical; medium/low identity deltas are advisory.
  if (i.category === "accounting") {
    return {
      issueClass: i.severity === "critical" || i.severity === "high" ? "blocker" : "advisory",
      rootCause: rootCauseOf(i),
    }
  }
  if (i.category === "cross_source") {
    return { issueClass: i.severity === "critical" || i.severity === "high" ? "blocker" : "advisory", rootCause: "CROSS_SOURCE" }
  }
  if (i.category === "sector") {
    return { issueClass: "coverage", rootCause: "SECTOR_RULE" }
  }
  return { issueClass: "advisory", rootCause: rootCauseOf(i) }
}

/** Classify an issue that came back from the database (only description +
 * category + severity are available). */
export function classifyStoredIssue(row: {
  category: string
  severity: string
  description: string
}): IssueClassification {
  const d = row.description
  const cat = row.category
  const sev = row.severity

  if (cat === "missing") return { issueClass: "coverage", rootCause: d.includes("trend") || d.includes("years") ? "TREND_COVERAGE" : "MISSING_METRIC" }
  if (cat === "provenance") return { issueClass: "metadata", rootCause: d.includes("ISIN") ? "ISIN" : "SOURCE_METADATA" }
  if (cat === "outlier") return { issueClass: "advisory", rootCause: "RATIO_OUTLIER" }
  if (cat === "sector") {
    return d.includes("absent") || d.includes("requires")
      ? { issueClass: "coverage", rootCause: "SECTOR_RULE" }
      : { issueClass: "blocker", rootCause: "SECTOR_RULE" }
  }
  if (cat === "temporal") {
    if (d.includes("Latest data")) return { issueClass: "coverage", rootCause: "FRESHNESS" }
    if (d.includes("Missing annual")) return { issueClass: "coverage", rootCause: "TREND_COVERAGE" }
    if (d.includes("records share") || d.includes("repeats") || d.includes("duplicate")) {
      return { issueClass: sev === "high" ? "blocker" : "advisory", rootCause: "DUPLICATE_PERIOD" }
    }
    if (d.includes("future")) return { issueClass: "blocker", rootCause: "FUTURE_PERIOD" }
    return { issueClass: "advisory", rootCause: "YOY_MOVE" }
  }
  if (cat === "logical") {
    // Negative equity is a legitimate condition (accumulated losses), not a
    // contradiction. It must never reduce the accuracy score.
    if (/NEGATIVE_EQUITY|negative equity|not an error per se/i.test(d)) {
      return { issueClass: "advisory", rootCause: "NEGATIVE_EQUITY" }
    }
    if (d.includes("negative") || d.includes("impossible") || d.includes("Impossible")) {
      return { issueClass: "blocker", rootCause: d.includes("SIGN") ? "SIGN_INVERSION" : "IS_MARGIN" }
    }
    return { issueClass: "advisory", rootCause: "RATIO_OUTLIER" }
  }
  if (cat === "cross_source") {
    return { issueClass: sev === "critical" || sev === "high" ? "blocker" : "advisory", rootCause: "CROSS_SOURCE" }
  }
  if (cat === "accounting") {
    return {
      issueClass: sev === "critical" || sev === "high" ? "blocker" : "advisory",
      rootCause: rootCauseFromDescription(d),
    }
  }
  return { issueClass: "advisory", rootCause: "OTHER" }
}

function rootCauseOf(i: AuditCheckResult): RootCause {
  return rootCauseFromDescription(`${i.checkName} ${i.details}`)
}

export function rootCauseFromDescription(text: string): RootCause {
  const d = text
  if (/MAPPING ERROR|mis-mapped|calibrated like/.test(d)) return "BS_MAPPING"
  if (/ASSET_COMPONENTS|LIABILITY_COMPONENTS|CA\+NCA|CL\+NCL/.test(d)) return "BS_COMPONENTS"
  if (/BALANCE_SHEET_EQUATION|TOTAL_ASSETS/.test(d) && !/no annual/.test(d)) return "BS_IDENTITY"
  if (/CASH_FLOW_SUM|CASH_OPENING_CLOSING/.test(d)) return "CF_IDENTITY"
  if (/GROSS_PROFIT_IDENTITY|GROSS_PROFIT_EXCEEDS/.test(d)) return "IS_GROSS_PROFIT"
  if (/PBT_TAX_NET_PROFIT|TAX_RATE/.test(d)) return "IS_TAX_BASIS"
  if (/NET_MARGIN|GROSS_MARGIN|NET_PROFIT_EXCEEDS/.test(d)) return "IS_MARGIN"
  if (/NET_VS_OPERATING/.test(d)) return "IS_OPERATING"
  if (/DEBT_COMPONENTS/.test(d)) return "DEBT_DEFINITION"
  if (/OCF_VS_NET_INCOME|OCF\/NI/.test(d)) return "CASH_QUALITY"
  if (/NEGATIVE_EQUITY|negative equity|not an error per se/i.test(d)) return "NEGATIVE_EQUITY"
  if (/SIGN_ERROR|is negative|opposite sign|sign inversion/i.test(d)) return "SIGN_INVERSION"
  if (/DUPLICATE_PERIOD|CROSS_QUARTER_DUPLICATE|ANNUAL_QUARTER_DUPLICATE|records share|repeats/i.test(d)) return "DUPLICATE_PERIOD"
  if (/FUTURE_PERIOD|future/i.test(d)) return "FUTURE_PERIOD"
  if (/STALE_DATA|Latest data/i.test(d)) return "FRESHNESS"
  if (/ISIN/i.test(d)) return "ISIN"
  if (/URL|created in the future/i.test(d)) return "SOURCE_METADATA"
  if (/YOY/i.test(d)) return "YOY_MOVE"
  if (/MISSING_|has no annual|absent|INSUFFICIENT|PERIOD_GAP|Missing revenue|Missing annual/i.test(d)) {
    return /trend|years|INSUFFICIENT|PERIOD_GAP/i.test(d) ? "TREND_COVERAGE" : "MISSING_METRIC"
  }
  if (/EXTREME_LEVERAGE|CURRENT_RATIO|INVENTORY_TURNOVER|ROE_EXTREME|ROA_EXTREME|outlier/i.test(d)) return "RATIO_OUTLIER"
  if (/CROSS_SOURCE|cross-source|disagree/i.test(d)) return "CROSS_SOURCE"
  return "OTHER"
}

/** Human labels for root causes (used by the API/UI). */
export const ROOT_CAUSE_LABELS: Record<RootCause, { en: string; ar: string; action: { en: string; ar: string } }> = {
  BS_IDENTITY: { en: "Balance sheet does not balance", ar: "الميزانية غير متوازنة", action: { en: "Verify minority interest / total-liabilities mapping against the filing", ar: "تحقق من حقوق الأقلية وربط إجمالي الالتزامات بالقوائم الأصلية" } },
  BS_MAPPING: { en: "Balance-sheet line mis-mapped", ar: "خطأ في ربط بند بالميزانية", action: { en: "Re-extract the mis-mapped line (liabilities/equity) from the original statement", ar: "أعد استخراج البند الخاطئ (التزامات/حقوق ملكية) من القوائم الأصلية" } },
  BS_COMPONENTS: { en: "Balance sheet components mismatch", ar: "مكونات الميزانية غير متطابقة", action: { en: "Re-map current/non-current components from the source statement", ar: "أعد ربط المكونات المتداولة وغير المتداولة من القوائم" } },
  IS_GROSS_PROFIT: { en: "Gross profit identity", ar: "هوية إجمالي الربح", action: { en: "Confirm COGS sign and gross-profit line; quarantine sign inversions", ar: "تحقق من إشارة تكلفة المبيعات وبند إجمالي الربح" } },
  IS_TAX_BASIS: { en: "Tax / net-profit basis", ar: "أساس الضريبة وصافي الربح", action: { en: "Check minority interest and attributable-vs-total net profit", ar: "تحقق من حقوق الأقلية وصافي الربح العائد للمساهمين" } },
  IS_MARGIN: { en: "Impossible margin", ar: "هامش مستحيل", action: { en: "Review revenue/cost mapping and company sector", ar: "راجع ربط الإيرادات والتكاليف وتصنيف القطاع" } },
  IS_OPERATING: { en: "Operating vs net profit gap", ar: "فجوة الربح التشغيلي وصافي الربح", action: { en: "Verify one-off gains and holding-company structure", ar: "تحقق من الأرباح غير المتكررة وهيكل الشركة القابضة" } },
  CF_IDENTITY: { en: "Cash-flow identity", ar: "هوية التدفقات النقدية", action: { en: "Add FX effect on cash or correct the cash-flow legs", ar: "أضف أثر فروق العملة أو صحّح بنود التدفقات" } },
  CASH_QUALITY: { en: "Operating cash vs profit", ar: "التدفق التشغيلي مقابل الربح", action: { en: "Review working-capital movements; advisory only", ar: "راجع تغيرات رأس المال العامل — إرشادي فقط" } },
  DEBT_DEFINITION: { en: "Debt components definition", ar: "تعريف مكونات الدين", action: { en: "Total debt may include leases/other debt — confirm definition", ar: "قد يشمل إجمالي الدين الإيجارات أو ديوناً أخرى — تحقق من التعريف" } },
  SIGN_INVERSION: { en: "Sign inversion", ar: "انقلاب الإشارة", action: { en: "Quarantine the inverted value and re-extract with the correct sign", ar: "اعزل القيمة المنقلبة وأعد استخراجها بالإشارة الصحيحة" } },
  NEGATIVE_EQUITY: { en: "Negative equity", ar: "حقوق ملكية سالبة", action: { en: "Accumulated losses — legitimate, not a data error; monitor only", ar: "خسائر متراكمة — وضع قانوني وليس خطأً في البيانات؛ للمتابعة فقط" } },
  DUPLICATE_PERIOD: { en: "Duplicate period data", ar: "تكرار بيانات الفترة", action: { en: "Deduplicate annual/Q4 copies; keep the highest-authority report", ar: "أزل تكرار النسخ السنوية/الربع الرابع واحتفظ بالمصدر الأعلى موثوقية" } },
  FUTURE_PERIOD: { en: "Future-dated period", ar: "فترة بتاريخ مستقبلي", action: { en: "Correct the period end date", ar: "صحّح تاريخ نهاية الفترة" } },
  FRESHNESS: { en: "Stale data", ar: "بيانات قديمة", action: { en: "Harvest the latest published filing", ar: "اجلب أحدث قوائم مالية منشورة" } },
  MISSING_METRIC: { en: "Missing critical metric", ar: "مقياس حرج مفقود", action: { en: "Deep-fetch the metric from the original filing", ar: "استخرج المقياس من القوائم الأصلية" } },
  TREND_COVERAGE: { en: "Trend history gap", ar: "فجوة في السلسلة الزمنية", action: { en: "Backfill historical annual filings", ar: "استكمل القوائم السنوية التاريخية" } },
  ISIN: { en: "ISIN metadata", ar: "بيانات ISIN", action: { en: "Import the EGX ISIN master list", ar: "استورد قائمة ISIN الرسمية من البورصة" } },
  SOURCE_METADATA: { en: "Record metadata", ar: "بيانات السجل", action: { en: "Complete the internal record metadata", ar: "أكمل بيانات السجل الداخلي" } },
  RATIO_OUTLIER: { en: "Ratio outside normal band", ar: "نسبة خارج النطاق الطبيعي", action: { en: "Inspect the underlying values; advisory only", ar: "افحص القيم الأساسية — إرشادي فقط" } },
  YOY_MOVE: { en: "Large year-over-year move", ar: "تغير سنوي كبير", action: { en: "Confirm acquisition/rights issue or reclassification", ar: "تحقق من استحواذ أو إصدار حقوق أو إعادة تصنيف" } },
  CROSS_SOURCE: { en: "Conflicting records", ar: "تعارض بين السجلات", action: { en: "Resolve using record authority and re-verify", ar: "احسم التعارض وفق أولوية السجل وأعد التحقق" } },
  SECTOR_RULE: { en: "Sector rule violation / gap", ar: "مخالفة أو نقص في قواعد القطاع", action: { en: "Verify sector classification and sector-specific lines", ar: "تحقق من التصنيف القطاعي والبنود الخاصة بالقطاع" } },
  OTHER: { en: "Other", ar: "أخرى", action: { en: "Manual review", ar: "مراجعة يدوية" } },
}

export const ISSUE_CLASS_LABELS: Record<IssueClass, { en: string; ar: string }> = {
  blocker: { en: "Blocker", ar: "خطأ حاجب" },
  coverage: { en: "Coverage gap", ar: "نقص تغطية" },
  advisory: { en: "Advisory", ar: "إرشادي" },
  metadata: { en: "Metadata", ar: "بيانات وصفية" },
}
