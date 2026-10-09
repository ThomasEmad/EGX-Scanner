// Financial Fact Classification — distinguishes the *nature* of every extracted
// value so the engine never accidentally treats management guidance as actual
// financial performance, or a restated figure as the originally reported one.
//
// Spec sections 14 (Distinguish financial facts from narrative) and 17
// (Restatement and reclassification intelligence) require this classification
// on every stored fact.
//
// This module is PURE (no I/O). It defines the canonical classification enum,
// precedence rules, and helper predicates that the extractor, validator, and
// research-profile layers all consult.
//
// IMPORTANT: A fact may carry multiple classifications over its lifecycle
// (e.g. a value first classified REPORTED_FINANCIAL may later be tagged
// RESTATED when a subsequent filing supersedes it). We always preserve the
// original classification alongside any later tag — never destroy history.

export type FactClassification =
  | "REPORTED_FINANCIAL" // An actual reported figure from a primary financial statement
  | "REPORTED_OPERATIONAL" // An operational KPI disclosed in the report (subs, beds, MWh)
  | "REPORTED_NOTE" // A figure disclosed in a note to the financial statements
  | "REPORTED_SEGMENT" // A figure disclosed in the segment information note
  | "CALCULATED" // Derived by the engine from reliable inputs (e.g. Net Debt = Debt − Cash)
  | "DERIVED_PERIOD" // Derived by period arithmetic (Q2 = H1 − Q1, Q4 = FY − 9M)
  | "RESTATED" // The figure has been superseded by a restated value in a later filing
  | "RECLASSIFIED" // The figure has been reclassified between line items in a later filing
  | "GUIDANCE" // Management guidance / forecast for a future period — NEVER actual performance
  | "FORECAST" // Analyst or third-party forecast — NEVER actual performance
  | "HISTORICAL" // A historical figure referenced for comparison (prior-year comparative)
  | "NARRATIVE" // A non-numeric fact or qualitative disclosure (e.g. "going concern")
  | "PROVISIONAL" // Initial figure pending finalization (e.g. preliminary results)
  | "AUDITED" // Final figure that has been audited
  | "UNAUDITED" // Figure explicitly marked as unaudited (interim reports)

export interface FactClassificationDef {
  code: FactClassification
  labelEn: string
  labelAr: string
  /** True when this classification represents an actual reported/calculated fact
   *  (i.e. safe to use in financial calculations and investor metrics). */
  isAuthoritative: boolean
  /** True when this classification represents a value that should NEVER be used
   *  as actual performance (guidance, forecast, narrative). */
  isNonActual: boolean
  /** Display colour hint for UI rendering */
  tone: "actual" | "derived" | "historical" | "guidance" | "narrative" | "restated"
}

export const FACT_CLASSIFICATIONS: FactClassificationDef[] = [
  { code: "REPORTED_FINANCIAL", labelEn: "Reported Financial", labelAr: "رقم مالي معلن", isAuthoritative: true, isNonActual: false, tone: "actual" },
  { code: "REPORTED_OPERATIONAL", labelEn: "Reported Operational KPI", labelAr: "مؤشر تشغيلي معلن", isAuthoritative: true, isNonActual: false, tone: "actual" },
  { code: "REPORTED_NOTE", labelEn: "Reported in Notes", labelAr: "مفصح به في الملاحظات", isAuthoritative: true, isNonActual: false, tone: "actual" },
  { code: "REPORTED_SEGMENT", labelEn: "Reported in Segments", labelAr: "مفصح به في القطاعات", isAuthoritative: true, isNonActual: false, tone: "actual" },
  { code: "CALCULATED", labelEn: "Calculated", labelAr: "محتسب", isAuthoritative: true, isNonActual: false, tone: "derived" },
  { code: "DERIVED_PERIOD", labelEn: "Period-Derived", labelAr: "مشتق فتريا", isAuthoritative: true, isNonActual: false, tone: "derived" },
  { code: "RESTATED", labelEn: "Restated", labelAr: "معاد عرضه", isAuthoritative: true, isNonActual: false, tone: "restated" },
  { code: "RECLASSIFIED", labelEn: "Reclassified", labelAr: "معاد تصنيفه", isAuthoritative: true, isNonActual: false, tone: "restated" },
  { code: "GUIDANCE", labelEn: "Management Guidance", labelAr: "توجيه الإدارة", isAuthoritative: false, isNonActual: true, tone: "guidance" },
  { code: "FORECAST", labelEn: "Forecast", labelAr: "توقعات", isAuthoritative: false, isNonActual: true, tone: "guidance" },
  { code: "HISTORICAL", labelEn: "Historical Reference", labelAr: "مرجعي تاريخي", isAuthoritative: true, isNonActual: false, tone: "historical" },
  { code: "NARRATIVE", labelEn: "Narrative Disclosure", labelAr: "إفصاح سردي", isAuthoritative: false, isNonActual: true, tone: "narrative" },
  { code: "PROVISIONAL", labelEn: "Provisional", labelAr: "مبدئي", isAuthoritative: false, isNonActual: false, tone: "derived" },
  { code: "AUDITED", labelEn: "Audited", labelAr: "مدقق", isAuthoritative: true, isNonActual: false, tone: "actual" },
  { code: "UNAUDITED", labelEn: "Unaudited", labelAr: "غير مدقق", isAuthoritative: true, isNonActual: false, tone: "actual" },
]

export const FACT_CLASSIFICATION_MAP: Record<FactClassification, FactClassificationDef> =
  Object.fromEntries(FACT_CLASSIFICATIONS.map((f) => [f.code, f])) as Record<FactClassification, FactClassificationDef>

/** True if a value carrying this classification may safely be used in financial
 *  calculations (margins, ratios, derived metrics, investor signals). */
export function isCalculationSafe(c: FactClassification | undefined | null): boolean {
  if (!c) return false
  const def = FACT_CLASSIFICATION_MAP[c]
  return !!def && def.isAuthoritative && !def.isNonActual
}

/** True if a value carrying this classification is an "actual" performance figure
 *  (not a guidance/forecast/narrative). Includes both audited and unaudited. */
export function isActual(c: FactClassification | undefined | null): boolean {
  if (!c) return false
  const def = FACT_CLASSIFICATION_MAP[c]
  return !!def && !def.isNonActual
}

/** Choose the more authoritative classification when a value carries multiple
 *  tags over its lifecycle (e.g. originally REPORTED_FINANCIAL, later RESTATED).
 *  Precedence: AUDITED > REPORTED_* > RESTATED > RECLASSIFIED > CALCULATED >
 *  DERIVED_PERIOD > PROVISIONAL > HISTORICAL > GUIDANCE > FORECAST > NARRATIVE.
 *  Never destroys history — caller still keeps the full classification chain. */
export function authoritativeClassification(classifications: FactClassification[]): FactClassification | undefined {
  const order: FactClassification[] = [
    "AUDITED",
    "REPORTED_FINANCIAL",
    "REPORTED_OPERATIONAL",
    "REPORTED_NOTE",
    "REPORTED_SEGMENT",
    "RESTATED",
    "RECLASSIFIED",
    "CALCULATED",
    "DERIVED_PERIOD",
    "UNAUDITED",
    "PROVISIONAL",
    "HISTORICAL",
    "NARRATIVE",
    "FORECAST",
    "GUIDANCE",
  ]
  for (const c of order) {
    if (classifications.includes(c)) return c
  }
  return undefined
}

/** Heuristic: classify a raw extracted value based on context signals.
 *  Used by the extractor when no explicit classification is provided. */
export function classifyByContext(opts: {
  statementType?: string
  pageSection?: string
  isRestated?: boolean
  isProvisional?: boolean
  isAudited?: boolean
  isGuidance?: boolean
  isForecast?: boolean
  isNarrative?: boolean
  inNotes?: boolean
  inSegment?: boolean
}): FactClassification {
  if (opts.isGuidance) return "GUIDANCE"
  if (opts.isForecast) return "FORECAST"
  if (opts.isNarrative) return "NARRATIVE"
  if (opts.isAudited) return "AUDITED"
  if (opts.isRestated) return "RESTATED"
  if (opts.isProvisional) return "PROVISIONAL"
  if (opts.inSegment) return "REPORTED_SEGMENT"
  if (opts.inNotes) return "REPORTED_NOTE"
  if (opts.pageSection === "operational_kpi") return "REPORTED_OPERATIONAL"
  if (opts.statementType && ["INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW"].includes(opts.statementType)) {
    return "REPORTED_FINANCIAL"
  }
  return "REPORTED_FINANCIAL" // default conservative
}
