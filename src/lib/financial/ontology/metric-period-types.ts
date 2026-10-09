// Metric Period Type — distinguishes FLOW metrics (revenue, profit, cash flow)
// from STOCK metrics (assets, liabilities, equity) from POINT-IN-TIME metrics
// (share count). Critical for:
//   - Period arithmetic (Q1+Q2+Q3+Q4 ≈ FY only valid for FLOW metrics)
//   - Average-balance calculations (ROE = NI / AvgEquity, NOT NI / EndEquity)
//   - Growth-rate sign transition rules (loss→profit not meaningful as %)
//
// Spec section 8 (Profitability Engine): "Use average balance-sheet values
// when appropriate instead of blindly using ending balances."
// Spec section 16 (Period Intelligence): "Quarter vs YTD — Q2 = H1 − Q1"

export type MetricPeriodType =
  | "FLOW" // Income statement + cash flow items — additive across periods
  | "STOCK" // Balance sheet items — point-in-time at period end
  | "POINT_IN_TIME" // Share count, headcount — measured at a specific date
  | "RATIO" // Already a ratio — never additive, never averaged
  | "PER_SHARE" // EGP per share — never additive, never scaled by unit
  | "PERCENT" // A percentage (effective tax rate, margin)
  | "COUNT" // A count (shares outstanding, branches, beds)
  | "RATE" // A rate (interest rate, growth rate)

export interface PeriodTypeDef {
  code: MetricPeriodType
  labelEn: string
  labelAr: string
  /** True when the metric is additive across sub-periods (Q1+Q2 ≈ H1). */
  isAdditive: boolean
  /** True when average-of-periods is preferred over ending-balance for ratios. */
  useAverageForRatios: boolean
  /** True when the metric should NEVER be scaled by the report unit. */
  neverScaleByUnit: boolean
}

export const PERIOD_TYPES: PeriodTypeDef[] = [
  { code: "FLOW", labelEn: "Flow", labelAr: "تدفق", isAdditive: true, useAverageForRatios: false, neverScaleByUnit: false },
  { code: "STOCK", labelEn: "Stock", labelAr: "رصيد", isAdditive: false, useAverageForRatios: true, neverScaleByUnit: false },
  { code: "POINT_IN_TIME", labelEn: "Point in Time", labelAr: "لحظي", isAdditive: false, useAverageForRatios: false, neverScaleByUnit: false },
  { code: "RATIO", labelEn: "Ratio", labelAr: "نسبة", isAdditive: false, useAverageForRatios: false, neverScaleByUnit: true },
  { code: "PER_SHARE", labelEn: "Per Share", labelAr: "لكل سهم", isAdditive: false, useAverageForRatios: false, neverScaleByUnit: true },
  { code: "PERCENT", labelEn: "Percent", labelAr: "نسبة مئوية", isAdditive: false, useAverageForRatios: false, neverScaleByUnit: true },
  { code: "COUNT", labelEn: "Count", labelAr: "عدد", isAdditive: false, useAverageForRatios: false, neverScaleByUnit: true },
  { code: "RATE", labelEn: "Rate", labelAr: "معدل", isAdditive: false, useAverageForRatios: false, neverScaleByUnit: true },
]

export const PERIOD_TYPE_MAP: Record<MetricPeriodType, PeriodTypeDef> =
  Object.fromEntries(PERIOD_TYPES.map((p) => [p.code, p])) as Record<MetricPeriodType, PeriodTypeDef>

/** Map metric codes to their period type. Codes not in this map default
 *  based on statement type (income/cash flow → FLOW, balance sheet → STOCK). */
export const METRIC_PERIOD_TYPES: Record<string, MetricPeriodType> = {
  // Flow metrics (income statement + cash flow)
  REVENUE: "FLOW", SALES: "FLOW", NET_SALES: "FLOW", COGS: "FLOW", GROSS_PROFIT: "FLOW",
  OPERATING_INCOME: "FLOW", SELLING_EXPENSES: "FLOW", ADMIN_EXPENSES: "FLOW", RD_EXPENSES: "FLOW",
  OPERATING_EXPENSES_TOTAL: "FLOW", FINANCE_INCOME: "FLOW", FINANCE_COST: "FLOW",
  INTEREST_INCOME: "FLOW", INTEREST_EXPENSE: "FLOW", FX_GAIN_LOSS: "FLOW",
  FAIR_VALUE_GAIN_LOSS: "FLOW", INVESTMENT_INCOME: "FLOW", ASSOCIATES_JV_INCOME: "FLOW",
  OTHER_INCOME: "FLOW", OTHER_EXPENSES: "FLOW", CURRENT_TAX: "FLOW", DEFERRED_TAX: "FLOW",
  INCOME_TAX: "FLOW", PROFIT_BEFORE_TAX: "FLOW", NET_PROFIT: "FLOW", NET_PROFIT_PARENT: "FLOW",
  NET_INTEREST_INCOME: "FLOW",
  // OCI items are FLOW (movements over the period)
  OCI_TOTAL: "FLOW", OCI_FX_TRANSLATION: "FLOW", OCI_FVOCI_MOVEMENTS: "FLOW",
  OCI_ACTUARIAL: "FLOW", OCI_REVALUATION: "FLOW", TOTAL_COMPREHENSIVE_INCOME: "FLOW",
  // Equity movement items are FLOW (movements over the period)
  EQ_MOVEMENT_PROFIT: "FLOW", EQ_MOVEMENT_OCI: "FLOW", EQ_MOVEMENT_DIVIDENDS: "FLOW",
  EQ_MOVEMENT_SHARE_ISSUES: "FLOW", EQ_MOVEMENT_TREASURY: "FLOW", EQ_MOVEMENT_TRANSFERS: "FLOW",
  EQ_MOVEMENT_NCI: "FLOW",
  // Cash flow items are FLOW
  OPERATING_CASH_FLOW: "FLOW", INVESTING_CASH_FLOW: "FLOW", FINANCING_CASH_FLOW: "FLOW",
  NET_CHANGE_IN_CASH: "FLOW", CASH_GENERATED_OPERATIONS: "FLOW", WC_MOVEMENTS: "FLOW",
  TAXES_PAID: "FLOW", INTEREST_PAID_CF: "FLOW", INTEREST_RECEIVED_CF: "FLOW",
  CAPEX: "FLOW", PPE_PURCHASES: "FLOW", INTANGIBLE_PURCHASES: "FLOW",
  INVESTMENTS_PURCHASED: "FLOW", INVESTMENTS_SOLD: "FLOW", ACQUISITIONS_CASH: "FLOW",
  ASSET_SALE_PROCEEDS: "FLOW", DIVIDENDS_RECEIVED_CF: "FLOW",
  DEBT_PROCEEDS: "FLOW", DEBT_REPAYMENTS: "FLOW", LEASE_PAYMENTS: "FLOW",
  DIVIDENDS_PAID: "FLOW", CAPITAL_INCREASES_CASH: "FLOW", TREASURY_TRANSACTIONS_CASH: "FLOW",
  // Cash balances are STOCK (point-in-time)
  OPENING_CASH: "STOCK", CLOSING_CASH: "STOCK",
  // Notes / impairment charges are FLOW (charged in the period)
  IMPAIRMENT_CHARGES: "FLOW", IMPAIRMENT_REVERSALS: "FLOW", GOODWILL_IMPAIRMENT: "FLOW",
  RECEIVABLE_IMPAIRMENT: "FLOW", INVENTORY_IMPAIRMENT: "FLOW",
  PPE_ADDITIONS: "FLOW", PPE_DISPOSALS: "FLOW", DEPRECIATION_EXPENSE: "FLOW",
  AMORTIZATION_EXPENSE: "FLOW", LEASE_EXPENSE: "FLOW",
  TOTAL_DIVIDENDS_DECLARED: "FLOW",
  // Stock metrics (balance sheet)
  TOTAL_ASSETS: "STOCK", TOTAL_LIABILITIES: "STOCK", TOTAL_EQUITY_AND_LIABILITIES: "STOCK",
  TOTAL_EQUITY: "STOCK", EQUITY_PARENT: "STOCK", NON_CONTROLLING_INTERESTS: "STOCK",
  CURRENT_ASSETS: "STOCK", NON_CURRENT_ASSETS: "STOCK",
  CURRENT_LIABILITIES: "STOCK", NON_CURRENT_LIABILITIES: "STOCK",
  CASH_AND_EQUIVALENTS: "STOCK", RESTRICTED_CASH: "STOCK",
  ACCOUNTS_RECEIVABLE: "STOCK", TRADE_RECEIVABLES: "STOCK", OTHER_RECEIVABLES: "STOCK",
  INVENTORY: "STOCK", INVESTMENTS: "STOCK", FINANCIAL_ASSETS: "STOCK",
  FVPL_ASSETS: "STOCK", FVOCI_ASSETS: "STOCK", ASSOCIATES_CARRYING: "STOCK",
  JV_CARRYING: "STOCK", INVESTMENT_PROPERTY: "STOCK", PPE: "STOCK", ROU_ASSETS: "STOCK",
  INTANGIBLE_ASSETS: "STOCK", GOODWILL: "STOCK",
  DEFERRED_TAX_ASSETS: "STOCK", DEFERRED_TAX_LIABILITIES: "STOCK",
  TRADE_PAYABLES: "STOCK", OTHER_PAYABLES: "STOCK", PROVISIONS: "STOCK",
  TAX_PAYABLE: "STOCK", LEASE_LIABILITIES: "STOCK", LEASE_LIABILITIES_CURRENT: "STOCK",
  LEASE_LIABILITIES_NONCURRENT: "STOCK",
  SHORT_TERM_DEBT: "STOCK", LONG_TERM_DEBT: "STOCK", TOTAL_DEBT: "STOCK",
  RETAINED_EARNINGS: "STOCK", SHARE_CAPITAL: "STOCK", SHARE_PREMIUM: "STOCK",
  TREASURY_SHARES: "STOCK", RESERVES: "STOCK", OCI_RESERVES: "STOCK",
  CONSTRUCTION_IN_PROGRESS: "STOCK",
  DEPOSITS: "STOCK", LOANS_NET: "STOCK",
  // Point-in-time counts
  SHARES_OUTSTANDING: "POINT_IN_TIME",
  WEIGHTED_AVG_SHARES: "POINT_IN_TIME", WEIGHTED_AVG_SHARES_DILUTED: "POINT_IN_TIME",
  // Per-share metrics
  EPS: "PER_SHARE", BASIC_EPS: "PER_SHARE", DILUTED_EPS: "PER_SHARE",
  BOOK_VALUE_PER_SHARE: "PER_SHARE", DIVIDEND_PER_SHARE: "PER_SHARE",
  DPS_DECLARED: "PER_SHARE",
  // Percentages / ratios
  EFFECTIVE_TAX_RATE: "PERCENT", PAYOUT_RATIO: "PERCENT",
  // Segment metrics — flow for revenue/profit, stock for assets/liabilities
  SEGMENT_REVENUE: "FLOW", SEGMENT_PROFIT: "FLOW", SEGMENT_CAPEX: "FLOW",
  SEGMENT_ASSETS: "STOCK", SEGMENT_LIABILITIES: "STOCK",
}

export function getMetricPeriodType(metricCode: string, statementType?: string): MetricPeriodType {
  const t = METRIC_PERIOD_TYPES[metricCode]
  if (t) return t
  // Default by statement type
  if (statementType === "INCOME_STATEMENT" || statementType === "CASH_FLOW") return "FLOW"
  if (statementType === "BALANCE_SHEET") return "STOCK"
  return "FLOW" // conservative default — most "OTHER" metrics are flows
}

export function isFlowMetric(metricCode: string, statementType?: string): boolean {
  return getMetricPeriodType(metricCode, statementType) === "FLOW"
}

export function isStockMetric(metricCode: string, statementType?: string): boolean {
  const t = getMetricPeriodType(metricCode, statementType)
  return t === "STOCK" || t === "POINT_IN_TIME"
}

export function isAdditiveMetric(metricCode: string, statementType?: string): boolean {
  return PERIOD_TYPE_MAP[getMetricPeriodType(metricCode, statementType)].isAdditive
}

/** True when ratios using this metric as denominator should use the
 *  average of opening + closing balance (rather than closing only). */
export function shouldUseAverageForRatios(metricCode: string, statementType?: string): boolean {
  return PERIOD_TYPE_MAP[getMetricPeriodType(metricCode, statementType)].useAverageForRatios
}
