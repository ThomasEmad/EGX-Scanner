// Investor Relevance & Source Preference — augments the canonical metric
// registry with two spec-required attributes:
//
//   1. INVESTOR_RELEVANCE (spec section 27) — for every metric, a tier
//      (CRITICAL / HIGH / MEDIUM / LOW) indicating how materially an
//      investor cares about this fact. Drives coverage report prioritization
//      and the "missing critical metrics" diagnostic.
//
//   2. SOURCE_PREFERENCE (spec section 18 / 13) — when a metric may appear
//      in multiple places (primary statement vs note vs segment), defines
//      the canonical extraction order so the candidate resolver prefers the
//      most authoritative source.
//
// Both maps are additive — they extend RawMetricDef without modifying it.
// Codes not present default to MEDIUM relevance and PRIMARY statement source.

export type InvestorRelevanceTier = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"

export interface InvestorRelevanceDef {
  code: string
  tier: InvestorRelevanceTier
  /** Why this tier — short explanation */
  rationale?: string
}

/** Tier CRITICAL — these metrics are non-negotiable for any investor analysis.
 *  A report missing more than 1-2 of these is essentially unusable. */
export const CRITICAL_INVESTOR_METRICS: InvestorRelevanceDef[] = [
  { code: "REVENUE", tier: "CRITICAL", rationale: "Top-line — fundamental driver of every model" },
  { code: "NET_PROFIT", tier: "CRITICAL", rationale: "Bottom-line earnings — core profitability signal" },
  { code: "TOTAL_ASSETS", tier: "CRITICAL", rationale: "Balance sheet anchor for ROA, leverage" },
  { code: "TOTAL_EQUITY", tier: "CRITICAL", rationale: "Book value basis for ROE and P/B" },
  { code: "TOTAL_LIABILITIES", tier: "CRITICAL", rationale: "Capital structure anchor" },
  { code: "OPERATING_CASH_FLOW", tier: "CRITICAL", rationale: "Cash earnings — validates accrual profit" },
  { code: "EPS", tier: "CRITICAL", rationale: "Per-share earnings for valuation" },
  { code: "TOTAL_DEBT", tier: "CRITICAL", rationale: "Leverage and solvency anchor" },
  { code: "SHARES_OUTSTANDING", tier: "CRITICAL", rationale: "Market cap, per-share metrics" },
]

/** Tier HIGH — material for investor analysis but not strictly required. */
export const HIGH_INVESTOR_METRICS: InvestorRelevanceDef[] = [
  { code: "COGS", tier: "HIGH", rationale: "Gross margin computation" },
  { code: "GROSS_PROFIT", tier: "HIGH", rationale: "Gross margin / profitability tier" },
  { code: "OPERATING_INCOME", tier: "HIGH", rationale: "Operating margin — quality of earnings" },
  { code: "PROFIT_BEFORE_TAX", tier: "HIGH", rationale: "Effective tax rate, pre-tax profitability" },
  { code: "INCOME_TAX", tier: "HIGH", rationale: "Tax burden and ETR" },
  { code: "NET_PROFIT_PARENT", tier: "HIGH", rationale: "Attributable to shareholders — valuation basis" },
  { code: "CASH_AND_EQUIVALENTS", tier: "HIGH", rationale: "Liquidity, net debt computation" },
  { code: "ACCOUNTS_RECEIVABLE", tier: "HIGH", rationale: "Working capital, DSO" },
  { code: "INVENTORY", tier: "HIGH", rationale: "Working capital, DIO, write-down risk" },
  { code: "SHORT_TERM_DEBT", tier: "HIGH", rationale: "Refinancing risk, current liquidity" },
  { code: "LONG_TERM_DEBT", tier: "HIGH", rationale: "Long-term solvency" },
  { code: "LEASE_LIABILITIES", tier: "HIGH", rationale: "Total leverage including IFRS 16 leases" },
  { code: "RETAINED_EARNINGS", tier: "HIGH", rationale: "Equity accumulation history" },
  { code: "INVESTING_CASH_FLOW", tier: "HIGH", rationale: "Capital allocation — capex/acquisitions" },
  { code: "FINANCING_CASH_FLOW", tier: "HIGH", rationale: "Capital structure changes" },
  { code: "CAPEX", tier: "HIGH", rationale: "Free cash flow, capex intensity" },
  { code: "DIVIDENDS_PAID", tier: "HIGH", rationale: "Capital return, dividend yield" },
  { code: "DEBT_PROCEEDS", tier: "HIGH", rationale: "New borrowing activity" },
  { code: "DEBT_REPAYMENTS", tier: "HIGH", rationale: "Debt reduction activity" },
  { code: "TRADE_PAYABLES", tier: "HIGH", rationale: "Working capital, DPO" },
  { code: "CURRENT_ASSETS", tier: "HIGH", rationale: "Liquidity ratios" },
  { code: "CURRENT_LIABILITIES", tier: "HIGH", rationale: "Liquidity ratios" },
  { code: "DEPRECIATION_EXPENSE", tier: "HIGH", rationale: "EBITDA, asset turnover" },
  { code: "BASIC_EPS", tier: "HIGH", rationale: "Per-share earnings (primary)" },
  { code: "DILUTED_EPS", tier: "HIGH", rationale: "Diluted per-share earnings" },
  { code: "WEIGHTED_AVG_SHARES", tier: "HIGH", rationale: "EPS computation basis" },
  { code: "PPE", tier: "HIGH", rationale: "Asset base, capex/depreciation context" },
  { code: "INTANGIBLE_ASSETS", tier: "HIGH", rationale: "Asset quality, goodwill concentration" },
  { code: "GOODWILL", tier: "HIGH", rationale: "Impairment risk indicator" },
  { code: "INTEREST_EXPENSE", tier: "HIGH", rationale: "Interest coverage, cost of debt" },
  { code: "FINANCE_COST", tier: "HIGH", rationale: "Total financing burden" },
  { code: "TREASURY_SHARES", tier: "HIGH", rationale: "Buyback activity, share-count changes" },
  { code: "SHARE_CAPITAL", tier: "HIGH", rationale: "Equity composition" },
  { code: "OPENING_CASH", tier: "HIGH", rationale: "Cash reconciliation" },
  { code: "CLOSING_CASH", tier: "HIGH", rationale: "Cash reconciliation" },
]

/** Tier MEDIUM — useful context but not required for core analysis. */
export const MEDIUM_INVESTOR_METRICS: InvestorRelevanceDef[] = [
  { code: "SELLING_EXPENSES", tier: "MEDIUM" },
  { code: "ADMIN_EXPENSES", tier: "MEDIUM" },
  { code: "RD_EXPENSES", tier: "MEDIUM" },
  { code: "OPERATING_EXPENSES_TOTAL", tier: "MEDIUM" },
  { code: "FINANCE_INCOME", tier: "MEDIUM" },
  { code: "INTEREST_INCOME", tier: "MEDIUM" },
  { code: "FX_GAIN_LOSS", tier: "MEDIUM" },
  { code: "FAIR_VALUE_GAIN_LOSS", tier: "MEDIUM" },
  { code: "INVESTMENT_INCOME", tier: "MEDIUM" },
  { code: "ASSOCIATES_JV_INCOME", tier: "MEDIUM" },
  { code: "OTHER_INCOME", tier: "MEDIUM" },
  { code: "OTHER_EXPENSES", tier: "MEDIUM" },
  { code: "CURRENT_TAX", tier: "MEDIUM" },
  { code: "DEFERRED_TAX", tier: "MEDIUM" },
  { code: "DEFERRED_TAX_ASSETS", tier: "MEDIUM" },
  { code: "DEFERRED_TAX_LIABILITIES", tier: "MEDIUM" },
  { code: "RESERVES", tier: "MEDIUM" },
  { code: "SHARE_PREMIUM", tier: "MEDIUM" },
  { code: "OCI_RESERVES", tier: "MEDIUM" },
  { code: "NON_CONTROLLING_INTERESTS", tier: "MEDIUM" },
  { code: "EQUITY_PARENT", tier: "MEDIUM" },
  { code: "ROU_ASSETS", tier: "MEDIUM" },
  { code: "INVESTMENT_PROPERTY", tier: "MEDIUM" },
  { code: "FINANCIAL_ASSETS", tier: "MEDIUM" },
  { code: "INVESTMENTS", tier: "MEDIUM" },
  { code: "OTHER_PAYABLES", tier: "MEDIUM" },
  { code: "TAX_PAYABLE", tier: "MEDIUM" },
  { code: "PROVISIONS", tier: "MEDIUM" },
  { code: "LEASE_LIABILITIES_CURRENT", tier: "MEDIUM" },
  { code: "LEASE_LIABILITIES_NONCURRENT", tier: "MEDIUM" },
  { code: "NON_CURRENT_ASSETS", tier: "MEDIUM" },
  { code: "NON_CURRENT_LIABILITIES", tier: "MEDIUM" },
  { code: "WEIGHTED_AVG_SHARES_DILUTED", tier: "MEDIUM" },
  { code: "TAXES_PAID", tier: "MEDIUM" },
  { code: "INTEREST_PAID_CF", tier: "MEDIUM" },
  { code: "INTEREST_RECEIVED_CF", tier: "MEDIUM" },
  { code: "PPE_PURCHASES", tier: "MEDIUM" },
  { code: "INTANGIBLE_PURCHASES", tier: "MEDIUM" },
  { code: "INVESTMENTS_PURCHASED", tier: "MEDIUM" },
  { code: "INVESTMENTS_SOLD", tier: "MEDIUM" },
  { code: "ACQUISITIONS_CASH", tier: "MEDIUM" },
  { code: "ASSET_SALE_PROCEEDS", tier: "MEDIUM" },
  { code: "DIVIDENDS_RECEIVED_CF", tier: "MEDIUM" },
  { code: "LEASE_PAYMENTS", tier: "MEDIUM" },
  { code: "CAPITAL_INCREASES_CASH", tier: "MEDIUM" },
  { code: "TREASURY_TRANSACTIONS_CASH", tier: "MEDIUM" },
  { code: "CASH_GENERATED_OPERATIONS", tier: "MEDIUM" },
  { code: "WC_MOVEMENTS", tier: "MEDIUM" },
  { code: "NET_CHANGE_IN_CASH", tier: "MEDIUM" },
  { code: "CONSTRUCTION_IN_PROGRESS", tier: "MEDIUM" },
  { code: "PPE_ADDITIONS", tier: "MEDIUM" },
  { code: "PPE_DISPOSALS", tier: "MEDIUM" },
  { code: "AMORTIZATION_EXPENSE", tier: "MEDIUM" },
  { code: "DPS_DECLARED", tier: "MEDIUM" },
  { code: "TOTAL_DIVIDENDS_DECLARED", tier: "MEDIUM" },
  { code: "PAYOUT_RATIO", tier: "MEDIUM" },
  { code: "EFFECTIVE_TAX_RATE", tier: "MEDIUM" },
  { code: "RESTRICTED_CASH", tier: "MEDIUM" },
  { code: "TRADE_RECEIVABLES", tier: "MEDIUM" },
  { code: "OTHER_RECEIVABLES", tier: "MEDIUM" },
  { code: "FVPL_ASSETS", tier: "MEDIUM" },
  { code: "FVOCI_ASSETS", tier: "MEDIUM" },
  { code: "ASSOCIATES_CARRYING", tier: "MEDIUM" },
  { code: "JV_CARRYING", tier: "MEDIUM" },
  { code: "LEASE_EXPENSE", tier: "MEDIUM" },
  { code: "IMPAIRMENT_CHARGES", tier: "MEDIUM" },
  { code: "IMPAIRMENT_REVERSALS", tier: "MEDIUM" },
  { code: "GOODWILL_IMPAIRMENT", tier: "MEDIUM" },
  { code: "RECEIVABLE_IMPAIRMENT", tier: "MEDIUM" },
  { code: "INVENTORY_IMPAIRMENT", tier: "MEDIUM" },
  { code: "TAX_LOSSES_UNRECOGNIZED", tier: "MEDIUM" },
  { code: "NET_CHANGE_IN_CASH", tier: "MEDIUM" },
  // Equity movement components
  { code: "EQ_MOVEMENT_PROFIT", tier: "MEDIUM" },
  { code: "EQ_MOVEMENT_OCI", tier: "MEDIUM" },
  { code: "EQ_MOVEMENT_DIVIDENDS", tier: "MEDIUM" },
  { code: "EQ_MOVEMENT_SHARE_ISSUES", tier: "MEDIUM" },
  { code: "EQ_MOVEMENT_TREASURY", tier: "MEDIUM" },
  { code: "EQ_MOVEMENT_TRANSFERS", tier: "MEDIUM" },
  { code: "EQ_MOVEMENT_NCI", tier: "MEDIUM" },
  // OCI components
  { code: "OCI_TOTAL", tier: "MEDIUM" },
  { code: "OCI_FX_TRANSLATION", tier: "MEDIUM" },
  { code: "OCI_FVOCI_MOVEMENTS", tier: "MEDIUM" },
  { code: "OCI_ACTUARIAL", tier: "MEDIUM" },
  { code: "OCI_REVALUATION", tier: "MEDIUM" },
  { code: "TOTAL_COMPREHENSIVE_INCOME", tier: "MEDIUM" },
  { code: "TOTAL_EQUITY_AND_LIABILITIES", tier: "MEDIUM" },
  // Segment metrics
  { code: "SEGMENT_REVENUE", tier: "MEDIUM" },
  { code: "SEGMENT_PROFIT", tier: "MEDIUM" },
  { code: "SEGMENT_ASSETS", tier: "MEDIUM" },
  { code: "SEGMENT_LIABILITIES", tier: "MEDIUM" },
  { code: "SEGMENT_CAPEX", tier: "MEDIUM" },
  // Bank-specific
  { code: "DEPOSITS", tier: "MEDIUM" },
  { code: "LOANS_NET", tier: "MEDIUM" },
  { code: "NET_INTEREST_INCOME", tier: "MEDIUM" },
]

/** Tier LOW — only relevant in specific sector contexts. */
export const LOW_INVESTOR_METRICS: InvestorRelevanceDef[] = [
  { code: "SALES", tier: "LOW" },
  { code: "NET_SALES", tier: "LOW" },
  { code: "BOOK_VALUE_PER_SHARE", tier: "LOW" },
  { code: "DIVIDEND_PER_SHARE", tier: "LOW" },
]

/** Combined map: code → investor relevance tier. */
export const INVESTOR_RELEVANCE: Record<string, InvestorRelevanceTier> = (() => {
  const out: Record<string, InvestorRelevanceTier> = {}
  for (const m of [...CRITICAL_INVESTOR_METRICS, ...HIGH_INVESTOR_METRICS, ...MEDIUM_INVESTOR_METRICS, ...LOW_INVESTOR_METRICS]) {
    out[m.code] = m.tier
  }
  return out
})()

export function getInvestorRelevance(metricCode: string): InvestorRelevanceTier {
  return INVESTOR_RELEVANCE[metricCode] ?? "MEDIUM"
}

// ---------------------------------------------------------------------------
// SOURCE PREFERENCE (spec section 18 — duplicate value resolution)
// ---------------------------------------------------------------------------

export type SourcePreference =
  | "PRIMARY_STATEMENT" // Income statement / balance sheet / cash flow / equity
  | "SEGMENT_NOTE" // Segment information note
  | "DETAILED_NOTE" // Specific note (debt, PPE, tax, etc.)
  | "DISCLOSURE_NOTE" // Contingencies, related parties, commitments
  | "MDNA" // Management discussion & analysis
  | "OTHER" // Other (glossary, supplementary tables)

export interface SourcePreferenceDef {
  code: string
  preferredSource: SourcePreference
  /** Ordered list — first source wins when multiple candidates exist */
  fallbackChain: SourcePreference[]
}

/** Most metrics prefer PRIMARY_STATEMENT, but some prefer notes (because the
 *  note is where the breakdown or maturity schedule is disclosed). */
export const SOURCE_PREFERENCES: SourcePreferenceDef[] = [
  // Note-level metrics — prefer the note over primary statement when both exist
  { code: "DEPRECIATION_EXPENSE", preferredSource: "DETAILED_NOTE", fallbackChain: ["PRIMARY_STATEMENT", "MDNA"] },
  { code: "AMORTIZATION_EXPENSE", preferredSource: "DETAILED_NOTE", fallbackChain: ["PRIMARY_STATEMENT", "MDNA"] },
  { code: "EFFECTIVE_TAX_RATE", preferredSource: "DETAILED_NOTE", fallbackChain: ["PRIMARY_STATEMENT", "MDNA"] },
  { code: "TOTAL_DIVIDENDS_DECLARED", preferredSource: "DETAILED_NOTE", fallbackChain: ["PRIMARY_STATEMENT", "MDNA"] },
  { code: "DPS_DECLARED", preferredSource: "DETAILED_NOTE", fallbackChain: ["PRIMARY_STATEMENT", "MDNA"] },
  { code: "PAYOUT_RATIO", preferredSource: "DETAILED_NOTE", fallbackChain: ["PRIMARY_STATEMENT", "MDNA"] },
  // Segment metrics — prefer segment note over primary statement
  { code: "SEGMENT_REVENUE", preferredSource: "SEGMENT_NOTE", fallbackChain: ["PRIMARY_STATEMENT"] },
  { code: "SEGMENT_PROFIT", preferredSource: "SEGMENT_NOTE", fallbackChain: ["PRIMARY_STATEMENT"] },
  { code: "SEGMENT_ASSETS", preferredSource: "SEGMENT_NOTE", fallbackChain: ["PRIMARY_STATEMENT"] },
  { code: "SEGMENT_LIABILITIES", preferredSource: "SEGMENT_NOTE", fallbackChain: ["PRIMARY_STATEMENT"] },
  { code: "SEGMENT_CAPEX", preferredSource: "SEGMENT_NOTE", fallbackChain: ["PRIMARY_STATEMENT"] },
  // PPE / Intangibles — movements prefer the note
  { code: "PPE_ADDITIONS", preferredSource: "DETAILED_NOTE", fallbackChain: ["PRIMARY_STATEMENT"] },
  { code: "PPE_DISPOSALS", preferredSource: "DETAILED_NOTE", fallbackChain: ["PRIMARY_STATEMENT"] },
  { code: "CONSTRUCTION_IN_PROGRESS", preferredSource: "DETAILED_NOTE", fallbackChain: ["PRIMARY_STATEMENT"] },
  // Impairment — prefer the note (often disclosed only there)
  { code: "IMPAIRMENT_CHARGES", preferredSource: "DETAILED_NOTE", fallbackChain: ["PRIMARY_STATEMENT", "MDNA"] },
  { code: "IMPAIRMENT_REVERSALS", preferredSource: "DETAILED_NOTE", fallbackChain: ["PRIMARY_STATEMENT"] },
  { code: "GOODWILL_IMPAIRMENT", preferredSource: "DETAILED_NOTE", fallbackChain: ["PRIMARY_STATEMENT", "MDNA"] },
  { code: "RECEIVABLE_IMPAIRMENT", preferredSource: "DETAILED_NOTE", fallbackChain: ["PRIMARY_STATEMENT"] },
  { code: "INVENTORY_IMPAIRMENT", preferredSource: "DETAILED_NOTE", fallbackChain: ["PRIMARY_STATEMENT"] },
]

export const SOURCE_PREFERENCE_MAP: Record<string, SourcePreferenceDef> =
  Object.fromEntries(SOURCE_PREFERENCES.map((s) => [s.code, s]))

export function getSourcePreference(metricCode: string): SourcePreferenceDef {
  return (
    SOURCE_PREFERENCE_MAP[metricCode] ?? {
      code: metricCode,
      preferredSource: "PRIMARY_STATEMENT",
      fallbackChain: ["PRIMARY_STATEMENT", "DETAILED_NOTE", "MDNA"],
    }
  )
}

/** Map a detected table section to its source-preference tier. */
export function sectionToSourcePreference(section: string | undefined): SourcePreference {
  if (!section) return "OTHER"
  const s = section.toUpperCase()
  if (s.includes("PRIMARY") || s.includes("STATEMENT")) return "PRIMARY_STATEMENT"
  if (s.includes("SEGMENT")) return "SEGMENT_NOTE"
  if (s.includes("DEBT") || s.includes("PPE") || s.includes("TAX") || s.includes("LEASE") || s.includes("NOTE")) return "DETAILED_NOTE"
  if (s.includes("CONTINGEN") || s.includes("RELATED") || s.includes("COMMIT")) return "DISCLOSURE_NOTE"
  if (s.includes("MDNA") || s.includes("MANAGEMENT") || s.includes("DISCUSSION")) return "MDNA"
  return "OTHER"
}

/** Source preference rank — lower = more authoritative. Used by the candidate
 *  resolver to break ties when two candidates have similar confidence. */
export function sourcePreferenceRank(pref: SourcePreference): number {
  const order: SourcePreference[] = [
    "PRIMARY_STATEMENT", // 0 — most authoritative
    "SEGMENT_NOTE", // 1
    "DETAILED_NOTE", // 2
    "DISCLOSURE_NOTE", // 3
    "MDNA", // 4
    "OTHER", // 5
  ]
  return order.indexOf(pref)
}
