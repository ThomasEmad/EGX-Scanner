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
