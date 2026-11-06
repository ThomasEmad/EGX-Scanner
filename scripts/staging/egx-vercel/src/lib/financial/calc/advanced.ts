// Advanced calculation engine — extends src/lib/financial/calc.ts with a
// richer MetricResult vocabulary and a comprehensive set of growth / margin /
// returns / liquidity / leverage / cash-quality / working-capital / shareholder
// / DuPont functions used by the analysis layer.
//
// SAME RULES as the base calc.ts:
//   • Missing inputs ⇒ DATA_UNAVAILABLE (NEVER zero).
//   • Zero denominators ⇒ NOT_COMPUTABLE with explicit reason.
//   • Sign transitions (loss → profit) ⇒ NOT_APPLICABLE for percentage growth.

export type MetricValueStatus = "OK" | "DATA_UNAVAILABLE" | "NOT_APPLICABLE" | "NOT_COMPUTABLE"

export interface MetricResult {
  status: MetricValueStatus
  value?: number
  detail?: string
}

const OK = (value: number, detail?: string): MetricResult => ({ status: "OK", value, detail })
const UNAVAILABLE = (detail: string): MetricResult => ({ status: "DATA_UNAVAILABLE", detail })
const NOT_APPLICABLE = (detail: string): MetricResult => ({ status: "NOT_APPLICABLE", detail })
const NOT_COMPUTABLE = (detail: string): MetricResult => ({ status: "NOT_COMPUTABLE", detail })

interface InputRef {
  value: number | undefined
  name: string
}

const has = (r: InputRef): boolean => r.value !== undefined && r.value !== null && Number.isFinite(r.value)

/* ----------------------------- Growth ----------------------------- */

export function growthYoY(current: number | undefined, previous: number | undefined, label = "value"): MetricResult {
  if (!has({ value: current, name: "current" }) || !has({ value: previous, name: "previous" })) {
    return UNAVAILABLE(`${label}: data unavailable for one of the two periods`)
  }
  if (previous === undefined) return NOT_COMPUTABLE(`${label}: previous period value unavailable`)
  if (previous === 0) return NOT_COMPUTABLE(`${label}: previous period value is zero — percentage growth undefined`)
  if (previous < 0) {
    return NOT_APPLICABLE(`${label}: previous period value is negative — growth is not meaningful across sign transitions`)
  }
  const cur = current ?? 0
  const pct = ((cur - previous) / Math.abs(previous)) * 100
  return OK(pct, cur < 0 ? "Current value is negative" : undefined)
}

export function growthQoQ(currentQ: number | undefined, previousQ: number | undefined, label = "value"): MetricResult {
  return growthYoY(currentQ, previousQ, label)
}

export function growthYTD(currentCumulative: number | undefined, priorYearSameCumulative: number | undefined, label = "value"): MetricResult {
  return growthYoY(currentCumulative, priorYearSameCumulative, label)
}

export function cagr(begin: number | undefined, end: number | undefined, years: number | undefined, label = "value"): MetricResult {
  if (!has({ value: begin, name: "begin" }) || !has({ value: end, name: "end" }) || !years || years <= 0) {
    return UNAVAILABLE(`${label}: CAGR requires a positive years value and both endpoints`)
  }
  if (begin! <= 0) return NOT_COMPUTABLE(`${label}: beginning value must be positive to compute CAGR`)
  if (end! <= 0) return NOT_APPLICABLE(`${label}: ending value is non-positive — CAGR not meaningful across sign transitions`)
  const ratio = end! / begin!
  if (ratio < 0) return NOT_APPLICABLE(`${label}: ratio is negative — CAGR undefined`)
  const cagrPct = (Math.pow(ratio, 1 / years) - 1) * 100
  return OK(cagrPct)
}

export function epsGrowth(currentEps: number | undefined, previousEps: number | undefined): MetricResult {
  return growthYoY(currentEps, previousEps, "EPS")
}

export function segmentGrowth(currentSegment: number | undefined, previousSegment: number | undefined, segmentName?: string): MetricResult {
  return growthYoY(currentSegment, previousSegment, `segment ${segmentName ?? ""}`.trim())
}

/* ----------------------------- Margins ----------------------------- */

export function grossMargin(grossProfit: number | undefined, revenue: number | undefined): MetricResult {
  if (!has({ value: grossProfit, name: "grossProfit" }) || !has({ value: revenue, name: "revenue" })) {
    return UNAVAILABLE("Gross margin: required inputs not available")
  }
  if (revenue === 0) return NOT_COMPUTABLE("Gross margin: revenue is zero")
  return OK((grossProfit! / revenue!) * 100)
}

export function operatingMargin(operatingIncome: number | undefined, revenue: number | undefined): MetricResult {
  if (!has({ value: operatingIncome, name: "operatingIncome" }) || !has({ value: revenue, name: "revenue" })) {
    return UNAVAILABLE("Operating margin: required inputs not available")
  }
  if (revenue === 0) return NOT_COMPUTABLE("Operating margin: revenue is zero")
  return OK((operatingIncome! / revenue!) * 100)
}

export function ebitMargin(ebit: number | undefined, revenue: number | undefined): MetricResult {
  if (!has({ value: ebit, name: "ebit" }) || !has({ value: revenue, name: "revenue" })) {
    return UNAVAILABLE("EBIT margin: required inputs not available")
  }
  if (revenue === 0) return NOT_COMPUTABLE("EBIT margin: revenue is zero")
  return OK((ebit! / revenue!) * 100)
}

export function ebitdaMargin(ebitda: number | undefined, revenue: number | undefined): MetricResult {
  if (!has({ value: ebitda, name: "ebitda" }) || !has({ value: revenue, name: "revenue" })) {
    return UNAVAILABLE("EBITDA margin: required inputs not available")
  }
  if (revenue === 0) return NOT_COMPUTABLE("EBITDA margin: revenue is zero")
  return OK((ebitda! / revenue!) * 100)
}

export function netMargin(netProfit: number | undefined, revenue: number | undefined): MetricResult {
  if (!has({ value: netProfit, name: "netProfit" }) || !has({ value: revenue, name: "revenue" })) {
    return UNAVAILABLE("Net margin: required inputs not available")
  }
  if (revenue === 0) return NOT_COMPUTABLE("Net margin: revenue is zero")
  return OK((netProfit! / revenue!) * 100)
}

/* ----------------------------- Returns ----------------------------- */

export function roe(netProfit: number | undefined, equity: number | undefined): MetricResult {
  if (!has({ value: netProfit, name: "netProfit" }) || !has({ value: equity, name: "equity" })) {
    return UNAVAILABLE("ROE: required inputs not available")
  }
  if (equity === 0) return NOT_COMPUTABLE("ROE: equity is zero")
  if (equity! < 0) return NOT_APPLICABLE("ROE: equity is negative — ROE not meaningful")
  return OK((netProfit! / equity!) * 100)
}

export function roa(netProfit: number | undefined, assets: number | undefined): MetricResult {
  if (!has({ value: netProfit, name: "netProfit" }) || !has({ value: assets, name: "assets" })) {
    return UNAVAILABLE("ROA: required inputs not available")
  }
  if (assets === 0) return NOT_COMPUTABLE("ROA: assets is zero")
  if (assets! < 0) return NOT_APPLICABLE("ROA: assets is negative")
  return OK((netProfit! / assets!) * 100)
}

export function roic(netProfit: number | undefined, debt: number | undefined, equity: number | undefined, cash: number | undefined): MetricResult {
  if (!has({ value: netProfit, name: "netProfit" }) || !has({ value: debt, name: "debt" }) || !has({ value: equity, name: "equity" })) {
    return UNAVAILABLE("ROIC: required inputs not available")
  }
  const investedCapital = (debt ?? 0) + (equity ?? 0) - (cash ?? 0)
  if (investedCapital === 0) return NOT_COMPUTABLE("ROIC: invested capital is zero")
  if (investedCapital < 0) return NOT_APPLICABLE("ROIC: invested capital is negative")
  return OK((netProfit! / investedCapital) * 100)
}

export function roce(ebit: number | undefined, debt: number | undefined, equity: number | undefined, cash: number | undefined): MetricResult {
  if (!has({ value: ebit, name: "ebit" }) || !has({ value: debt, name: "debt" }) || !has({ value: equity, name: "equity" })) {
    return UNAVAILABLE("ROCE: required inputs not available")
  }
  const capitalEmployed = (debt ?? 0) + (equity ?? 0) - (cash ?? 0)
  if (capitalEmployed === 0) return NOT_COMPUTABLE("ROCE: capital employed is zero")
  if (capitalEmployed < 0) return NOT_APPLICABLE("ROCE: capital employed is negative")
  return OK((ebit! / capitalEmployed) * 100)
}

/* ----------------------------- Liquidity ----------------------------- */

export function currentRatio(currentAssets: number | undefined, currentLiabilities: number | undefined): MetricResult {
  if (!has({ value: currentAssets, name: "currentAssets" }) || !has({ value: currentLiabilities, name: "currentLiabilities" })) {
    return UNAVAILABLE("Current ratio: required inputs not available")
  }
  if (currentLiabilities === 0) return NOT_APPLICABLE("Current ratio: current liabilities are zero")
  return OK(currentAssets! / currentLiabilities!)
}

export function quickRatio(currentAssets: number | undefined, inventory: number | undefined, currentLiabilities: number | undefined): MetricResult {
  if (!has({ value: currentAssets, name: "currentAssets" }) || !has({ value: currentLiabilities, name: "currentLiabilities" })) {
    return UNAVAILABLE("Quick ratio: required inputs not available")
  }
  if (currentLiabilities === 0) return NOT_APPLICABLE("Quick ratio: current liabilities are zero")
  const inv = inventory ?? 0
  const quickAssets = currentAssets! - inv
  if (quickAssets < 0) return NOT_APPLICABLE("Quick ratio: inventory exceeds current assets")
  return OK(quickAssets / currentLiabilities!)
}

export function cashRatio(cash: number | undefined, currentLiabilities: number | undefined): MetricResult {
  if (!has({ value: cash, name: "cash" }) || !has({ value: currentLiabilities, name: "currentLiabilities" })) {
    return UNAVAILABLE("Cash ratio: required inputs not available")
  }
  if (currentLiabilities === 0) return NOT_APPLICABLE("Cash ratio: current liabilities are zero")
  return OK(cash! / currentLiabilities!)
}

/* ----------------------------- Leverage ----------------------------- */

export function debtToEquity(debt: number | undefined, equity: number | undefined): MetricResult {
  if (!has({ value: debt, name: "debt" }) || !has({ value: equity, name: "equity" })) {
    return UNAVAILABLE("Debt/Equity: required inputs not available")
  }
  if (equity === 0) return NOT_COMPUTABLE("Debt/Equity: equity is zero")
  if (equity! < 0) return NOT_APPLICABLE("Debt/Equity: equity is negative")
  return OK(debt! / equity!)
}

export function debtToAssets(debt: number | undefined, assets: number | undefined): MetricResult {
  if (!has({ value: debt, name: "debt" }) || !has({ value: assets, name: "assets" })) {
    return UNAVAILABLE("Debt/Assets: required inputs not available")
  }
  if (assets === 0) return NOT_COMPUTABLE("Debt/Assets: assets is zero")
  if (assets! < 0) return NOT_APPLICABLE("Debt/Assets: assets is negative")
  return OK(debt! / assets!)
}

export function netDebt(debt: number | undefined, cash: number | undefined): MetricResult {
  if (!has({ value: debt, name: "debt" })) {
    return UNAVAILABLE("Net debt: debt not available")
  }
  const c = cash ?? 0
  return OK(debt! - c)
}

export function netDebtToEbitda(netDebtVal: number | undefined, ebitda: number | undefined): MetricResult {
  if (!has({ value: netDebtVal, name: "netDebt" }) || !has({ value: ebitda, name: "ebitda" })) {
    return UNAVAILABLE("Net debt/EBITDA: required inputs not available")
  }
  if (ebitda === 0) return NOT_COMPUTABLE("Net debt/EBITDA: EBITDA is zero")
  if (ebitda! < 0) return NOT_APPLICABLE("Net debt/EBITDA: EBITDA is negative")
  return OK(netDebtVal! / ebitda!)
}

export function interestCoverage(ebit: number | undefined, interestExpense: number | undefined): MetricResult {
  if (!has({ value: ebit, name: "ebit" }) || !has({ value: interestExpense, name: "interestExpense" })) {
    return UNAVAILABLE("Interest coverage: required inputs not available")
  }
  const interest = Math.abs(interestExpense!)
  if (interest === 0) return NOT_APPLICABLE("Interest coverage: interest expense is zero")
  return OK(ebit! / interest)
}

/* ----------------------------- Cash Quality ----------------------------- */

export function cfoToNetIncome(ocf: number | undefined, netProfit: number | undefined): MetricResult {
  if (!has({ value: ocf, name: "ocf" }) || !has({ value: netProfit, name: "netProfit" })) {
    return UNAVAILABLE("CFO/Net income: required inputs not available")
  }
  if (netProfit === 0) return NOT_COMPUTABLE("CFO/Net income: net profit is zero")
  return OK(ocf! / netProfit!)
}

export function freeCashFlow(ocf: number | undefined, capex: number | undefined): MetricResult {
  if (!has({ value: ocf, name: "ocf" }) || !has({ value: capex, name: "capex" })) {
    return UNAVAILABLE("Free cash flow: required inputs not available")
  }
  return OK(ocf! - Math.abs(capex!))
}

export function fcfMargin(fcf: number | undefined, revenue: number | undefined): MetricResult {
  if (!has({ value: fcf, name: "fcf" }) || !has({ value: revenue, name: "revenue" })) {
    return UNAVAILABLE("FCF margin: required inputs not available")
  }
  if (revenue === 0) return NOT_COMPUTABLE("FCF margin: revenue is zero")
  return OK((fcf! / revenue!) * 100)
}

export function cashConversion(ocf: number | undefined, ebitda: number | undefined): MetricResult {
  if (!has({ value: ocf, name: "ocf" }) || !has({ value: ebitda, name: "ebitda" })) {
    return UNAVAILABLE("Cash conversion: required inputs not available")
  }
  if (ebitda === 0) return NOT_COMPUTABLE("Cash conversion: EBITDA is zero")
  if (ebitda! < 0) return NOT_APPLICABLE("Cash conversion: EBITDA is negative")
  return OK((ocf! / ebitda!) * 100)
}

/* ----------------------------- Working Capital ----------------------------- */

const DAYS_IN_YEAR = 365

export function dso(receivables: number | undefined, revenue: number | undefined): MetricResult {
  if (!has({ value: receivables, name: "receivables" }) || !has({ value: revenue, name: "revenue" })) {
    return UNAVAILABLE("DSO: required inputs not available")
  }
  if (revenue === 0) return NOT_COMPUTABLE("DSO: revenue is zero")
  return OK((receivables! / revenue!) * DAYS_IN_YEAR)
}

export function dio(inventory: number | undefined, cogs: number | undefined): MetricResult {
  if (!has({ value: inventory, name: "inventory" }) || !has({ value: cogs, name: "cogs" })) {
    return UNAVAILABLE("DIO: required inputs not available")
  }
  if (cogs === 0) return NOT_COMPUTABLE("DIO: COGS is zero")
  return OK((inventory! / Math.abs(cogs!)) * DAYS_IN_YEAR)
}

export function dpo(payables: number | undefined, cogs: number | undefined): MetricResult {
  if (!has({ value: payables, name: "payables" }) || !has({ value: cogs, name: "cogs" })) {
    return UNAVAILABLE("DPO: required inputs not available")
  }
  if (cogs === 0) return NOT_COMPUTABLE("DPO: COGS is zero")
  return OK((payables! / Math.abs(cogs!)) * DAYS_IN_YEAR)
}

export function cashConversionCycle(dsoVal: number | undefined, dioVal: number | undefined, dpoVal: number | undefined): MetricResult {
  if (!has({ value: dsoVal, name: "dso" }) || !has({ value: dioVal, name: "dio" }) || !has({ value: dpoVal, name: "dpo" })) {
    return UNAVAILABLE("Cash conversion cycle: required inputs not available")
  }
  return OK(dsoVal! + dioVal! - dpoVal!)
}

/* ----------------------------- Shareholder ----------------------------- */

export function eps(netProfit: number | undefined, sharesOutstanding: number | undefined): MetricResult {
  if (!has({ value: netProfit, name: "netProfit" }) || !has({ value: sharesOutstanding, name: "shares" })) {
    return UNAVAILABLE("EPS: required inputs not available")
  }
  if (sharesOutstanding === 0) return NOT_COMPUTABLE("EPS: shares outstanding is zero")
  if (sharesOutstanding! < 0) return NOT_APPLICABLE("EPS: shares outstanding is negative")
  return OK(netProfit! / sharesOutstanding!)
}

export function dps(totalDividends: number | undefined, sharesOutstanding: number | undefined): MetricResult {
  if (!has({ value: totalDividends, name: "totalDividends" }) || !has({ value: sharesOutstanding, name: "shares" })) {
    return UNAVAILABLE("DPS: required inputs not available")
  }
  if (sharesOutstanding === 0) return NOT_COMPUTABLE("DPS: shares outstanding is zero")
  return OK(totalDividends! / sharesOutstanding!)
}

export function payoutRatio(totalDividends: number | undefined, netProfit: number | undefined): MetricResult {
  if (!has({ value: totalDividends, name: "totalDividends" }) || !has({ value: netProfit, name: "netProfit" })) {
    return UNAVAILABLE("Payout ratio: required inputs not available")
  }
  if (netProfit === 0) return NOT_COMPUTABLE("Payout ratio: net profit is zero")
  if (netProfit! < 0) return NOT_APPLICABLE("Payout ratio: net profit is negative")
  return OK((totalDividends! / netProfit!) * 100)
}

export function bookValuePerShare(equity: number | undefined, sharesOutstanding: number | undefined): MetricResult {
  if (!has({ value: equity, name: "equity" }) || !has({ value: sharesOutstanding, name: "shares" })) {
    return UNAVAILABLE("Book value per share: required inputs not available")
  }
  if (sharesOutstanding === 0) return NOT_COMPUTABLE("Book value per share: shares outstanding is zero")
  if (sharesOutstanding! < 0) return NOT_APPLICABLE("Book value per share: shares outstanding is negative")
  return OK(equity! / sharesOutstanding!)
}

/* ----------------------------- DuPont 3-step ----------------------------- */

export interface DuPontDecompositionResult {
  netMargin: MetricResult
  assetTurnover: MetricResult
  financialLeverage: MetricResult
  roe: MetricResult
  detail: string
}

export function duPontDecomposition(
  netProfit: number | undefined,
  revenue: number | undefined,
  assets: number | undefined,
  equity: number | undefined,
): DuPontDecompositionResult {
  const netMarginRes = netMargin(netProfit, revenue)
  const assetTurnoverRes = (() => {
    if (!has({ value: revenue, name: "revenue" }) || !has({ value: assets, name: "assets" })) {
      return UNAVAILABLE("Asset turnover: required inputs not available")
    }
    if (assets === 0) return NOT_COMPUTABLE("Asset turnover: assets is zero")
    if (assets! < 0) return NOT_APPLICABLE("Asset turnover: assets is negative")
    return OK(revenue! / assets!)
  })()
  const financialLeverageRes = (() => {
    if (!has({ value: assets, name: "assets" }) || !has({ value: equity, name: "equity" })) {
      return UNAVAILABLE("Financial leverage: required inputs not available")
    }
    if (equity === 0) return NOT_COMPUTABLE("Financial leverage: equity is zero")
    if (equity! < 0) return NOT_APPLICABLE("Financial leverage: equity is negative")
    return OK(assets! / equity!)
  })()
  const roeRes = roe(netProfit, equity)
  let detail = "DuPont decomposition (3-step): ROE = Net margin × Asset turnover × Financial leverage. "
  if (netMarginRes.status === "OK" && assetTurnoverRes.status === "OK" && financialLeverageRes.status === "OK") {
    const implied = netMarginRes.value! / 100 * assetTurnoverRes.value! * financialLeverageRes.value! * 100
    detail += `Implied ROE = ${(netMarginRes.value!).toFixed(2)}% × ${(assetTurnoverRes.value!).toFixed(2)}x × ${(financialLeverageRes.value!).toFixed(2)}x = ${implied.toFixed(2)}%.`
  } else {
    detail += "One or more components are unavailable / non-applicable — implied ROE cannot be computed."
  }
  return { netMargin: netMarginRes, assetTurnover: assetTurnoverRes, financialLeverage: financialLeverageRes, roe: roeRes, detail }
}

/* ----------------------------- Aggregate per period ----------------------------- */

export interface PeriodValues {
  revenue?: number
  netProfit?: number
  grossProfit?: number
  operatingIncome?: number
  ebit?: number
  ebitda?: number
  totalAssets?: number
  totalEquity?: number
  totalDebt?: number
  cashAndEquivalents?: number
  currentAssets?: number
  currentLiabilities?: number
  inventory?: number
  tradeReceivables?: number
  tradePayables?: number
  cogs?: number
  operatingCashFlow?: number
  capex?: number
  sharesOutstanding?: number
  totalDividends?: number
  interestExpense?: number
  preferredStatementType?: string
}

export interface ComputedMetrics {
  revenueGrowth?: MetricResult
  profitGrowth?: MetricResult
  grossMargin?: MetricResult
  operatingMargin?: MetricResult
  netMargin?: MetricResult
  roe?: MetricResult
  roa?: MetricResult
  roic?: MetricResult
  roce?: MetricResult
  currentRatio?: MetricResult
  quickRatio?: MetricResult
  cashRatio?: MetricResult
  debtToEquity?: MetricResult
  debtToAssets?: MetricResult
  netDebt?: MetricResult
  interestCoverage?: MetricResult
  cfoToNetIncome?: MetricResult
  freeCashFlow?: MetricResult
  fcfMargin?: MetricResult
  cashConversion?: MetricResult
  dso?: MetricResult
  dio?: MetricResult
  dpo?: MetricResult
  cashConversionCycle?: MetricResult
  eps?: MetricResult
  payoutRatio?: MetricResult
  bookValuePerShare?: MetricResult
  duPont?: DuPontDecompositionResult
}

/** Compute every applicable metric for a single period (current + previous period
 *  data needed for growth metrics). */
export function computeAllForPeriod(current: PeriodValues, previous?: PeriodValues): ComputedMetrics {
  const out: ComputedMetrics = {}
  if (previous) {
    out.revenueGrowth = growthYoY(current.revenue, previous.revenue, "Revenue")
    out.profitGrowth = growthYoY(current.netProfit, previous.netProfit, "Net profit")
  }
  out.grossMargin = grossMargin(current.grossProfit, current.revenue)
  out.operatingMargin = operatingMargin(current.operatingIncome, current.revenue)
  out.netMargin = netMargin(current.netProfit, current.revenue)
  out.roe = roe(current.netProfit, current.totalEquity)
  out.roa = roa(current.netProfit, current.totalAssets)
  out.roic = roic(current.netProfit, current.totalDebt, current.totalEquity, current.cashAndEquivalents)
  out.roce = roce(current.ebit ?? current.operatingIncome, current.totalDebt, current.totalEquity, current.cashAndEquivalents)
  out.currentRatio = currentRatio(current.currentAssets, current.currentLiabilities)
  out.quickRatio = quickRatio(current.currentAssets, current.inventory, current.currentLiabilities)
  out.cashRatio = cashRatio(current.cashAndEquivalents, current.currentLiabilities)
  out.debtToEquity = debtToEquity(current.totalDebt, current.totalEquity)
  out.debtToAssets = debtToAssets(current.totalDebt, current.totalAssets)
  out.netDebt = netDebt(current.totalDebt, current.cashAndEquivalents)
  out.interestCoverage = interestCoverage(current.ebit ?? current.operatingIncome, current.interestExpense)
  out.cfoToNetIncome = cfoToNetIncome(current.operatingCashFlow, current.netProfit)
  out.freeCashFlow = freeCashFlow(current.operatingCashFlow, current.capex)
  out.fcfMargin = fcfMargin(out.freeCashFlow.value, current.revenue)
  out.cashConversion = cashConversion(current.operatingCashFlow, current.ebitda)
  out.dso = dso(current.tradeReceivables, current.revenue)
  out.dio = dio(current.inventory, current.cogs)
  out.dpo = dpo(current.tradePayables, current.cogs)
  if (out.dso.status === "OK" && out.dio.status === "OK" && out.dpo.status === "OK") {
    out.cashConversionCycle = cashConversionCycle(out.dso.value, out.dio.value, out.dpo.value)
  } else {
    out.cashConversionCycle = UNAVAILABLE("Cash conversion cycle: at least one component (DSO/DIO/DPO) is unavailable")
  }
  out.eps = eps(current.netProfit, current.sharesOutstanding)
  out.payoutRatio = payoutRatio(current.totalDividends, current.netProfit)
  out.bookValuePerShare = bookValuePerShare(current.totalEquity, current.sharesOutstanding)
  out.duPont = duPontDecomposition(current.netProfit, current.revenue, current.totalAssets, current.totalEquity)
  return out
}
