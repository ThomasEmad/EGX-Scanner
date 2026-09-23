// Financial Calculation Engine — pure, deterministic and testable functions.
// IMPORTANT NEGATIVE-PROFIT LOGIC (spec #19):
//   Loss = -100, Profit = +100 is NOT reported as "profit increased 200%".
//   Sign transitions are identified as events (LOSS_TO_PROFIT / PROFIT_TO_LOSS),
//   and percentage growth across a sign transition is NOT_APPLICABLE.
// Missing data is NEVER treated as zero (spec #7 / acceptance test 7):
//   missing inputs => DATA_UNAVAILABLE.
// Zero denominators => NOT_COMPUTABLE with explicit reason.

export type MetricValueStatus = "OK" | "DATA_UNAVAILABLE" | "NOT_APPLICABLE" | "NOT_COMPUTABLE"

export interface MetricResult {
  status: MetricValueStatus
  value?: number
  detail?: string
}

const OK = (value: number): MetricResult => ({ status: "OK", value })
const UNAVAILABLE = (detail: string): MetricResult => ({ status: "DATA_UNAVAILABLE", detail })
const NOT_APPLICABLE = (detail: string): MetricResult => ({ status: "NOT_APPLICABLE", detail })
const NOT_COMPUTABLE = (detail: string): MetricResult => ({ status: "NOT_COMPUTABLE", detail })

/** Percentage growth: (current - previous) / |previous| x 100 */
export function growth(current: number | undefined, previous: number | undefined, opts?: { signTransitionDetail?: string }): MetricResult {
  if (current === undefined || previous === undefined || current === null || previous === null) {
    return UNAVAILABLE("Data unavailable for one of the two periods — not treated as zero")
  }
  if (previous === 0) {
    return NOT_COMPUTABLE("Previous period value is zero — percentage growth is undefined")
  }
  if (previous < 0) {
    // e.g. previous is a loss / negative cash flow: percentage growth is misleading.
    // The transition itself is detected as an event instead.
    return NOT_APPLICABLE(
      opts?.signTransitionDetail ??
        "Previous period value is negative — percentage growth is not meaningful; the transition is detected as an event"
    )
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100
  const detail = current < 0 ? "Current value is negative (transition into negative territory)" : undefined
  return { status: "OK", value: pct, detail }
}

/** Margin: part / whole x 100 */
export function margin(part: number | undefined, whole: number | undefined): MetricResult {
  if (part === undefined || whole === undefined) return UNAVAILABLE("Required inputs not available for this period")
  if (whole === 0) return NOT_COMPUTABLE("Denominator (revenue) is zero")
  return OK((part / whole) * 100)
}

/** Generic ratio: numerator / denominator */
export function ratio(numerator: number | undefined, denominator: number | undefined): MetricResult {
  if (numerator === undefined || denominator === undefined) return UNAVAILABLE("Required inputs not available for this period")
  if (denominator === 0) return NOT_COMPUTABLE("Denominator is zero")
  return OK(numerator / denominator)
}

/** Current ratio = current assets / current liabilities (liquidity).
 *  Missing inputs => DATA_UNAVAILABLE; zero denominator => NOT_APPLICABLE (ratio undefined). */
export function currentRatio(currentAssets: number | undefined, currentLiabilities: number | undefined): MetricResult {
  if (currentAssets === undefined || currentLiabilities === undefined) {
    return UNAVAILABLE("Required inputs not available for this period")
  }
  if (currentLiabilities === 0) {
    return NOT_APPLICABLE("Current liabilities are zero — current ratio is undefined")
  }
  return OK(currentAssets / currentLiabilities)
}

/** Book value per share = total equity / shares outstanding.
 *  Shares missing => DATA_UNAVAILABLE; equity missing or shares <= 0 => NOT_APPLICABLE
 *  (a per-share figure without an equity base or a real share count is meaningless). */
export function bookValuePerShare(equity: number | undefined, shares: number | undefined): MetricResult {
  if (shares === undefined) {
    return UNAVAILABLE("Shares outstanding not available (no per-period share count and no company-level share count)")
  }
  if (equity === undefined) {
    return NOT_APPLICABLE("Total equity not available for this period — book value per share is undefined")
  }
  if (shares <= 0) {
    return NOT_APPLICABLE("Shares outstanding is zero or negative — book value per share is undefined")
  }
  return OK(equity / shares)
}

/** Net margin (net profit may be negative — that is valid) */
export function netMargin(netProfit: number | undefined, revenue: number | undefined): MetricResult {
  return margin(netProfit, revenue)
}

/** ROE = net profit / period-end equity x 100 (documented approximation: period-end, not average) */
export function roe(netProfit: number | undefined, equity: number | undefined): MetricResult {
  const r = ratio(netProfit, equity)
  return r.status === "OK" ? OK((r.value as number) * 100) : r
}

/** ROA = net profit / period-end assets x 100 */
export function roa(netProfit: number | undefined, assets: number | undefined): MetricResult {
  const r = ratio(netProfit, assets)
  return r.status === "OK" ? OK((r.value as number) * 100) : r
}

/** EPS = net profit (EGP) / shares outstanding */
export function eps(netProfit: number | undefined, sharesOutstanding: number | undefined): MetricResult {
  if (sharesOutstanding === undefined || sharesOutstanding === 0) {
    return sharesOutstanding === 0
      ? NOT_COMPUTABLE("Shares outstanding is zero")
      : UNAVAILABLE("Shares outstanding not available")
  }
  return ratio(netProfit, sharesOutstanding)
}

/** Debt / Equity ratio (both may be negative in theory; equity<=0 is flagged) */
export function debtToEquity(debt: number | undefined, equity: number | undefined): MetricResult {
  const result = ratio(debt, equity)
  if (result.status === "OK" && equity !== undefined && equity <= 0) {
    return NOT_APPLICABLE("Equity is zero or negative — debt/equity ratio not meaningful")
  }
  return result
}

/** Market-dependent metrics: market price data is NOT connected.
 *  These always return DATA_UNAVAILABLE — never fabricated (spec #26/#27). */
export function marketDependentUnavailable(metricLabel: string, requirement: string): MetricResult {
  return UNAVAILABLE(`${metricLabel} cannot be computed: ${requirement}. Market price data is not connected — reported as DATA_UNAVAILABLE, not fabricated.`)
}

/* ---------------- Market metrics (computed when a price point exists) ----------------
 * A price point is an observed input (MarketPrice row). When none exists, these
 * metrics report DATA_UNAVAILABLE — never fabricated. When earnings are negative
 * or book value is non-positive, the multiple is reported NOT_APPLICABLE with the
 * reason instead of a misleading negative number. */

export function noPriceUnavailable(metricLabel: string): MetricResult {
  return UNAVAILABLE(
    `${metricLabel} cannot be computed: no market price is available for this company. Reported as DATA_UNAVAILABLE, not fabricated.`
  )
}

/** Market capitalization = price x shares outstanding */
export function marketCap(price: number | undefined, sharesOutstanding: number | undefined): MetricResult {
  if (price === undefined) return noPriceUnavailable("Market capitalization")
  if (sharesOutstanding === undefined) return UNAVAILABLE("Shares outstanding not available")
  if (sharesOutstanding <= 0) return NOT_COMPUTABLE("Shares outstanding is zero or negative")
  return OK(price * sharesOutstanding)
}

/** P/B = market cap / shareholders' equity (equivalently price / book value per share) */
export function priceToBook(price: number | undefined, sharesOutstanding: number | undefined, equity: number | undefined): MetricResult {
  if (price === undefined) return noPriceUnavailable("P/B")
  if (sharesOutstanding === undefined) return UNAVAILABLE("Shares outstanding not available")
  if (equity === undefined) return UNAVAILABLE("Shareholders' equity not available for this period")
  if (equity <= 0) return NOT_APPLICABLE("Book value (equity) is zero or negative — P/B is not meaningful")
  return OK((price * sharesOutstanding) / equity)
}

/** P/E = price / EPS (earnings per share of the evaluated period) */
export function priceToEarnings(price: number | undefined, sharesOutstanding: number | undefined, netProfit: number | undefined): MetricResult {
  if (price === undefined) return noPriceUnavailable("P/E")
  if (sharesOutstanding === undefined) return UNAVAILABLE("Shares outstanding not available")
  if (netProfit === undefined) return UNAVAILABLE("Net profit not available for this period")
  if (netProfit <= 0) {
    return NOT_APPLICABLE(
      netProfit === 0
        ? "Earnings are zero — P/E is undefined"
        : "Earnings are negative (a loss) — P/E is not meaningful. Reported as NOT_APPLICABLE, not a negative multiple"
    )
  }
  return OK(price / (netProfit / sharesOutstanding))
}

/**
 * Dividend yield = dividends per share declared/announced in the trailing 12 months / price.
 * Absence of dividend records is DATA_UNAVAILABLE (we cannot claim yield 0 without records);
 * records present but none in the window is a factual 0% yield.
 */
export function dividendYield(
  price: number | undefined,
  dps12m: number | undefined,
  hasDividendRecords: boolean
): MetricResult {
  if (price === undefined) return noPriceUnavailable("Dividend yield")
  if (dps12m === undefined) {
    return hasDividendRecords
      ? UNAVAILABLE("Dividend records exist but none carries a per-share value")
      : UNAVAILABLE("No dividend records available for this company — not treated as zero")
  }
  return OK((dps12m / price) * 100)
}
