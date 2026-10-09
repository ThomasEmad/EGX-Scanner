// Derivation Engine Extensions — additional calculated metrics that go beyond
// the existing calc/advanced.ts. Specifically:
//
//   1. Average-balance variants for ROE/ROA/ROIC (spec section 8):
//        ROE_avg = NetProfit / AvgEquity (not ending equity)
//        ROA_avg = NetProfit / AvgAssets
//
//   2. Free cash flow variants (spec section 5):
//        FCF Margin = FCF / Revenue
//        FCF / Debt = FCF / TotalDebt
//        OCF / Debt = OCF / TotalDebt
//        Cash Conversion = OCF / NetProfit
//        Debt Paydown = PriorDebt − CurrentDebt
//
//   3. Working capital metrics with averages (spec section 6):
//        Working Capital = CA − CL
//        Working Capital / Revenue
//        DSO / DIO / DPO / CCC (using revenue or COGS as appropriate)
//
//   4. Capital allocation metrics (spec section 10):
//        Dividend Payout, Retention Ratio, Capex Intensity,
//        Buyback Activity, Equity Dilution, Share Count Change
//
//   5. Valuation data foundation (spec section 24):
//        Book Value Per Share, EPS, Equity, FCF, Dividends — gathered
//        in a single object for the deterministic valuation engine.
//
// All derivations return MetricResult with status:
//   OK / DATA_UNAVAILABLE / NOT_APPLICABLE / NOT_COMPUTABLE
//
// Spec section 30: Every derived metric must trace back to raw values.
// MetricResult.detail carries the traceability string.

import type { MetricResult } from "../calc/advanced"
import { isFlowMetric, isStockMetric, shouldUseAverageForRatios } from "../ontology/metric-period-types"

const OK = (value: number, detail?: string): MetricResult => ({ status: "OK", value, detail })
const UNAVAILABLE = (detail: string): MetricResult => ({ status: "DATA_UNAVAILABLE", detail })
const NOT_APPLICABLE = (detail: string): MetricResult => ({ status: "NOT_APPLICABLE", detail })
const NOT_COMPUTABLE = (detail: string): MetricResult => ({ status: "NOT_COMPUTABLE", detail })

// ---------------------------------------------------------------------------
// 1. AVERAGE-BALANCE RETURN METRICS (spec section 8)
// ---------------------------------------------------------------------------

export interface PeriodPair {
  current: number | undefined
  previous: number | undefined
}

function averageBalance(current: number | undefined, previous: number | undefined): number | undefined {
  if (current === undefined && previous === undefined) return undefined
  if (previous === undefined) return current // only one period available
  if (current === undefined) return previous
  return (current + previous) / 2
}

/** ROE using average equity (Net Profit / Avg Equity).
 *  Spec section 8: "Use average balance-sheet values when appropriate instead
 *  of blindly using ending balances." */
export function roeAverage(netProfit: number | undefined, currentEquity: number | undefined, previousEquity: number | undefined): MetricResult {
  if (netProfit === undefined || (currentEquity === undefined && previousEquity === undefined)) {
    return UNAVAILABLE("ROE (avg): requires net profit and at least one equity value")
  }
  const avgEquity = averageBalance(currentEquity, previousEquity)
  if (avgEquity === undefined || avgEquity === 0) return NOT_COMPUTABLE("ROE (avg): average equity is zero")
  if (avgEquity < 0) return NOT_APPLICABLE("ROE (avg): average equity is negative — ratio not meaningful")
  const pct = (netProfit! / avgEquity) * 100
  const detail = `ROE_avg = NetProfit ${netProfit!.toExponential(3)} / AvgEquity ${avgEquity.toExponential(3)} (current ${currentEquity?.toExponential(2) ?? "—"}, prior ${previousEquity?.toExponential(2) ?? "—"})`
  return OK(pct, detail)
}

/** ROA using average assets (Net Profit / Avg Total Assets). */
export function roaAverage(netProfit: number | undefined, currentAssets: number | undefined, previousAssets: number | undefined): MetricResult {
  if (netProfit === undefined || (currentAssets === undefined && previousAssets === undefined)) {
    return UNAVAILABLE("ROA (avg): requires net profit and at least one assets value")
  }
  const avgAssets = averageBalance(currentAssets, previousAssets)
  if (avgAssets === undefined || avgAssets === 0) return NOT_COMPUTABLE("ROA (avg): average assets is zero")
  const pct = (netProfit! / avgAssets) * 100
  const detail = `ROA_avg = NetProfit ${netProfit!.toExponential(3)} / AvgAssets ${avgAssets.toExponential(3)}`
  return OK(pct, detail)
}

/** ROIC using average invested capital.
 *  Invested capital = Debt + Equity − Cash.
 *  NOPAT = OperatingIncome × (1 − effectiveTaxRate)
 *  Uses previous period's debt/equity/cash if available. */
export function roicAverage(opts: {
  operatingIncome: number | undefined
  effectiveTaxRate?: number | undefined
  currentDebt: number | undefined
  currentEquity: number | undefined
  currentCash: number | undefined
  previousDebt: number | undefined
  previousEquity: number | undefined
  previousCash: number | undefined
}): MetricResult {
  const { operatingIncome, effectiveTaxRate, currentDebt, currentEquity, currentCash, previousDebt, previousEquity, previousCash } = opts
  if (operatingIncome === undefined) return UNAVAILABLE("ROIC (avg): requires operating income")
  const avgDebt = averageBalance(currentDebt, previousDebt)
  const avgEquity = averageBalance(currentEquity, previousEquity)
  const avgCash = averageBalance(currentCash, previousCash)
  if (avgDebt === undefined || avgEquity === undefined || avgCash === undefined) {
    return UNAVAILABLE("ROIC (avg): requires debt, equity, and cash values")
  }
  const investedCapital = avgDebt + avgEquity - avgCash
  if (investedCapital === 0) return NOT_COMPUTABLE("ROIC (avg): invested capital is zero")
  const taxRate = effectiveTaxRate ?? 0.225 // Egypt standard corporate tax 22.5%
  const nopat = operatingIncome * (1 - taxRate)
  const pct = (nopat / investedCapital) * 100
  const detail = `ROIC_avg = NOPAT ${nopat.toExponential(3)} / AvgInvestedCapital ${investedCapital.toExponential(3)} (AvgDebt ${avgDebt.toExponential(2)} + AvgEquity ${avgEquity.toExponential(2)} − AvgCash ${avgCash.toExponential(2)})`
  return OK(pct, detail)
}

// ---------------------------------------------------------------------------
// 2. FREE CASH FLOW VARIANTS (spec section 5)
// ---------------------------------------------------------------------------

/** FCF Margin = Free Cash Flow / Revenue. */
export function fcfMargin(fcf: number | undefined, revenue: number | undefined): MetricResult {
  if (fcf === undefined || revenue === undefined) return UNAVAILABLE("FCF Margin: requires FCF and revenue")
  if (revenue === 0) return NOT_COMPUTABLE("FCF Margin: revenue is zero")
  const pct = (fcf / revenue) * 100
  return OK(pct, `FCF Margin = FCF ${fcf.toExponential(3)} / Revenue ${revenue.toExponential(3)}`)
}

/** FCF / Total Debt — debt paydown capacity. */
export function fcfToDebt(fcf: number | undefined, totalDebt: number | undefined): MetricResult {
  if (fcf === undefined || totalDebt === undefined) return UNAVAILABLE("FCF/Debt: requires FCF and total debt")
  if (totalDebt === 0) return NOT_COMPUTABLE("FCF/Debt: total debt is zero")
  const pct = (fcf / totalDebt) * 100
  return OK(pct, `FCF/Debt = FCF ${fcf.toExponential(3)} / TotalDebt ${totalDebt.toExponential(3)}`)
}

/** OCF / Total Debt — operating cash flow coverage of debt. */
export function ocfToDebt(ocf: number | undefined, totalDebt: number | undefined): MetricResult {
  if (ocf === undefined || totalDebt === undefined) return UNAVAILABLE("OCF/Debt: requires OCF and total debt")
  if (totalDebt === 0) return NOT_COMPUTABLE("OCF/Debt: total debt is zero")
  const pct = (ocf / totalDebt) * 100
  return OK(pct, `OCF/Debt = OCF ${ocf.toExponential(3)} / TotalDebt ${totalDebt.toExponential(3)}`)
}

/** Cash Conversion = OCF / Net Profit. */
export function cashConversion(ocf: number | undefined, netProfit: number | undefined): MetricResult {
  if (ocf === undefined || netProfit === undefined) return UNAVAILABLE("Cash Conversion: requires OCF and net profit")
  if (netProfit === 0) return NOT_COMPUTABLE("Cash Conversion: net profit is zero")
  if (netProfit < 0) return NOT_APPLICABLE("Cash Conversion: net profit is negative — ratio not meaningful")
  const pct = (ocf / netProfit) * 100
  return OK(pct, `Cash Conversion = OCF ${ocf.toExponential(3)} / NetProfit ${netProfit.toExponential(3)}`)
}

/** Debt Paydown = Prior Debt − Current Debt (positive = deleveraging). */
export function debtPaydown(currentDebt: number | undefined, priorDebt: number | undefined): MetricResult {
  if (currentDebt === undefined || priorDebt === undefined) return UNAVAILABLE("Debt Paydown: requires both periods")
  const delta = priorDebt - currentDebt
  return OK(delta, `Debt Paydown = PriorDebt ${priorDebt.toExponential(3)} − CurrentDebt ${currentDebt.toExponential(3)}`)
}

// ---------------------------------------------------------------------------
// 3. WORKING CAPITAL METRICS (spec section 6)
// ---------------------------------------------------------------------------

/** Working Capital = Current Assets − Current Liabilities. */
export function workingCapital(currentAssets: number | undefined, currentLiabilities: number | undefined): MetricResult {
  if (currentAssets === undefined || currentLiabilities === undefined) {
    return UNAVAILABLE("Working Capital: requires current assets and current liabilities")
  }
  const wc = currentAssets - currentLiabilities
  return OK(wc, `Working Capital = CurrentAssets ${currentAssets.toExponential(3)} − CurrentLiabilities ${currentLiabilities.toExponential(3)}`)
}

/** Working Capital / Revenue — operating efficiency indicator. */
export function workingCapitalToRevenue(currentAssets: number | undefined, currentLiabilities: number | undefined, revenue: number | undefined): MetricResult {
  if (currentAssets === undefined || currentLiabilities === undefined || revenue === undefined) {
    return UNAVAILABLE("WC/Revenue: requires CA, CL, and revenue")
  }
  if (revenue === 0) return NOT_COMPUTABLE("WC/Revenue: revenue is zero")
  const wc = currentAssets - currentLiabilities
  const pct = (wc / revenue) * 100
  return OK(pct, `WC/Revenue = WC ${wc.toExponential(3)} / Revenue ${revenue.toExponential(3)}`)
}

/** Receivables growth YoY. */
export function receivablesGrowth(currentRec: number | undefined, priorRec: number | undefined): MetricResult {
  if (currentRec === undefined || priorRec === undefined) return UNAVAILABLE("Receivables Growth: requires both periods")
  if (priorRec === 0) return NOT_COMPUTABLE("Receivables Growth: prior receivables is zero")
  const pct = ((currentRec - priorRec) / Math.abs(priorRec)) * 100
  return OK(pct, `Receivables Growth = ${(currentRec - priorRec).toExponential(3)} / ${Math.abs(priorRec).toExponential(3)}`)
}

/** Inventory growth YoY. */
export function inventoryGrowth(currentInv: number | undefined, priorInv: number | undefined): MetricResult {
  if (currentInv === undefined || priorInv === undefined) return UNAVAILABLE("Inventory Growth: requires both periods")
  if (priorInv === 0) return NOT_COMPUTABLE("Inventory Growth: prior inventory is zero")
  const pct = ((currentInv - priorInv) / Math.abs(priorInv)) * 100
  return OK(pct, `Inventory Growth = ${(currentInv - priorInv).toExponential(3)} / ${Math.abs(priorInv).toExponential(3)}`)
}

/** Payables growth YoY. */
export function payablesGrowth(currentPay: number | undefined, priorPay: number | undefined): MetricResult {
  if (currentPay === undefined || priorPay === undefined) return UNAVAILABLE("Payables Growth: requires both periods")
  if (priorPay === 0) return NOT_COMPUTABLE("Payables Growth: prior payables is zero")
  const pct = ((currentPay - priorPay) / Math.abs(priorPay)) * 100
  return OK(pct, `Payables Growth = ${(currentPay - priorPay).toExponential(3)} / ${Math.abs(priorPay).toExponential(3)}`)
}

// ---------------------------------------------------------------------------
// 4. CAPITAL ALLOCATION METRICS (spec section 10)
// ---------------------------------------------------------------------------

/** Dividend Payout Ratio = Dividends Paid / Net Profit. */
export function dividendPayout(dividendsPaid: number | undefined, netProfit: number | undefined): MetricResult {
  if (dividendsPaid === undefined || netProfit === undefined) return UNAVAILABLE("Payout Ratio: requires dividends paid and net profit")
  if (netProfit === 0) return NOT_COMPUTABLE("Payout Ratio: net profit is zero")
  if (netProfit < 0) return NOT_APPLICABLE("Payout Ratio: net profit is negative — payout ratio not meaningful")
  const pct = (dividendsPaid / netProfit) * 100
  return OK(pct, `Payout = DividendsPaid ${dividendsPaid.toExponential(3)} / NetProfit ${netProfit.toExponential(3)}`)
}

/** Retention Ratio = 1 − Payout Ratio. */
export function retentionRatio(dividendsPaid: number | undefined, netProfit: number | undefined): MetricResult {
  const payout = dividendPayout(dividendsPaid, netProfit)
  if (payout.status !== "OK") return payout
  return OK(100 - payout.value!, `Retention = 100 − Payout ${payout.value!.toFixed(2)}`)
}

/** Capex Intensity = Capex / Revenue. */
export function capexIntensity(capex: number | undefined, revenue: number | undefined): MetricResult {
  if (capex === undefined || revenue === undefined) return UNAVAILABLE("Capex Intensity: requires capex and revenue")
  if (revenue === 0) return NOT_COMPUTABLE("Capex Intensity: revenue is zero")
  const pct = (capex / revenue) * 100
  return OK(pct, `Capex Intensity = Capex ${capex.toExponential(3)} / Revenue ${revenue.toExponential(3)}`)
}

/** Buyback Activity = Treasury Shares (period end) — measures capital return via buyback. */
export function buybackActivity(treasuryShares: number | undefined): MetricResult {
  if (treasuryShares === undefined) return UNAVAILABLE("Buyback Activity: requires treasury shares value")
  return OK(treasuryShares, `Treasury shares carrying value = ${treasuryShares.toExponential(3)}`)
}

/** Share Count Change = Current Shares − Prior Shares (negative = dilution). */
export function shareCountChange(currentShares: number | undefined, priorShares: number | undefined): MetricResult {
  if (currentShares === undefined || priorShares === undefined) return UNAVAILABLE("Share Count Change: requires both periods")
  const delta = currentShares - priorShares
  const pct = priorShares !== 0 ? (delta / Math.abs(priorShares)) * 100 : undefined
  return OK(delta, `Share Count Change = ${delta.toExponential(3)} (${pct !== undefined ? `${pct.toFixed(2)}%` : "pct undefined"})`)
}

/** Equity Dilution = (current shares − prior shares) / prior shares (positive = dilution). */
export function equityDilution(currentShares: number | undefined, priorShares: number | undefined): MetricResult {
  if (currentShares === undefined || priorShares === undefined) return UNAVAILABLE("Equity Dilution: requires both periods")
  if (priorShares === 0) return NOT_COMPUTABLE("Equity Dilution: prior shares is zero")
  const pct = ((currentShares - priorShares) / Math.abs(priorShares)) * 100
  return OK(pct, pct > 0 ? `Dilution of ${pct.toFixed(2)}%` : pct < 0 ? `Buyback of ${Math.abs(pct).toFixed(2)}%` : "No share count change")
}

// ---------------------------------------------------------------------------
// 5. VALUATION DATA FOUNDATION (spec section 24)
// ---------------------------------------------------------------------------

export interface ValuationData {
  eps?: number
  basicEps?: number
  dilutedEps?: number
  bookValuePerShare?: number
  totalEquity?: number
  sharesOutstanding?: number
  freeCashFlow?: number
  dividendsPaid?: number
  dividendPerShare?: number
  netDebt?: number
  cash?: number
  investments?: number
  // Derived from raw inputs (when available)
  computedEps?: number
  computedBookValue?: number
  computedNetDebt?: number
  computedFreeCashFlow?: number
  // Status flags
  status: "OK" | "PARTIAL" | "INSUFFICIENT"
  missing: string[]
}

/** Gather all reliable valuation inputs from a period's values.
 *  Spec section 24: "The AI must NOT decide a fair value by itself.
 *  Valuation formulas must remain deterministic and configurable."
 *  This function only GATHERS inputs — does not compute valuation. */
export function gatherValuationData(values: Record<string, number>, priorValues?: Record<string, number>): ValuationData {
  const missing: string[] = []
  const eps = values.EPS ?? values.BASIC_EPS
  const basicEps = values.BASIC_EPS
  const dilutedEps = values.DILUTED_EPS
  const bookValuePerShare = values.BOOK_VALUE_PER_SHARE
  const totalEquity = values.TOTAL_EQUITY
  const sharesOutstanding = values.SHARES_OUTSTANDING
  const ocf = values.OPERATING_CASH_FLOW
  const capex = values.CAPEX
  const dividendsPaid = values.DIVIDENDS_PAID
  const dividendPerShare = values.DIVIDEND_PER_SHARE ?? values.DPS_DECLARED
  const debt = values.TOTAL_DEBT
  const cash = values.CASH_AND_EQUIVALENTS
  const investments = values.INVESTMENTS

  // Derived values — computed when inputs are reliable
  let computedEps: number | undefined
  if (values.NET_PROFIT !== undefined && sharesOutstanding !== undefined && sharesOutstanding > 0) {
    computedEps = values.NET_PROFIT / sharesOutstanding
  }
  let computedBookValue: number | undefined
  if (totalEquity !== undefined && sharesOutstanding !== undefined && sharesOutstanding > 0) {
    computedBookValue = totalEquity / sharesOutstanding
  }
  let computedNetDebt: number | undefined
  if (debt !== undefined && cash !== undefined) {
    computedNetDebt = debt - cash
  }
  let computedFreeCashFlow: number | undefined
  if (ocf !== undefined && capex !== undefined) {
    computedFreeCashFlow = ocf - capex
  }

  // Track missing critical inputs
  if (eps === undefined && computedEps === undefined) missing.push("EPS")
  if (bookValuePerShare === undefined && computedBookValue === undefined) missing.push("BookValuePerShare")
  if (totalEquity === undefined) missing.push("TotalEquity")
  if (sharesOutstanding === undefined) missing.push("SharesOutstanding")
  if (computedFreeCashFlow === undefined) missing.push("FreeCashFlow")
  if (computedNetDebt === undefined) missing.push("NetDebt")

  const status: ValuationData["status"] = missing.length === 0 ? "OK" : missing.length <= 2 ? "PARTIAL" : "INSUFFICIENT"

  return {
    eps,
    basicEps,
    dilutedEps,
    bookValuePerShare,
    totalEquity,
    sharesOutstanding,
    freeCashFlow: computedFreeCashFlow,
    dividendsPaid,
    dividendPerShare,
    netDebt: computedNetDebt,
    cash,
    investments,
    computedEps,
    computedBookValue,
    computedNetDebt,
    computedFreeCashFlow,
    status,
    missing,
  }
}

// ---------------------------------------------------------------------------
// 6. EXPLAINABILITY — every number traces back to raw values (spec section 30)
// ---------------------------------------------------------------------------

export interface DerivedMetricExplanation {
  code: string
  label: string
  formula: string
  value: number
  status: "OK" | "DATA_UNAVAILABLE" | "NOT_APPLICABLE" | "NOT_COMPUTABLE"
  /** The traceable inputs — metric code → value */
  inputs: Record<string, number | undefined>
  /** The actual formula computation as a string (e.g. "12.0B − 3.0B = 9.0B") */
  computation?: string
  /** Optional notes about data quality / period / source */
  notes?: string
}

/** Build an explanation for a derived metric. Used by the API to expose
 *  full traceability for every calculated value. */
export function explainDerivedMetric(opts: {
  code: string
  label: string
  formula: string
  result: MetricResult
  inputs: Record<string, number | undefined>
  computation?: string
  notes?: string
}): DerivedMetricExplanation {
  return {
    code: opts.code,
    label: opts.label,
    formula: opts.formula,
    value: opts.result.value ?? 0,
    status: opts.result.status,
    inputs: opts.inputs,
    computation: opts.computation ?? opts.result.detail,
    notes: opts.notes,
  }
}

// ---------------------------------------------------------------------------
// 7. ALL-PERIOD COMPUTATION (extends calc/advanced.ts)
// ---------------------------------------------------------------------------

export interface PeriodValues {
  values: Record<string, number>
  priorValues?: Record<string, number>
}

export interface ExtendedComputedMetrics {
  // Average-balance returns
  roeAverage?: MetricResult
  roaAverage?: MetricResult
  roicAverage?: MetricResult
  // FCF variants
  fcfMargin?: MetricResult
  fcfToDebt?: MetricResult
  ocfToDebt?: MetricResult
  cashConversion?: MetricResult
  debtPaydown?: MetricResult
  // Working capital
  workingCapital?: MetricResult
  workingCapitalToRevenue?: MetricResult
  receivablesGrowth?: MetricResult
  inventoryGrowth?: MetricResult
  payablesGrowth?: MetricResult
  // Capital allocation
  dividendPayout?: MetricResult
  retentionRatio?: MetricResult
  capexIntensity?: MetricResult
  equityDilution?: MetricResult
  // Valuation data
  valuationData?: ValuationData
}

export function computeExtendedMetrics(period: PeriodValues): ExtendedComputedMetrics {
  const v = period.values
  const pv = period.priorValues ?? {}
  return {
    roeAverage: roeAverage(v.NET_PROFIT, v.TOTAL_EQUITY, pv.TOTAL_EQUITY),
    roaAverage: roaAverage(v.NET_PROFIT, v.TOTAL_ASSETS, pv.TOTAL_ASSETS),
    roicAverage: roicAverage({
      operatingIncome: v.OPERATING_INCOME,
      effectiveTaxRate: v.EFFECTIVE_TAX_RATE !== undefined ? v.EFFECTIVE_TAX_RATE / 100 : undefined,
      currentDebt: v.TOTAL_DEBT,
      currentEquity: v.TOTAL_EQUITY,
      currentCash: v.CASH_AND_EQUIVALENTS,
      previousDebt: pv.TOTAL_DEBT,
      previousEquity: pv.TOTAL_EQUITY,
      previousCash: pv.CASH_AND_EQUIVALENTS,
    }),
    fcfMargin: fcfMargin(
      v.OPERATING_CASH_FLOW !== undefined && v.CAPEX !== undefined ? v.OPERATING_CASH_FLOW - v.CAPEX : undefined,
      v.REVENUE,
    ),
    fcfToDebt: fcfToDebt(
      v.OPERATING_CASH_FLOW !== undefined && v.CAPEX !== undefined ? v.OPERATING_CASH_FLOW - v.CAPEX : undefined,
      v.TOTAL_DEBT,
    ),
    ocfToDebt: ocfToDebt(v.OPERATING_CASH_FLOW, v.TOTAL_DEBT),
    cashConversion: cashConversion(v.OPERATING_CASH_FLOW, v.NET_PROFIT),
    debtPaydown: debtPaydown(v.TOTAL_DEBT, pv.TOTAL_DEBT),
    workingCapital: workingCapital(v.CURRENT_ASSETS, v.CURRENT_LIABILITIES),
    workingCapitalToRevenue: workingCapitalToRevenue(v.CURRENT_ASSETS, v.CURRENT_LIABILITIES, v.REVENUE),
    receivablesGrowth: receivablesGrowth(v.ACCOUNTS_RECEIVABLE, pv.ACCOUNTS_RECEIVABLE),
    inventoryGrowth: inventoryGrowth(v.INVENTORY, pv.INVENTORY),
    payablesGrowth: payablesGrowth(v.TRADE_PAYABLES, pv.TRADE_PAYABLES),
    dividendPayout: dividendPayout(v.DIVIDENDS_PAID, v.NET_PROFIT),
    retentionRatio: retentionRatio(v.DIVIDENDS_PAID, v.NET_PROFIT),
    capexIntensity: capexIntensity(v.CAPEX, v.REVENUE),
    equityDilution: equityDilution(v.SHARES_OUTSTANDING, pv.SHARES_OUTSTANDING),
    valuationData: gatherValuationData(v, pv),
  }
}
