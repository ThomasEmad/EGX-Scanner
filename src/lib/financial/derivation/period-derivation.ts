// Period derivation — derive Q2/Q3/Q4 values from cumulative filings.
// Q2 = H1 − Q1; Q3 = 9M − H1; Q4 = FY − 9M.
//
// Each derived value carries: formula, sourceMetricCodes, sourcePeriods,
// sourceDocumentIds, sourcePages, isSuspicious flag.
//
// Only FLOW_METRIC_CODES can be derived by subtraction (income / cash flow).
// POINT_IN_TIME_METRIC_CODES (balance sheet stocks) cannot be subtracted —
// the latest quarterly value IS the period-end balance.

export interface DerivationInput {
  /** Period key, e.g. "QUARTERLY:2025:Q1" */
  periodKey: string
  /** Sub-period token: Q1, Q2, H1, 9M, "" (annual) */
  sub?: string
  /** Period type */
  periodType: string
  /** Fiscal year */
  fiscalYear: number
  /** Map of metricCode → value (already normalized to plain EGP) */
  values: Record<string, number>
  /** Source document IDs (one or more) */
  documentIds?: string[]
  /** Source page numbers */
  pages?: number[]
}

export interface DerivedValue {
  metricCode: string
  value: number
  formula: string
  sourceMetricCodes: string[]
  sourcePeriods: string[]
  sourceDocumentIds: string[]
  sourcePages: number[]
  isSuspicious: boolean
  suspiciousReason?: string
  periodKey: string
  subPeriod: string
  periodType: string
  fiscalYear: number
}

/** ~80 accumulator metrics (income statement + cash flow flows + per-share flow). */
export const FLOW_METRIC_CODES = new Set<string>([
  // Core income statement
  "REVENUE", "SALES", "NET_SALES", "COGS", "GROSS_PROFIT", "OPERATING_INCOME",
  "SELLING_EXPENSES", "ADMIN_EXPENSES", "RD_EXPENSES", "OPERATING_EXPENSES_TOTAL",
  "FINANCE_INCOME", "INTEREST_INCOME", "INTEREST_EXPENSE", "FX_GAIN_LOSS",
  "FAIR_VALUE_GAIN_LOSS", "INVESTMENT_INCOME", "ASSOCIATES_JV_INCOME",
  "OTHER_INCOME", "OTHER_EXPENSES", "CURRENT_TAX", "DEFERRED_TAX", "INCOME_TAX",
  "FINANCE_COST", "PROFIT_BEFORE_TAX", "NET_PROFIT", "NET_PROFIT_PARENT",
  "NET_INTEREST_INCOME",
  // Per-share flow
  "EPS", "BASIC_EPS", "DILUTED_EPS",
  // OCI flows
  "OCI_TOTAL", "OCI_FX_TRANSLATION", "OCI_FVOCI_MOVEMENTS", "OCI_ACTUARIAL",
  "OCI_REVALUATION", "TOTAL_COMPREHENSIVE_INCOME",
  // Cash flow (operating + investing + financing + reconciliation movement)
  "OPERATING_CASH_FLOW", "INVESTING_CASH_FLOW", "FINANCING_CASH_FLOW",
  "NET_CHANGE_IN_CASH", "CASH_GENERATED_OPERATIONS", "WC_MOVEMENTS",
  "TAXES_PAID", "INTEREST_PAID_CF", "INTEREST_RECEIVED_CF",
  "CAPEX", "PPE_PURCHASES", "INTANGIBLE_PURCHASES", "INVESTMENTS_PURCHASED",
  "INVESTMENTS_SOLD", "ACQUISITIONS_CASH", "ASSET_SALE_PROCEEDS",
  "DIVIDENDS_RECEIVED_CF", "DEBT_PROCEEDS", "DEBT_REPAYMENTS",
  "LEASE_PAYMENTS", "DIVIDENDS_PAID", "CAPITAL_INCREASES_CASH",
  "TREASURY_TRANSACTIONS_CASH",
  // Notes disclosures flows
  "IMPAIRMENT_CHARGES", "IMPAIRMENT_REVERSALS", "GOODWILL_IMPAIRMENT",
  "RECEIVABLE_IMPAIRMENT", "INVENTORY_IMPAIRMENT", "DEPRECIATION_EXPENSE",
  "AMORTIZATION_EXPENSE", "LEASE_EXPENSE",
  "PPE_ADDITIONS", "PPE_DISPOSALS",
  // Equity movement flows
  "EQ_MOVEMENT_PROFIT", "EQ_MOVEMENT_OCI", "EQ_MOVEMENT_DIVIDENDS",
  "EQ_MOVEMENT_SHARE_ISSUES", "EQ_MOVEMENT_TREASURY", "EQ_MOVEMENT_TRANSFERS",
  "EQ_MOVEMENT_NCI",
  // Segment flows
  "SEGMENT_REVENUE", "SEGMENT_PROFIT", "SEGMENT_CAPEX",
])

/** ~50 balance-sheet stock metrics — point-in-time, never derived by subtraction. */
export const POINT_IN_TIME_METRIC_CODES = new Set<string>([
  // Balance sheet stocks
  "TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY", "TOTAL_EQUITY_AND_LIABILITIES",
  "EQUITY_PARENT", "NON_CONTROLLING_INTERESTS", "CURRENT_ASSETS", "NON_CURRENT_ASSETS",
  "CURRENT_LIABILITIES", "NON_CURRENT_LIABILITIES",
  "CASH_AND_EQUIVALENTS", "RESTRICTED_CASH", "ACCOUNTS_RECEIVABLE",
  "TRADE_RECEIVABLES", "OTHER_RECEIVABLES", "INVENTORY",
  "INVESTMENTS", "FINANCIAL_ASSETS", "FVPL_ASSETS", "FVOCI_ASSETS",
  "ASSOCIATES_CARRYING", "JV_CARRYING", "INVESTMENT_PROPERTY",
  "PPE", "ROU_ASSETS", "INTANGIBLE_ASSETS", "GOODWILL",
  "DEFERRED_TAX_ASSETS", "DEFERRED_TAX_LIABILITIES",
  "TRADE_PAYABLES", "OTHER_PAYABLES", "PROVISIONS", "TAX_PAYABLE",
  "SHORT_TERM_DEBT", "LONG_TERM_DEBT", "TOTAL_DEBT",
  "LEASE_LIABILITIES", "LEASE_LIABILITIES_CURRENT", "LEASE_LIABILITIES_NONCURRENT",
  "RETAINED_EARNINGS", "SHARE_CAPITAL", "SHARE_PREMIUM", "TREASURY_SHARES",
  "RESERVES", "OCI_RESERVES",
  "SHARES_OUTSTANDING", "WEIGHTED_AVG_SHARES", "WEIGHTED_AVG_SHARES_DILUTED",
  // Banking stocks
  "DEPOSITS", "LOANS_NET",
  // Cash reconciliation stocks
  "OPENING_CASH", "CLOSING_CASH",
  // Segment stocks
  "SEGMENT_ASSETS", "SEGMENT_LIABILITIES",
])

function getValue(input: DerivationInput, code: string): number | undefined {
  return input.values[code]
}

function isSuspiciousDiff(value: number): { flag: boolean; reason?: string } {
  if (!Number.isFinite(value)) return { flag: true, reason: "Non-finite derived value" }
  if (value < 0) {
    // Negative derived values are suspicious for revenue/sales/profit (positive flow)
    // but legitimate for expense metrics. We flag for review.
    return { flag: true, reason: "Derived value is negative — verify the cumulative subtraction order" }
  }
  return { flag: false }
}

/** Derive Q2 = H1 − Q1 for every flow metric present in both. */
export function deriveQ2(
  h1: DerivationInput,
  q1: DerivationInput,
  year: number,
): DerivedValue[] {
  const out: DerivedValue[] = []
  for (const code of FLOW_METRIC_CODES) {
    const h1v = getValue(h1, code)
    const q1v = getValue(q1, code)
    if (h1v === undefined || q1v === undefined) continue
    const derived = h1v - q1v
    const sus = isSuspiciousDiff(derived)
    out.push({
      metricCode: code,
      value: derived,
      formula: "Q2 = H1 - Q1",
      sourceMetricCodes: [code],
      sourcePeriods: [h1.periodKey, q1.periodKey],
      sourceDocumentIds: [...(h1.documentIds ?? []), ...(q1.documentIds ?? [])],
      sourcePages: [...(h1.pages ?? []), ...(q1.pages ?? [])],
      isSuspicious: sus.flag,
      suspiciousReason: sus.reason,
      periodKey: `QUARTERLY:${year}:Q2`,
      subPeriod: "Q2",
      periodType: "QUARTERLY",
      fiscalYear: year,
    })
  }
  return out
}

/** Derive Q3 = 9M − H1 for every flow metric. */
export function deriveQ3(
  nineM: DerivationInput,
  h1: DerivationInput,
  year: number,
): DerivedValue[] {
  const out: DerivedValue[] = []
  for (const code of FLOW_METRIC_CODES) {
    const nineMv = getValue(nineM, code)
    const h1v = getValue(h1, code)
    if (nineMv === undefined || h1v === undefined) continue
    const derived = nineMv - h1v
    const sus = isSuspiciousDiff(derived)
    out.push({
      metricCode: code,
      value: derived,
      formula: "Q3 = 9M - H1",
      sourceMetricCodes: [code],
      sourcePeriods: [nineM.periodKey, h1.periodKey],
      sourceDocumentIds: [...(nineM.documentIds ?? []), ...(h1.documentIds ?? [])],
      sourcePages: [...(nineM.pages ?? []), ...(h1.pages ?? [])],
      isSuspicious: sus.flag,
      suspiciousReason: sus.reason,
      periodKey: `QUARTERLY:${year}:Q3`,
      subPeriod: "Q3",
      periodType: "QUARTERLY",
      fiscalYear: year,
    })
  }
  return out
}

/** Derive Q4 = FY − 9M for every flow metric. */
export function deriveQ4(
  fy: DerivationInput,
  nineM: DerivationInput,
  year: number,
): DerivedValue[] {
  const out: DerivedValue[] = []
  for (const code of FLOW_METRIC_CODES) {
    const fyv = getValue(fy, code)
    const nineMv = getValue(nineM, code)
    if (fyv === undefined || nineMv === undefined) continue
    const derived = fyv - nineMv
    const sus = isSuspiciousDiff(derived)
    out.push({
      metricCode: code,
      value: derived,
      formula: "Q4 = FY - 9M",
      sourceMetricCodes: [code],
      sourcePeriods: [fy.periodKey, nineM.periodKey],
      sourceDocumentIds: [...(fy.documentIds ?? []), ...(nineM.documentIds ?? [])],
      sourcePages: [...(fy.pages ?? []), ...(nineM.pages ?? [])],
      isSuspicious: sus.flag,
      suspiciousReason: sus.reason,
      periodKey: `QUARTERLY:${year}:Q4`,
      subPeriod: "Q4",
      periodType: "QUARTERLY",
      fiscalYear: year,
    })
  }
  return out
}

export interface DerivationInputs {
  /** Indexed by sub-period token: "Q1", "Q2", "Q3", "Q4", "H1", "H2", "9M", "" (annual) */
  bySub: Record<string, DerivationInput>
  year: number
}

/** Derive all quarterly periods from whatever cumulative inputs are available. */
export function deriveAllPeriods(inputs: DerivationInputs): DerivedValue[] {
  const out: DerivedValue[] = []
  const h1 = inputs.bySub["H1"]
  const q1 = inputs.bySub["Q1"]
  const nineM = inputs.bySub["9M"]
  const fy = inputs.bySub[""] ?? inputs.bySub["FY"]
  if (h1 && q1) {
    out.push(...deriveQ2(h1, q1, inputs.year))
  }
  if (nineM && h1) {
    out.push(...deriveQ3(nineM, h1, inputs.year))
  }
  if (fy && nineM) {
    out.push(...deriveQ4(fy, nineM, inputs.year))
  }
  return out
}

/** Convenience helper — derive a single value from two cumulative inputs. */
export function deriveFromCumulative(
  high: DerivationInput,
  low: DerivationInput,
  code: string,
  targetSub: string,
  year: number,
  formula: string,
): DerivedValue | null {
  const highV = getValue(high, code)
  const lowV = getValue(low, code)
  if (highV === undefined || lowV === undefined) return null
  const value = highV - lowV
  const sus = isSuspiciousDiff(value)
  return {
    metricCode: code,
    value,
    formula,
    sourceMetricCodes: [code],
    sourcePeriods: [high.periodKey, low.periodKey],
    sourceDocumentIds: [...(high.documentIds ?? []), ...(low.documentIds ?? [])],
    sourcePages: [...(high.pages ?? []), ...(low.pages ?? [])],
    isSuspicious: sus.flag,
    suspiciousReason: sus.reason,
    periodKey: `QUARTERLY:${year}:${targetSub}`,
    subPeriod: targetSub,
    periodType: "QUARTERLY",
    fiscalYear: year,
  }
}
