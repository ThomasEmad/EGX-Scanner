// Data-integrity policy — what counts as an *observed, authoritative* value.
//
// The project's core rule is: never invent data, and missing is not zero.
// Two ingestion paths violated that rule without any visible flag:
//
//  1. Carry-forward copies. When a quarterly filing did not include a balance
//     sheet, the pipeline copied the previous period's values into the new
//     report and left them VALID. 6,500+ such values exist (all quarterly).
//     They are estimates, not observations.
//
//  2. Zero placeholders. Some API sources return 0 for "not reported"
//     (e.g. Stockholders Equity). Stored as VALID, a zero equity silently
//     distorts every valuation ratio.
//
// This policy is shared by the audit engine, the recompute pipeline and the
// data-quality UI, so all three agree on what "authoritative" means.

export interface ValueLike {
  metricCode: string
  normalizedValue: number
  validationStatus: string
  validationNotes?: string | null
  originalLabel?: string | null
}

/** Metrics that are structurally static between filings; carrying them
 * forward is semantically safe (share counts only change on corporate
 * actions, which are themselves filings). */
export const STATIC_METRICS = new Set([
  "SHARE_CAPITAL",
  "SHARES_OUTSTANDING",
  "TREASURY_SHARES",
  "PAR_VALUE",
])

/** Metrics for which an exact zero is almost always a "not reported"
 * placeholder rather than an observed value. */
export const NEVER_ZERO_METRICS = new Set([
  "TOTAL_ASSETS",
  "TOTAL_LIABILITIES",
  "TOTAL_EQUITY",
  "REVENUE",
])

export const QUARANTINE_PREFIX = "AUDIT_QUARANTINE:"

export type NonAuthoritativeReason =
  | "ALREADY_QUARANTINED"
  | "CARRIED_FORWARD"
  | "ZERO_PLACEHOLDER"
  | null

/** Why a value must not be treated as an observed actual (null = authoritative). */
export function nonAuthoritativeReason(v: ValueLike): NonAuthoritativeReason {
  if (v.validationStatus === "FAILED") return "ALREADY_QUARANTINED"
  if (v.validationNotes?.startsWith(QUARANTINE_PREFIX)) return "ALREADY_QUARANTINED"
  if (
    typeof v.originalLabel === "string" &&
    v.originalLabel.startsWith("COPIED from") &&
    !STATIC_METRICS.has(v.metricCode)
  ) {
    return "CARRIED_FORWARD"
  }
  if (v.normalizedValue === 0 && NEVER_ZERO_METRICS.has(v.metricCode)) {
    return "ZERO_PLACEHOLDER"
  }
  return null
}

export function isAuthoritativeValue(v: ValueLike): boolean {
  return v.validationStatus === "VALID" && nonAuthoritativeReason(v) === null
}

export const QUARANTINE_REASONS: Record<Exclude<NonAuthoritativeReason, null>, { en: string; ar: string }> = {
  ALREADY_QUARANTINED: {
    en: "Previously quarantined by the audit.",
    ar: "تم عزلها مسبقاً بواسطة التدقيق.",
  },
  CARRIED_FORWARD: {
    en: "Carried-forward copy from another period — not observed in this filing.",
    ar: "قيمة منسوخة من فترة أخرى — لم تُفصح عنها في هذا التقرير.",
  },
  ZERO_PLACEHOLDER: {
    en: "Zero placeholder for a metric that cannot be zero — treated as missing.",
    ar: "صفر بديل لمقياس لا يمكن أن يكون صفراً — تُعامل كبيانات مفقودة.",
  },
}

/** Metrics that must be re-mapped when the original label proves the extractor
 * matched the wrong concept. Keyed by (current code, label pattern). */
export const MAPPING_CORRECTIONS: Array<{
  from: string
  labelPattern: RegExp
  to: string
  reason: string
}> = [
  {
    from: "TOTAL_DEBT",
    labelPattern: /^net debt$/i,
    to: "NET_DEBT",
    reason: 'original label "Net Debt" is debt minus cash, not gross total debt',
  },
  {
    from: "INVESTMENTS",
    labelPattern: /^invested capital$/i,
    to: "INVESTED_CAPITAL",
    reason: '"Invested Capital" is debt + equity, not the investments balance',
  },
  {
    from: "SHARE_CAPITAL",
    labelPattern: /^total capitalization$/i,
    to: "TOTAL_CAPITALIZATION",
    reason: '"Total Capitalization" is debt + equity, not share capital',
  },
]
