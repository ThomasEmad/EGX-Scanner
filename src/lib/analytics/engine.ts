// PROFESSIONAL-FEATURES-PROMPT.md engines — PURE math, no DB access.
// Implements the exact models specified in the prompt: financial health
// (5 categories, weight redistribution), snowflake normalization (sector
// percentiles, 10 axes), and the 5-criteria undervaluation detector with
// 3-method fair value. All functions take plain metric maps — unit-testable.

export type MetricMap = Record<string, number | null>

// ---------------- shared ----------------

export function clampScore(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, v))
}

/** Piecewise-linear threshold scoring: [threshold, score] pairs ascending. */
export function thresholdScore(value: number, points: [number, number][]): number {
  if (!Number.isFinite(value)) return 0
  if (value <= points[0][0]) return points[0][1]
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    if (value <= x1) return y0 + ((value - x0) / (x1 - x0 || 1)) * (y1 - y0)
  }
  return points[points.length - 1][1]
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

// ---------------- Feature 1: Financial Health (spec §1.3) ----------------
// Percent-unit metrics (margins, ROE, ROA, growth) are PERCENT numbers.
// Ratio metrics (current/quick ratio, D/E, coverage, turnover) are decimals.

export type HealthCategory = {
  name: "profitability" | "liquidity" | "leverage" | "efficiency" | "growth"
  weight: number
  score: number | null
  metrics: { code: string; value: number | null; score: number | null }[]
}

export type HealthResult = {
  total: number | null
  rating: "strong" | "good" | "fair" | "weak" | null
  categories: HealthCategory[]
  coverage: number
  insufficient: boolean
}

export function profitabilityScore(m: MetricMap): number | null {
  const roe = m.ROE ?? null, roa = m.ROA ?? null, nm = m.NET_MARGIN ?? null, gm = m.GROSS_MARGIN ?? null
  const parts: (number | null)[] = []
  if (roe !== null) parts.push(thresholdScore(roe, [[0, 0], [5, 25], [10, 50], [15, 75], [20, 100]]))
  if (roa !== null) parts.push(thresholdScore(roa, [[0, 0], [2, 30], [5, 55], [10, 100]]))
  if (nm !== null) parts.push(thresholdScore(nm, [[0, 0], [5, 35], [10, 60], [15, 80], [25, 100]]))
  if (gm !== null) parts.push(thresholdScore(gm, [[0, 0], [5, 20], [15, 45], [25, 70], [40, 100]]))
  const scored = parts.filter((x): x is number => x !== null)
  return scored.length ? clampScore(avg(scored)!) : null
}

export function liquidityScore(m: MetricMap): number | null {
  const cr = m.CURRENT_RATIO ?? null, qr = m.QUICK_RATIO ?? null
  const parts: (number | null)[] = []
  if (cr !== null) parts.push(thresholdScore(cr, [[0.5, 0], [1.0, 40], [1.5, 70], [2.0, 100]]))
  if (qr !== null) parts.push(thresholdScore(qr, [[0.5, 0], [0.7, 35], [1.0, 70], [1.5, 100]]))
  const scored = parts.filter((x): x is number => x !== null)
  return scored.length ? clampScore(avg(scored)!) : null
}

export function leverageScore(m: MetricMap, isBank: boolean): number | null {
  const de = m.DEBT_TO_EQUITY ?? null
  const ic = m.INTEREST_COVERAGE ?? null
  const parts: (number | null)[] = []
  if (de !== null && de >= 0) {
    // banks run structurally higher leverage — lenient bands per spec §1.8.6
    parts.push(
      isBank
        ? thresholdScore(de, [[2, 85], [4, 65], [6, 40], [10, 10]])
        : thresholdScore(de, [[0.3, 100], [0.5, 80], [1.0, 60], [2.0, 30], [3.0, 0]]),
    )
  }
  if (ic !== null && ic > 0) parts.push(thresholdScore(ic, [[1, 0], [1.5, 25], [3, 55], [5, 80], [10, 100]]))
  const scored = parts.filter((x): x is number => x !== null)
  return scored.length ? clampScore(avg(scored)!) : null
}

export function efficiencyScore(m: MetricMap, isBank: boolean): number | null {
  const at = m.ASSET_TURNOVER ?? null
  const it = m.INVENTORY_TURNOVER ?? null
  if (isBank || it === null) {
    // non-manufacturing path: asset turnover at double weight (spec §1.3.4)
    return at !== null ? clampScore(thresholdScore(at, [[0.2, 0], [0.3, 30], [0.5, 60], [0.7, 80], [1.0, 100]])) : null
  }
  const atScore = at !== null ? thresholdScore(at, [[0.2, 0], [0.3, 30], [0.5, 60], [0.7, 80], [1.0, 100]]) : null
  const itScore = thresholdScore(it, [[2, 0], [4, 30], [6, 60], [8, 80], [12, 100]])
  const parts = [atScore, itScore].filter((x): x is number => x !== null)
  return parts.length ? clampScore(avg(parts)!) : null
}

export function growthScore(m: MetricMap, prior: MetricMap | null): number | null {
  // prefer stored YoY metrics; fall back to computing from prior-year map
  const parts: (number | null)[] = []
  const rev = m.REVENUE_GROWTH_YOY ?? (prior?.REVENUE && m.REVENUE && prior.REVENUE !== 0 ? ((m.REVENUE - prior.REVENUE) / Math.abs(prior.REVENUE)) * 100 : null)
  const ni = m.NET_INCOME_GROWTH_YOY ?? (prior?.NET_PROFIT && m.NET_PROFIT && prior.NET_PROFIT > 0 && m.NET_PROFIT > 0 ? ((m.NET_PROFIT - prior.NET_PROFIT) / prior.NET_PROFIT) * 100 : null)
  if (rev !== null) parts.push(thresholdScore(rev, [[0, 0], [5, 45], [15, 75], [25, 100]]))
  if (ni !== null) parts.push(thresholdScore(ni, [[0, 0], [5, 45], [15, 75], [30, 100]]))
  const scored = parts.filter((x): x is number => x !== null)
  return scored.length ? clampScore(avg(scored)!) : null
}

export function computeFinancialHealth(
  latest: MetricMap,
  opts: { prior?: MetricMap | null; isBank?: boolean } = {},
): HealthResult | null {
  const isBank = opts.isBank ?? false
  const categories: HealthCategory[] = [
    { name: "profitability", weight: 0.25, score: profitabilityScore(latest), metrics: [
      { code: "ROE", value: latest.ROE ?? null, score: null },
      { code: "ROA", value: latest.ROA ?? null, score: null },
      { code: "NET_MARGIN", value: latest.NET_MARGIN ?? null, score: null },
      { code: "GROSS_MARGIN", value: latest.GROSS_MARGIN ?? null, score: null },
    ] },
    { name: "liquidity", weight: 0.20, score: liquidityScore(latest), metrics: [
      { code: "CURRENT_RATIO", value: latest.CURRENT_RATIO ?? null, score: null },
      { code: "QUICK_RATIO", value: latest.QUICK_RATIO ?? null, score: null },
    ] },
    { name: "leverage", weight: 0.20, score: leverageScore(latest, isBank), metrics: [
      { code: "DEBT_TO_EQUITY", value: latest.DEBT_TO_EQUITY ?? null, score: null },
      { code: "INTEREST_COVERAGE", value: latest.INTEREST_COVERAGE ?? null, score: null },
    ] },
    { name: "efficiency", weight: 0.15, score: efficiencyScore(latest, isBank), metrics: [
      { code: "ASSET_TURNOVER", value: latest.ASSET_TURNOVER ?? null, score: null },
      { code: "INVENTORY_TURNOVER", value: latest.INVENTORY_TURNOVER ?? null, score: null },
    ] },
    { name: "growth", weight: 0.20, score: growthScore(latest, opts.prior ?? null), metrics: [
      { code: "REVENUE_GROWTH_YOY", value: latest.REVENUE_GROWTH_YOY ?? null, score: null },
      { code: "NET_INCOME_GROWTH_YOY", value: latest.NET_INCOME_GROWTH_YOY ?? null, score: null },
    ] },
  ]
  const withData = categories.filter((c) => c.score !== null)
  if (withData.length < 3) return { total: null, rating: null, categories, coverage: 0, insufficient: true }

  const totalWeight = withData.reduce((s, c) => s + c.weight, 0)
  const total = Math.round(withData.reduce((s, c) => s + ((c.score as number) * c.weight) / totalWeight, 0))
  const rating = total >= 80 ? "strong" : total >= 60 ? "good" : total >= 40 ? "fair" : "weak"
  const allMetrics = categories.flatMap((c) => c.metrics)
  const coverage = Math.round((allMetrics.filter((x) => x.value !== null).length / allMetrics.length) * 100)
  return { total, rating, categories, coverage, insufficient: false }
}

// ---------------- Feature 2: Snowflake (spec §2.3-2.4) ----------------

export type SnowflakeAxis = {
  axis: string
  value: number | null
  sectorMedian: number | null
  percentile: number | null // 0-100, higher = better regardless of direction
}

/** Percentile of `value` within the sector distribution; direction-aware. */
export function percentileRank(value: number, sectorValues: number[], direction: "higher_better" | "lower_better"): number | null {
  const vals = sectorValues.filter((v) => Number.isFinite(v))
  if (vals.length < 2 || !Number.isFinite(value)) return null
  const below = vals.filter((v) => (direction === "higher_better" ? v < value : v > value)).length
  const equal = vals.filter((v) => v === value).length
  return Math.round(((below + equal / 2) / vals.length) * 100)
}

export function computeSnowflake(
  company: MetricMap,
  sector: MetricMap[], // each peer's metric map
): SnowflakeAxis[] {
  const sectorValues = (code: string): number[] => sector.map((s) => s[code]).filter((v): v is number => v !== null && Number.isFinite(v))
  const axis = (
    name: string,
    code: string,
    direction: "higher_better" | "lower_better",
  ): SnowflakeAxis => {
    const value = company[code] ?? null
    const sv = sectorValues(code)
    const median = sv.length ? [...sv].sort((a, b) => a - b)[Math.floor(sv.length / 2)] : null
    const pct = value !== null ? percentileRank(value, sv, direction) : null
    return { axis: name, value, sectorMedian: median, percentile: pct }
  }
  return [
    axis("value", "P_E", "lower_better"),
    axis("quality", "ROE", "higher_better"),
    axis("growth", "REVENUE_GROWTH_YOY", "higher_better"),
    axis("health", "CURRENT_RATIO", "higher_better"),
    axis("dividend", "DIVIDEND_YIELD", "higher_better"),
    axis("profitability", "NET_MARGIN", "higher_better"),
    axis("efficiency", "ASSET_TURNOVER", "higher_better"),
    axis("momentum", "PRICE_RETURN_1Y", "higher_better"),
    axis("size", "MARKET_CAP", "higher_better"),
  ]
}

/** Framed analysis line per dimension (spec §2.6 rules). */
export function dimensionAnalysis(
  axisName: string,
  value: number | null,
  sectorMedian: number | null,
  percentile: number | null,
  lang: "ar" | "en",
): { tone: "positive" | "neutral" | "cautionary" | "warning"; text: string } | null {
  if (value === null || percentile === null) return null
  const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString("en", { notation: "compact" }) : v.toFixed(2))
  if (lang === "ar") {
    if (percentile >= 75) return { tone: "positive", text: `${axisName}: ${fmt(value)} — أفضل من ${percentile}% من نظيرات القطاع (الوسيط: ${sectorMedian !== null ? fmt(sectorMedian) : "—"}). نقطة قوة relative.` }
    if (percentile >= 50) return { tone: "neutral", text: `${axisName}: ${fmt(value)} — حول المتوسط (أفضل من ${percentile}% من النظيرات).` }
    if (percentile >= 25) return { tone: "cautionary", text: `${axisName}: ${fmt(value)} — أقل من نصف النظيرات (${percentile}% فقط) — يستحق المراجعة.` }
    return { tone: "warning", text: `${axisName}: ${fmt(value)} — في أسفل ${100 - percentile}% من القطاع — نقطة ضعف واضحة.` }
  }
  if (percentile >= 75) return { tone: "positive", text: `${axisName}: ${fmt(value)} — better than ${percentile}% of sector peers (median: ${sectorMedian !== null ? fmt(sectorMedian) : "—"}). A relative strength.` }
  if (percentile >= 50) return { tone: "neutral", text: `${axisName}: ${fmt(value)} — around the middle (better than ${percentile}% of peers).` }
  if (percentile >= 25) return { tone: "cautionary", text: `${axisName}: ${fmt(value)} — below half of peers (${percentile}%) — worth reviewing.` }
  return { tone: "warning", text: `${axisName}: ${fmt(value)} — in the bottom ${100 - percentile}% of the sector — a clear weakness.` }
}

// ---------------- Feature 4: Undervalued (spec §4.3-4.4) ----------------

export type UndervaluationResult = {
  criteriaMet: string[]
  fairValue: number | null
  upside: number | null
  method: string
  flagged: boolean
}

/** A company is flagged when ≥3 of the 5 criteria hold (spec §4.3). */
export function evaluateUndervaluation(
  m: MetricMap & { currentPrice: number | null },
  sector: { medianPE: number | null; medianPB: number | null; yield75th: number | null; medianROE: number | null; evEbitda25th: number | null; medianEvEbitda: number | null },
): UndervaluationResult {
  const criteriaMet: string[] = []
  const price = m.currentPrice
  const pe = m.P_E
  const pb = m.P_B
  const roe = m.ROE
  const dy = m.DIVIDEND_YIELD
  const evEbitda = m.EV_EBITDA
  const eps = m.EPS
  const bvps = m.BOOK_VALUE_PER_SHARE
  const dps = m.DIVIDEND_PER_SHARE

  if (pe !== null && sector.medianPE !== null && pe > 0 && pe < sector.medianPE * 0.85) criteriaMet.push("PE_BELOW_SECTOR_0_85")
  if (pb !== null && pb < 1.0 && sector.medianPB !== null && pb < sector.medianPB * 0.9) criteriaMet.push("PB_BELOW_1_AND_SECTOR_0_9")
  if (dy !== null && sector.yield75th !== null && dy > sector.yield75th) criteriaMet.push("YIELD_ABOVE_SECTOR_75TH")
  if (roe !== null && sector.medianROE !== null && roe > sector.medianROE && pe !== null && sector.medianPE !== null && pe > 0 && pe < sector.medianPE * 0.9) criteriaMet.push("ROE_ABOVE_PE_BELOW")
  if (evEbitda !== null && sector.evEbitda25th !== null && evEbitda > 0 && evEbitda < sector.evEbitda25th) criteriaMet.push("EV_EBITDA_BELOW_25TH")

  // fair value: average of applicable methods (spec §4.4)
  const methods: { value: number; method: string }[] = []
  if (sector.medianPE !== null && eps !== null && eps > 0 && price && price > 0) {
    methods.push({ value: sector.medianPE * eps, method: "P/E relative" })
  }
  if (sector.medianPB !== null && bvps !== null && bvps > 0 && price && price > 0) {
    methods.push({ value: sector.medianPB * bvps, method: "P/B relative" })
  }
  if (dps !== null && dps > 0 && price && price > 0) {
    const requiredReturn = 0.15
    const growthRate = 0.05
    const ddm = (dps * (1 + growthRate)) / (requiredReturn - growthRate)
    methods.push({ value: ddm, method: "DDM" })
  }
  let fairValue: number | null = null
  let upside: number | null = null
  let method = ""
  if (methods.length && price && price > 0) {
    fairValue = Math.round((methods.reduce((s, x) => s + x.value, 0) / methods.length) * 100) / 100
    upside = Math.round(((fairValue - price) / price) * 1000) / 10
    method = methods.map((x) => x.method).join(", ")
  }
  return { criteriaMet, fairValue, upside, method, flagged: criteriaMet.length >= 3 }
}
