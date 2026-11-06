// Bank capital intelligence — regulatory capital adequacy and asset quality.
// Only EGX banks publish these lines (CET1 / Tier1 / Tier2 / RWA / NPL on
// TradingView). Returns null for non-banks so the research profile simply
// omits the category instead of showing "insufficient data" noise.
import type { AnalysisResult, AnalysisContext, EvidenceStatement } from "./types"
import { ratioStatement } from "./narrative"

// Basel III floors are framework facts: CET1 4.5%, Tier1 6%, total 8%.
// Egyptian banks typically hold total capital well above that (the CBE's
// Basel III rules push effective minima into the low teens) — the comfort
// threshold below is deliberately conservative.
const CET1_FLOOR = 4.5
const TIER1_FLOOR = 6
const TOTAL_FLOOR = 8
const COMFORT_TOTAL = 12

export function bankCapitalAnalysis(ctx: AnalysisContext): AnalysisResult | null {
  const latest = ctx.periods[ctx.periods.length - 1]
  if (!latest) return null
  const cet1 = latest.values["CET1_CAPITAL"]
  const tier1 = latest.values["TIER1_CAPITAL"]
  const tier2 = latest.values["TIER2_CAPITAL"]
  const rwa = latest.values["RISK_WEIGHTED_ASSETS"]
  const npl = latest.values["NON_PERFORMING_LOANS"]
  const equity = latest.values["TOTAL_EQUITY"]
  // Not a bank (or capital lines absent for the latest period) → omit category.
  if (rwa === undefined || (cet1 === undefined && tier1 === undefined && tier2 === undefined)) return null

  const statements: EvidenceStatement[] = []
  if (cet1 !== undefined && rwa > 0) {
    const pct = (cet1 / rwa) * 100
    statements.push(
      ratioStatement({
        label: "CET1 ratio",
        metricCode: "CET1_CAPITAL",
        value: pct,
        periodKey: latest.periodKey,
        interpretation:
          pct < CET1_FLOOR
            ? `Below the Basel III CET1 floor of ${CET1_FLOOR}% — capital deficiency`
            : pct < 8
              ? "Thin common-equity buffer"
              : `Comfortable — ${(pct - CET1_FLOOR).toFixed(1)}pp above the Basel III floor`,
      })
    )
  }
  if (tier1 !== undefined && rwa > 0) {
    const pct = (tier1 / rwa) * 100
    statements.push(
      ratioStatement({
        label: "Tier 1 ratio",
        metricCode: "TIER1_CAPITAL",
        value: pct,
        periodKey: latest.periodKey,
        interpretation: pct < TIER1_FLOOR ? `Below the Basel III Tier1 floor of ${TIER1_FLOOR}%` : "Above the Basel III Tier1 floor",
      })
    )
  }
  if (tier1 !== undefined && tier2 !== undefined && rwa > 0) {
    const pct = ((tier1 + tier2) / rwa) * 100
    statements.push(
      ratioStatement({
        label: "Total capital adequacy (Tier1+Tier2 / RWA)",
        metricCode: "TIER1_CAPITAL",
        value: pct,
        periodKey: latest.periodKey,
        interpretation:
          pct < TOTAL_FLOOR
            ? `Below the Basel III total floor of ${TOTAL_FLOOR}%`
            : pct < COMFORT_TOTAL
              ? "Above the regulatory floor but below the comfort level Egyptian banks typically maintain"
              : "Comfortably capitalized versus the Basel III floor",
      })
    )
  }
  if (npl !== undefined) {
    statements.push(
      ratioStatement({
        label: "Non-performing loans (stock)",
        metricCode: "NON_PERFORMING_LOANS",
        value: npl,
        periodKey: latest.periodKey,
        ...(equity !== undefined && equity > 0
          ? {
              interpretation: `NPLs equal ${((npl / equity) * 100).toFixed(0)}% of shareholders' equity — ${npl > equity ? "stock of bad debt exceeds equity" : "covered by equity"}.`,
            }
          : {}),
      })
    )
  }
  if (statements.length === 0) return null
  const pctValues: number[] = []
  if (cet1 !== undefined && rwa > 0) pctValues.push((cet1 / rwa) * 100)
  if (tier1 !== undefined && rwa > 0) pctValues.push((tier1 / rwa) * 100)
  if (tier1 !== undefined && tier2 !== undefined && rwa > 0) pctValues.push(((tier1 + tier2) / rwa) * 100)
  const weakest = pctValues.length ? Math.min(...pctValues) : undefined
  const assessment =
    weakest !== undefined && weakest < TOTAL_FLOOR ? "WEAK" : weakest !== undefined && weakest < COMFORT_TOTAL ? "ADEQUATE" : "STRONG"
  return {
    category: "bank_capital",
    title: "Bank Capital & Asset Quality",
    summary: `Regulatory capital ratios versus Basel III floors (CET1 ${CET1_FLOOR}%, Tier1 ${TIER1_FLOOR}%, total ${TOTAL_FLOOR}%).`,
    statements,
    assessment,
    periodKey: latest.periodKey,
  }
}
