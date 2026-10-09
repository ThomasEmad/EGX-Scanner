// Investor Signal Engine — produces structured, actionable investor signals
// from validated financial facts.
//
// Spec section 20 (Investor-relevant signals):
//   - Growth Quality
//   - Profitability Quality
//   - Balance Sheet Risk
//   - Cash Quality
//   - Earnings Quality
//
// Each signal carries:
//   - dimension (GROWTH / PROFITABILITY / BALANCE_SHEET / CASH / EARNINGS)
//   - direction (IMPROVEMENT / DETERIORATION / STABLE / MIXED / FLAG)
//   - magnitude (numeric change)
//   - tone (positive / negative / warning / neutral)
//   - interpretation (one-line summary)
//   - evidence (the underlying metric values + period keys)
//
// Signals are NOT conclusions or accusations — they are flags for the investor
// to investigate further. Spec section 20: "These are signals to investigate,
// NOT automatic accusations or conclusions."
//
// The engine is PURE (no I/O) — it consumes a PeriodSnapshot[] and emits
// InvestorSignal[]. Persisting signals to the database is the caller's job.

import type { AnalysisContext, SourceValueRef } from "./types"
import { formatValue, formatPercent } from "./types"

export type SignalDimension =
  | "GROWTH"
  | "PROFITABILITY"
  | "BALANCE_SHEET"
  | "CASH"
  | "EARNINGS"

export type SignalDirection =
  | "IMPROVEMENT"
  | "DETERIORATION"
  | "STABLE"
  | "MIXED"
  | "FLAG"

export type SignalTone = "positive" | "negative" | "warning" | "neutral"

export interface InvestorSignal {
  id: string
  dimension: SignalDimension
  /** A short stable code, e.g. "revenue_growth_strong" — useful for grouping */
  code: string
  label: string
  labelAr?: string
  direction: SignalDirection
  tone: SignalTone
  /** Numeric magnitude (e.g. +24.5% growth) */
  magnitude?: number
  /** Optional benchmark (e.g. industry avg, prior period) */
  benchmark?: number
  /** One-line interpretation for an investor */
  interpretation: string
  interpretationAr?: string
  /** Underlying evidence (metric code, period key, value) */
  evidence: SourceValueRef[]
  /** Confidence in the signal — 0..1 */
  confidence: number
  /** Severity for flag-type signals */
  severity?: "info" | "warning" | "critical"
}

let signalCounter = 0
function nextId(prefix: string): string {
  signalCounter += 1
  return `${prefix}-${signalCounter}`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function growthPct(current: number, previous: number): number | null {
  if (previous === 0) return null
  if (Math.sign(previous) !== Math.sign(current)) return null // sign transition — not meaningful
  return ((current - previous) / Math.abs(previous)) * 100
}

function findPriorYear(ctx: AnalysisContext, periodKey: string): string | undefined {
  const [type, yearStr, sub] = periodKey.split(":")
  const priorKey = `${type}:${Number(yearStr) - 1}:${sub ?? ""}`
  return ctx.periods.find((p) => p.periodKey === priorKey)?.periodKey
}

function getValue(ctx: AnalysisContext, metricCode: string, periodKey?: string): number | undefined {
  if (periodKey) {
    const p = ctx.periods.find((p) => p.periodKey === periodKey)
    return p?.values[metricCode]
  }
  if (ctx.periods.length === 0) return undefined
  return ctx.periods[ctx.periods.length - 1].values[metricCode]
}

// ---------------------------------------------------------------------------
// GROWTH QUALITY SIGNALS (spec 20.1)
// ---------------------------------------------------------------------------

function growthQualitySignals(ctx: AnalysisContext): InvestorSignal[] {
  const out: InvestorSignal[] = []
  if (ctx.periods.length < 2) return out
  const latest = ctx.periods[ctx.periods.length - 1]
  const priorKey = findPriorYear(ctx, latest.periodKey)
  if (!priorKey) return out
  const prior = ctx.periods.find((p) => p.periodKey === priorKey)!

  const growthMetrics: Array<{ code: string; label: string; minStrong: number; minHealthy: number }> = [
    { code: "REVENUE", label: "Revenue growth YoY", minStrong: 15, minHealthy: 5 },
    { code: "NET_PROFIT", label: "Net profit growth YoY", minStrong: 20, minHealthy: 8 },
    { code: "OPERATING_INCOME", label: "Operating profit growth YoY", minStrong: 18, minHealthy: 7 },
    { code: "EPS", label: "EPS growth YoY", minStrong: 15, minHealthy: 5 },
    { code: "OPERATING_CASH_FLOW", label: "OCF growth YoY", minStrong: 15, minHealthy: 5 },
  ]

  for (const g of growthMetrics) {
    const current = latest.values[g.code]
    const previous = prior.values[g.code]
    if (current === undefined || previous === undefined) continue
    const growth = growthPct(current, previous)
    if (growth === null) {
      // Sign transition — flag for investigation
      out.push({
        id: nextId("growth"),
        dimension: "GROWTH",
        code: `${g.code.toLowerCase()}_sign_transition`,
        label: `${g.label} — sign transition`,
        direction: "FLAG",
        tone: "warning",
        interpretation: `${g.label} moved from ${formatValue(previous)} to ${formatValue(current)} — sign transition, growth not meaningful as %.`,
        evidence: [
          { metricCode: g.code, periodKey: latest.periodKey, value: current },
          { metricCode: g.code, periodKey: prior.periodKey, value: previous },
        ],
        confidence: 0.95,
        severity: "info",
      })
      continue
    }
    const direction = growth > g.minHealthy ? "IMPROVEMENT" : growth < 0 ? "DETERIORATION" : "STABLE"
    const tone = growth > g.minStrong ? "positive" : growth < 0 ? "negative" : "neutral"
    const interpretation = growth > g.minStrong
      ? `Strong ${g.label} (${formatPercent(growth, { sign: true })})`
      : growth < 0
        ? `${g.label} declined (${formatPercent(growth, { sign: true })})`
        : `${g.label} stable (${formatPercent(growth, { sign: true })})`
    out.push({
      id: nextId("growth"),
      dimension: "GROWTH",
      code: `${g.code.toLowerCase()}_growth_yoy`,
      label: g.label,
      direction,
      tone,
      magnitude: growth,
      interpretation,
      evidence: [
        { metricCode: g.code, periodKey: latest.periodKey, value: current },
        { metricCode: g.code, periodKey: prior.periodKey, value: previous },
      ],
      confidence: 0.9,
      severity: growth < 0 ? "warning" : "info",
    })
  }

  // Growth acceleration / deceleration (3+ periods needed)
  if (ctx.periods.length >= 3) {
    const latest2 = ctx.periods[ctx.periods.length - 1]
    const prior2 = ctx.periods[ctx.periods.length - 2]
    const prior3 = ctx.periods[ctx.periods.length - 3]
    const revLatest = latest2.values.REVENUE
    const revPrior1 = prior2.values.REVENUE
    const revPrior2 = prior3.values.REVENUE
    if (revLatest && revPrior1 && revPrior2) {
      const g1 = growthPct(revLatest, revPrior1)
      const g2 = growthPct(revPrior1, revPrior2)
      if (g1 !== null && g2 !== null) {
        if (g1 > g2 + 3) {
          out.push({
            id: nextId("growth"),
            dimension: "GROWTH",
            code: "revenue_growth_acceleration",
            label: "Revenue growth accelerating",
            direction: "IMPROVEMENT",
            tone: "positive",
            magnitude: g1 - g2,
            interpretation: `Revenue growth accelerated from ${formatPercent(g2)} to ${formatPercent(g1)} — momentum building.`,
            evidence: [
              { metricCode: "REVENUE", periodKey: latest2.periodKey, value: revLatest },
              { metricCode: "REVENUE", periodKey: prior2.periodKey, value: revPrior1 },
              { metricCode: "REVENUE", periodKey: prior3.periodKey, value: revPrior2 },
            ],
            confidence: 0.8,
          })
        } else if (g1 < g2 - 3) {
          out.push({
            id: nextId("growth"),
            dimension: "GROWTH",
            code: "revenue_growth_deceleration",
            label: "Revenue growth decelerating",
            direction: "DETERIORATION",
            tone: "warning",
            magnitude: g1 - g2,
            interpretation: `Revenue growth decelerated from ${formatPercent(g2)} to ${formatPercent(g1)} — momentum slowing.`,
            evidence: [
              { metricCode: "REVENUE", periodKey: latest2.periodKey, value: revLatest },
              { metricCode: "REVENUE", periodKey: prior2.periodKey, value: revPrior1 },
              { metricCode: "REVENUE", periodKey: prior3.periodKey, value: revPrior2 },
            ],
            confidence: 0.8,
            severity: "warning",
          })
        }
      }
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// PROFITABILITY QUALITY SIGNALS (spec 20.2)
// ---------------------------------------------------------------------------

function profitabilityQualitySignals(ctx: AnalysisContext): InvestorSignal[] {
  const out: InvestorSignal[] = []
  if (ctx.periods.length < 2) return out
  const latest = ctx.periods[ctx.periods.length - 1]
  const priorKey = findPriorYear(ctx, latest.periodKey)
  if (!priorKey) return out
  const prior = ctx.periods.find((p) => p.periodKey === priorKey)!
  const revenue = latest.values.REVENUE
  if (!revenue || revenue === 0) return out

  const marginMetrics: Array<{ code: string; numerator: string; label: string }> = [
    { code: "gross_margin", numerator: "GROSS_PROFIT", label: "Gross margin" },
    { code: "operating_margin", numerator: "OPERATING_INCOME", label: "Operating margin" },
    { code: "net_margin", numerator: "NET_PROFIT", label: "Net margin" },
  ]

  for (const m of marginMetrics) {
    const numCurrent = latest.values[m.numerator]
    const numPrior = prior.values[m.numerator]
    const revPrior = prior.values.REVENUE
    if (numCurrent === undefined || numPrior === undefined || !revPrior || revPrior === 0) continue
    const mCurrent = (numCurrent / revenue) * 100
    const mPrior = (numPrior / revPrior) * 100
    const delta = mCurrent - mPrior
    if (Math.abs(delta) < 0.5) continue // ignore sub-50bps changes
    out.push({
      id: nextId("prof"),
      dimension: "PROFITABILITY",
      code: `${m.code}_change`,
      label: `${m.label} ${delta > 0 ? "expansion" : "compression"}`,
      direction: delta > 0 ? "IMPROVEMENT" : "DETERIORATION",
      tone: delta > 0 ? "positive" : "negative",
      magnitude: delta,
      interpretation: `${m.label} ${delta > 0 ? "expanded" : "compressed"} by ${formatPercent(Math.abs(delta))} (${formatPercent(mPrior)} → ${formatPercent(mCurrent)}).`,
      evidence: [
        { metricCode: m.numerator, periodKey: latest.periodKey, value: numCurrent },
        { metricCode: "REVENUE", periodKey: latest.periodKey, value: revenue },
        { metricCode: m.numerator, periodKey: prior.periodKey, value: numPrior },
        { metricCode: "REVENUE", periodKey: prior.periodKey, value: revPrior },
      ],
      confidence: 0.9,
    })
  }

  // Operating leverage: revenue growth vs cost growth
  const revGrowth = growthPct(revenue, prior.values.REVENUE ?? 0)
  const opexCurrent = latest.values.OPERATING_EXPENSES_TOTAL ?? (
    (latest.values.SELLING_EXPENSES ?? 0) + (latest.values.ADMIN_EXPENSES ?? 0) || undefined
  )
  const opexPrior = prior.values.OPERATING_EXPENSES_TOTAL ?? (
    (prior.values.SELLING_EXPENSES ?? 0) + (prior.values.ADMIN_EXPENSES ?? 0) || undefined
  )
  if (revGrowth !== null && opexCurrent && opexPrior) {
    const opexGrowth = growthPct(opexCurrent, opexPrior)
    if (opexGrowth !== null) {
      const leverage = revGrowth - opexGrowth
      if (Math.abs(leverage) > 2) {
        out.push({
          id: nextId("prof"),
          dimension: "PROFITABILITY",
          code: "operating_leverage",
          label: leverage > 0 ? "Positive operating leverage" : "Negative operating leverage",
          direction: leverage > 0 ? "IMPROVEMENT" : "DETERIORATION",
          tone: leverage > 0 ? "positive" : "negative",
          magnitude: leverage,
          interpretation: `Revenue grew ${formatPercent(revGrowth, { sign: true })} vs opex ${formatPercent(opexGrowth, { sign: true })} — ${leverage > 0 ? "positive" : "negative"} operating leverage of ${formatPercent(Math.abs(leverage))}.`,
          evidence: [
            { metricCode: "REVENUE", periodKey: latest.periodKey, value: revenue },
            { metricCode: "REVENUE", periodKey: prior.periodKey, value: prior.values.REVENUE ?? 0 },
            { metricCode: "OPERATING_EXPENSES_TOTAL", periodKey: latest.periodKey, value: opexCurrent },
            { metricCode: "OPERATING_EXPENSES_TOTAL", periodKey: prior.periodKey, value: opexPrior },
          ],
          confidence: 0.85,
        })
      }
    }
  }

  // ROE trend
  const np = latest.values.NET_PROFIT
  const equity = latest.values.TOTAL_EQUITY
  const npPrior = prior.values.NET_PROFIT
  const equityPrior = prior.values.TOTAL_EQUITY
  if (np && equity && equity !== 0 && npPrior && equityPrior && equityPrior !== 0) {
    const roe = (np / equity) * 100
    const roePrior = (npPrior / equityPrior) * 100
    const delta = roe - roePrior
    if (Math.abs(delta) > 1) {
      out.push({
        id: nextId("prof"),
        dimension: "PROFITABILITY",
        code: "roe_trend",
        label: `ROE ${delta > 0 ? "improving" : "declining"}`,
        direction: delta > 0 ? "IMPROVEMENT" : "DETERIORATION",
        tone: delta > 0 ? "positive" : "negative",
        magnitude: delta,
        interpretation: `ROE ${delta > 0 ? "improved" : "declined"} from ${formatPercent(roePrior)} to ${formatPercent(roe)}.`,
        evidence: [
          { metricCode: "NET_PROFIT", periodKey: latest.periodKey, value: np },
          { metricCode: "TOTAL_EQUITY", periodKey: latest.periodKey, value: equity },
          { metricCode: "NET_PROFIT", periodKey: prior.periodKey, value: npPrior },
          { metricCode: "TOTAL_EQUITY", periodKey: prior.periodKey, value: equityPrior },
        ],
        confidence: 0.85,
      })
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// BALANCE SHEET RISK SIGNALS (spec 20.3)
// ---------------------------------------------------------------------------

function balanceSheetRiskSignals(ctx: AnalysisContext): InvestorSignal[] {
  const out: InvestorSignal[] = []
  if (ctx.periods.length < 2) return out
  const latest = ctx.periods[ctx.periods.length - 1]
  const priorKey = findPriorYear(ctx, latest.periodKey)
  if (!priorKey) return out
  const prior = ctx.periods.find((p) => p.periodKey === priorKey)!

  // Debt growth
  const debt = latest.values.TOTAL_DEBT
  const debtPrior = prior.values.TOTAL_DEBT
  if (debt !== undefined && debtPrior !== undefined) {
    const debtGrowth = growthPct(debt, debtPrior)
    if (debtGrowth !== null && Math.abs(debtGrowth) > 5) {
      out.push({
        id: nextId("bs"),
        dimension: "BALANCE_SHEET",
        code: "debt_growth",
        label: debtGrowth > 0 ? "Debt increasing" : "Debt decreasing",
        direction: debtGrowth > 0 ? "DETERIORATION" : "IMPROVEMENT",
        tone: debtGrowth > 0 ? "warning" : "positive",
        magnitude: debtGrowth,
        interpretation: `Total debt ${debtGrowth > 0 ? "increased" : "decreased"} by ${formatPercent(Math.abs(debtGrowth))} (${formatValue(debtPrior)} → ${formatValue(debt)}).`,
        evidence: [
          { metricCode: "TOTAL_DEBT", periodKey: latest.periodKey, value: debt },
          { metricCode: "TOTAL_DEBT", periodKey: prior.periodKey, value: debtPrior },
        ],
        confidence: 0.9,
        severity: debtGrowth > 30 ? "warning" : "info",
      })
    }
  }

  // Leverage (Debt / Equity)
  const equity = latest.values.TOTAL_EQUITY
  if (debt !== undefined && equity !== undefined && equity > 0) {
    const de = debt / equity
    let tone: SignalTone = "neutral"
    let direction: SignalDirection = "STABLE"
    let interpretation = `Debt/Equity ratio: ${de.toFixed(2)}x.`
    let severity: "info" | "warning" | "critical" | undefined
    if (de > 2) {
      tone = "warning"; direction = "DETERIORATION"; severity = "warning"
      interpretation = `High leverage — Debt/Equity ${de.toFixed(2)}x exceeds 2x threshold.`
    } else if (de > 1) {
      tone = "warning"; direction = "STABLE"
      interpretation = `Moderate leverage — Debt/Equity ${de.toFixed(2)}x.`
    } else {
      tone = "positive"; direction = "IMPROVEMENT"
      interpretation = `Conservative leverage — Debt/Equity ${de.toFixed(2)}x.`
    }
    out.push({
      id: nextId("bs"),
      dimension: "BALANCE_SHEET",
      code: "debt_to_equity",
      label: "Debt / Equity ratio",
      direction,
      tone,
      magnitude: de,
      interpretation,
      evidence: [
        { metricCode: "TOTAL_DEBT", periodKey: latest.periodKey, value: debt },
        { metricCode: "TOTAL_EQUITY", periodKey: latest.periodKey, value: equity },
      ],
      confidence: 0.9,
      severity,
    })
  }

  // Liquidity (current ratio)
  const currentAssets = latest.values.CURRENT_ASSETS
  const currentLiab = latest.values.CURRENT_LIABILITIES
  if (currentAssets !== undefined && currentLiab !== undefined && currentLiab > 0) {
    const cr = currentAssets / currentLiab
    let tone: SignalTone = "neutral"
    let direction: SignalDirection = "STABLE"
    let interpretation = `Current ratio: ${cr.toFixed(2)}x.`
    if (cr < 1) {
      tone = "warning"; direction = "DETERIORATION"
      interpretation = `Liquidity pressure — current ratio ${cr.toFixed(2)}x below 1.0.`
    } else if (cr > 2) {
      tone = "positive"; direction = "IMPROVEMENT"
      interpretation = `Strong liquidity — current ratio ${cr.toFixed(2)}x.`
    }
    out.push({
      id: nextId("bs"),
      dimension: "BALANCE_SHEET",
      code: "current_ratio",
      label: "Current ratio",
      direction,
      tone,
      magnitude: cr,
      interpretation,
      evidence: [
        { metricCode: "CURRENT_ASSETS", periodKey: latest.periodKey, value: currentAssets },
        { metricCode: "CURRENT_LIABILITIES", periodKey: latest.periodKey, value: currentLiab },
      ],
      confidence: 0.9,
    })
  }

  // Working capital pressure (receivables growth vs revenue growth)
  const rev = latest.values.REVENUE
  const revPrior = prior.values.REVENUE
  const rec = latest.values.ACCOUNTS_RECEIVABLE
  const recPrior = prior.values.ACCOUNTS_RECEIVABLE
  if (rev && revPrior && rec && recPrior) {
    const revGrowth = growthPct(rev, revPrior)
    const recGrowth = growthPct(rec, recPrior)
    if (revGrowth !== null && recGrowth !== null && recGrowth > revGrowth + 5 && recGrowth > 10) {
      out.push({
        id: nextId("bs"),
        dimension: "BALANCE_SHEET",
        code: "receivables_growing_faster_than_revenue",
        label: "Receivables growing faster than revenue",
        direction: "DETERIORATION",
        tone: "warning",
        magnitude: recGrowth - revGrowth,
        interpretation: `Receivables grew ${formatPercent(recGrowth, { sign: true })} vs revenue ${formatPercent(revGrowth, { sign: true })} — potential collection issue or channel stuffing.`,
        evidence: [
          { metricCode: "ACCOUNTS_RECEIVABLE", periodKey: latest.periodKey, value: rec },
          { metricCode: "ACCOUNTS_RECEIVABLE", periodKey: prior.periodKey, value: recPrior },
          { metricCode: "REVENUE", periodKey: latest.periodKey, value: rev },
          { metricCode: "REVENUE", periodKey: prior.periodKey, value: revPrior },
        ],
        confidence: 0.8,
        severity: "warning",
      })
    }
  }

  // Inventory growth vs sales growth
  const inv = latest.values.INVENTORY
  const invPrior = prior.values.INVENTORY
  const cogs = latest.values.COGS
  const cogsPrior = prior.values.COGS
  if (inv && invPrior && cogs && cogsPrior) {
    const salesGrowth = growthPct(cogs, cogsPrior)
    const invGrowth = growthPct(inv, invPrior)
    if (salesGrowth !== null && invGrowth !== null && invGrowth > salesGrowth + 10 && invGrowth > 15) {
      out.push({
        id: nextId("bs"),
        dimension: "BALANCE_SHEET",
        code: "inventory_growing_faster_than_sales",
        label: "Inventory growing faster than sales",
        direction: "DETERIORATION",
        tone: "warning",
        magnitude: invGrowth - salesGrowth,
        interpretation: `Inventory grew ${formatPercent(invGrowth, { sign: true })} vs COGS ${formatPercent(salesGrowth, { sign: true })} — slow-moving inventory or write-down risk.`,
        evidence: [
          { metricCode: "INVENTORY", periodKey: latest.periodKey, value: inv },
          { metricCode: "INVENTORY", periodKey: prior.periodKey, value: invPrior },
          { metricCode: "COGS", periodKey: latest.periodKey, value: cogs },
          { metricCode: "COGS", periodKey: prior.periodKey, value: cogsPrior },
        ],
        confidence: 0.75,
        severity: "warning",
      })
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// CASH QUALITY SIGNALS (spec 20.4)
// ---------------------------------------------------------------------------

function cashQualitySignals(ctx: AnalysisContext): InvestorSignal[] {
  const out: InvestorSignal[] = []
  if (ctx.periods.length === 0) return out
  const latest = ctx.periods[ctx.periods.length - 1]
  const ocf = latest.values.OPERATING_CASH_FLOW
  const np = latest.values.NET_PROFIT
  const revenue = latest.values.REVENUE
  const capex = latest.values.CAPEX
  const debt = latest.values.TOTAL_DEBT

  // OCF vs Net Income divergence
  if (ocf !== undefined && np !== undefined) {
    if (np > 0 && ocf < np * 0.5) {
      out.push({
        id: nextId("cash"),
        dimension: "CASH",
        code: "ocf_below_net_profit",
        label: "Operating cash flow well below net profit",
        direction: "FLAG",
        tone: "warning",
        magnitude: ocf - np,
        interpretation: `Net profit ${formatValue(np)} but OCF only ${formatValue(ocf)} (${formatPercent((ocf / np) * 100)} of profit) — accrual quality concern.`,
        evidence: [
          { metricCode: "OPERATING_CASH_FLOW", periodKey: latest.periodKey, value: ocf },
          { metricCode: "NET_PROFIT", periodKey: latest.periodKey, value: np },
        ],
        confidence: 0.85,
        severity: "warning",
      })
    } else if (ocf > np * 1.2) {
      out.push({
        id: nextId("cash"),
        dimension: "CASH",
        code: "ocf_above_net_profit",
        label: "Strong cash conversion",
        direction: "IMPROVEMENT",
        tone: "positive",
        magnitude: ocf - np,
        interpretation: `OCF ${formatValue(ocf)} exceeds net profit ${formatValue(np)} by ${formatPercent(((ocf - np) / Math.abs(np)) * 100)} — high-quality earnings.`,
        evidence: [
          { metricCode: "OPERATING_CASH_FLOW", periodKey: latest.periodKey, value: ocf },
          { metricCode: "NET_PROFIT", periodKey: latest.periodKey, value: np },
        ],
        confidence: 0.9,
      })
    }
  }

  // Free Cash Flow generation
  if (ocf !== undefined && capex !== undefined) {
    const fcf = ocf - capex
    if (revenue && revenue !== 0) {
      const fcfMargin = (fcf / revenue) * 100
      if (fcf > 0 && fcfMargin > 5) {
        out.push({
          id: nextId("cash"),
          dimension: "CASH",
          code: "positive_fcf_margin",
          label: "Positive free cash flow margin",
          direction: "IMPROVEMENT",
          tone: "positive",
          magnitude: fcfMargin,
          interpretation: `FCF margin ${formatPercent(fcfMargin)} (FCF ${formatValue(fcf)}) — self-funding business.`,
          evidence: [
            { metricCode: "OPERATING_CASH_FLOW", periodKey: latest.periodKey, value: ocf },
            { metricCode: "CAPEX", periodKey: latest.periodKey, value: capex },
            { metricCode: "REVENUE", periodKey: latest.periodKey, value: revenue },
          ],
          confidence: 0.9,
        })
      } else if (fcf < 0) {
        out.push({
          id: nextId("cash"),
          dimension: "CASH",
          code: "negative_fcf",
          label: "Negative free cash flow",
          direction: "DETERIORATION",
          tone: "warning",
          magnitude: fcf,
          interpretation: `Negative FCF (${formatValue(fcf)}) — OCF ${formatValue(ocf)} does not cover capex ${formatValue(capex)}.`,
          evidence: [
            { metricCode: "OPERATING_CASH_FLOW", periodKey: latest.periodKey, value: ocf },
            { metricCode: "CAPEX", periodKey: latest.periodKey, value: capex },
          ],
          confidence: 0.9,
          severity: "warning",
        })
      }
    }
  }

  // Capex intensity
  if (capex !== undefined && revenue && revenue !== 0) {
    const capexIntensity = (capex / revenue) * 100
    if (capexIntensity > 25) {
      out.push({
        id: nextId("cash"),
        dimension: "CASH",
        code: "high_capex_intensity",
        label: "High capex intensity",
        direction: "FLAG",
        tone: "warning",
        magnitude: capexIntensity,
        interpretation: `Capex/revenue ${formatPercent(capexIntensity)} — capital-intensive business model.`,
        evidence: [
          { metricCode: "CAPEX", periodKey: latest.periodKey, value: capex },
          { metricCode: "REVENUE", periodKey: latest.periodKey, value: revenue },
        ],
        confidence: 0.85,
        severity: "info",
      })
    }
  }

  // FCF / Debt (debt paydown capacity)
  if (ocf !== undefined && capex !== undefined && debt !== undefined && debt > 0) {
    const fcf = ocf - capex
    const fcfToDebt = (fcf / debt) * 100
    if (fcfToDebt > 20) {
      out.push({
        id: nextId("cash"),
        dimension: "CASH",
        code: "strong_debt_paydown_capacity",
        label: "Strong debt paydown capacity",
        direction: "IMPROVEMENT",
        tone: "positive",
        magnitude: fcfToDebt,
        interpretation: `FCF covers ${formatPercent(fcfToDebt)} of total debt — rapid deleveraging possible.`,
        evidence: [
          { metricCode: "OPERATING_CASH_FLOW", periodKey: latest.periodKey, value: ocf },
          { metricCode: "CAPEX", periodKey: latest.periodKey, value: capex },
          { metricCode: "TOTAL_DEBT", periodKey: latest.periodKey, value: debt },
        ],
        confidence: 0.85,
      })
    } else if (fcfToDebt < 0) {
      out.push({
        id: nextId("cash"),
        dimension: "CASH",
        code: "fcf_cannot_cover_debt",
        label: "FCF cannot cover debt",
        direction: "DETERIORATION",
        tone: "warning",
        magnitude: fcfToDebt,
        interpretation: `Negative FCF/debt ratio (${formatPercent(fcfToDebt)}) — debt cannot be repaid from operations.`,
        evidence: [
          { metricCode: "OPERATING_CASH_FLOW", periodKey: latest.periodKey, value: ocf },
          { metricCode: "CAPEX", periodKey: latest.periodKey, value: capex },
          { metricCode: "TOTAL_DEBT", periodKey: latest.periodKey, value: debt },
        ],
        confidence: 0.85,
        severity: "critical",
      })
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// EARNINGS QUALITY SIGNALS (spec 20.5)
// ---------------------------------------------------------------------------

function earningsQualitySignals(ctx: AnalysisContext): InvestorSignal[] {
  const out: InvestorSignal[] = []
  if (ctx.periods.length < 2) return out
  const latest = ctx.periods[ctx.periods.length - 1]
  const priorKey = findPriorYear(ctx, latest.periodKey)
  if (!priorKey) return out
  const prior = ctx.periods.find((p) => p.periodKey === priorKey)!

  // Profit ↑ while OCF ↓ — earnings quality flag
  const np = latest.values.NET_PROFIT
  const npPrior = prior.values.NET_PROFIT
  const ocf = latest.values.OPERATING_CASH_FLOW
  const ocfPrior = prior.values.OPERATING_CASH_FLOW
  if (np && npPrior && ocf && ocfPrior) {
    const npGrowth = growthPct(np, npPrior)
    const ocfGrowth = growthPct(ocf, ocfPrior)
    if (npGrowth !== null && ocfGrowth !== null && npGrowth > 10 && ocfGrowth < -5) {
      out.push({
        id: nextId("eq"),
        dimension: "EARNINGS",
        code: "profit_up_ocf_down",
        label: "Profit up while operating cash flow down",
        direction: "FLAG",
        tone: "warning",
        interpretation: `Net profit grew ${formatPercent(npGrowth, { sign: true })} but OCF declined ${formatPercent(ocfGrowth, { sign: true })} — investigate accrual quality.`,
        evidence: [
          { metricCode: "NET_PROFIT", periodKey: latest.periodKey, value: np },
          { metricCode: "NET_PROFIT", periodKey: prior.periodKey, value: npPrior },
          { metricCode: "OPERATING_CASH_FLOW", periodKey: latest.periodKey, value: ocf },
          { metricCode: "OPERATING_CASH_FLOW", periodKey: prior.periodKey, value: ocfPrior },
        ],
        confidence: 0.85,
        severity: "warning",
      })
    }
  }

  // Profit ↑ while debt ↑ sharply
  const debt = latest.values.TOTAL_DEBT
  const debtPrior = prior.values.TOTAL_DEBT
  if (np && npPrior && debt && debtPrior) {
    const profitGrowth = growthPct(np, npPrior)
    const debtGrowth = growthPct(debt, debtPrior)
    if (profitGrowth !== null && debtGrowth !== null && profitGrowth > 10 && debtGrowth > 20) {
      out.push({
        id: nextId("eq"),
        dimension: "EARNINGS",
        code: "profit_up_debt_up_sharply",
        label: "Profit up while debt increasing sharply",
        direction: "FLAG",
        tone: "warning",
        interpretation: `Profit grew ${formatPercent(profitGrowth, { sign: true })} but debt grew ${formatPercent(debtGrowth, { sign: true })} — investigate whether growth is debt-funded.`,
        evidence: [
          { metricCode: "NET_PROFIT", periodKey: latest.periodKey, value: np },
          { metricCode: "TOTAL_DEBT", periodKey: latest.periodKey, value: debt },
          { metricCode: "TOTAL_DEBT", periodKey: prior.periodKey, value: debtPrior },
        ],
        confidence: 0.8,
        severity: "warning",
      })
    }
  }

  // Revenue ↑ strongly while receivables ↑ much faster
  const rev = latest.values.REVENUE
  const revPrior = prior.values.REVENUE
  const rec = latest.values.ACCOUNTS_RECEIVABLE
  const recPrior = prior.values.ACCOUNTS_RECEIVABLE
  if (rev && revPrior && rec && recPrior) {
    const revGrowth = growthPct(rev, revPrior)
    const recGrowth = growthPct(rec, recPrior)
    if (revGrowth !== null && recGrowth !== null && revGrowth > 10 && recGrowth > revGrowth + 15) {
      out.push({
        id: nextId("eq"),
        dimension: "EARNINGS",
        code: "revenue_up_receivables_much_faster",
        label: "Revenue up while receivables growing much faster",
        direction: "FLAG",
        tone: "warning",
        magnitude: recGrowth - revGrowth,
        interpretation: `Revenue grew ${formatPercent(revGrowth, { sign: true })} but receivables grew ${formatPercent(recGrowth, { sign: true })} — possible channel stuffing or aggressive recognition.`,
        evidence: [
          { metricCode: "REVENUE", periodKey: latest.periodKey, value: rev },
          { metricCode: "REVENUE", periodKey: prior.periodKey, value: revPrior },
          { metricCode: "ACCOUNTS_RECEIVABLE", periodKey: latest.periodKey, value: rec },
          { metricCode: "ACCOUNTS_RECEIVABLE", periodKey: prior.periodKey, value: recPrior },
        ],
        confidence: 0.8,
        severity: "warning",
      })
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// MAIN ENTRY POINT
// ---------------------------------------------------------------------------

export interface InvestorSignalResult {
  companyId: string
  anchorPeriodKey: string | undefined
  signals: InvestorSignal[]
  byDimension: Record<SignalDimension, InvestorSignal[]>
  summary: {
    growth: number
    profitability: number
    balanceSheet: number
    cash: number
    earnings: number
    total: number
    flags: number
    improvements: number
    deteriorations: number
  }
  generatedAt: string
}

export function buildInvestorSignals(ctx: AnalysisContext): InvestorSignalResult {
  const signals: InvestorSignal[] = [
    ...growthQualitySignals(ctx),
    ...profitabilityQualitySignals(ctx),
    ...balanceSheetRiskSignals(ctx),
    ...cashQualitySignals(ctx),
    ...earningsQualitySignals(ctx),
  ]
  const byDimension: Record<SignalDimension, InvestorSignal[]> = {
    GROWTH: [],
    PROFITABILITY: [],
    BALANCE_SHEET: [],
    CASH: [],
    EARNINGS: [],
  }
  for (const s of signals) byDimension[s.dimension].push(s)
  const flags = signals.filter((s) => s.direction === "FLAG").length
  const improvements = signals.filter((s) => s.direction === "IMPROVEMENT").length
  const deteriorations = signals.filter((s) => s.direction === "DETERIORATION").length
  return {
    companyId: ctx.companyId,
    anchorPeriodKey: ctx.anchorPeriodKey ?? ctx.periods[ctx.periods.length - 1]?.periodKey,
    signals,
    byDimension,
    summary: {
      growth: byDimension.GROWTH.length,
      profitability: byDimension.PROFITABILITY.length,
      balanceSheet: byDimension.BALANCE_SHEET.length,
      cash: byDimension.CASH.length,
      earnings: byDimension.EARNINGS.length,
      total: signals.length,
      flags,
      improvements,
      deteriorations,
    },
    generatedAt: new Date().toISOString(),
  }
}
