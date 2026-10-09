// Financial Health Scoring — converts verified calculated metrics into 0-100
// component scores (profitability, growth, liquidity, leverage, cash quality)
// plus a sector-relative valuation read. Every score is derived ONLY from
// stored CalculatedMetric values; missing inputs yield null ("not available") —
// nothing is fabricated. Deterministic banding, no ML.

import { db } from "@/lib/db"

export type ScoreComponent = {
  key: string
  score: number | null
  inputs: { label: string; value: number | null; unit: string }[]
}

export type CompanyScores = {
  companyId: string
  overall: number | null
  components: ScoreComponent[]
  valuation: {
    price: number | null
    pe: number | null
    pb: number | null
    sectorMedianPe: number | null
    sectorMedianPb: number | null
    peDiscountPct: number | null // positive = cheaper than sector
    pbDiscountPct: number | null
    verdict: "undervalued" | "fair" | "expensive" | "no-price" | null
  } | null
  asOf: string
}

/** Piecewise-linear banding: pairs of [metricValue, score], clamped. */
function band(value: number, points: [number, number][]): number {
  if (points.length === 0) return 0
  if (value <= points[0][0]) return points[0][1]
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    if (value <= x1) return y0 + ((value - x0) / (x1 - x0 || 1)) * (y1 - y0)
  }
  return points[points.length - 1][1]
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)))

/** Latest value per metric code from the preferred statement type. */
async function latestMetrics(companyId: string): Promise<Map<string, { value: number | null; status: string; asOf: string }>> {
  const rows = await db.calculatedMetric.findMany({
    where: { companyId },
    orderBy: [{ fiscalYear: "desc" }, { periodLabel: "desc" }],
  })
  const hasConsolidated = rows.some((r) => r.statementType === "CONSOLIDATED")
  const preferred = hasConsolidated ? "CONSOLIDATED" : "STANDALONE"
  const out = new Map<string, { value: number | null; status: string; asOf: string }>()
  for (const r of rows) {
    if (r.statementType !== preferred) continue
    if (!out.has(r.code)) out.set(r.code, { value: r.value, status: r.valueStatus, asOf: r.calculatedAt.toISOString() })
  }
  return out
}

function pick(m: Map<string, { value: number | null; status: string; asOf: string }>, code: string): number | null {
  const v = m.get(code)
  if (!v || v.status !== "OK" || v.value === null || !Number.isFinite(v.value)) return null
  return v.value
}

export async function computeCompanyScores(companyId: string): Promise<CompanyScores | null> {
  const company = await db.company.findUnique({ where: { id: companyId }, select: { id: true, sector: true } })
  if (!company) return null
  const m = await latestMetrics(companyId)

  // ---- profitability: net margin + ROE + ROA ----
  const nm = pick(m, "net_margin")
  const roe = pick(m, "roe")
  const roa = pick(m, "roa")
  const profParts: (number | null)[] = [
    nm !== null ? band(nm, [[-50, 2], [0, 20], [5, 40], [10, 60], [20, 82], [35, 95], [60, 100]]) : null,
    roe !== null ? band(roe, [[-50, 2], [0, 18], [8, 45], [15, 72], [25, 92], [50, 100]]) : null,
    roa !== null ? band(roa, [[-30, 2], [0, 15], [3, 45], [8, 78], [15, 95]]) : null,
  ]
  const profVals = profParts.filter((x): x is number => x !== null)
  const profitability = profVals.length ? clamp(profVals.reduce((a, b) => a + b, 0) / profVals.length) : null

  // ---- growth: revenue + profit + equity growth ----
  const rg = pick(m, "revenue_growth")
  const pg = pick(m, "profit_growth")
  const eg = pick(m, "equity_growth")
  const growthBand = (g: number) => band(g, [[-50, 2], [-10, 15], [0, 40], [10, 65], [30, 90], [100, 100]])
  const growthParts: (number | null)[] = [rg !== null ? growthBand(rg) : null, pg !== null ? growthBand(pg) : null, eg !== null ? growthBand(eg) : null]
  const growthVals = growthParts.filter((x): x is number => x !== null)
  const growth = growthVals.length ? clamp(growthVals.reduce((a, b) => a + b, 0) / growthVals.length) : null

  // ---- liquidity: current ratio ----
  const cr = pick(m, "current_ratio")
  const liquidity = cr !== null ? clamp(band(cr, [[0.1, 5], [0.5, 25], [1.0, 55], [1.5, 82], [2.5, 92], [5, 88]])) : null

  // ---- leverage: debt/equity (lower is better; banks judged leniently) ----
  const de = pick(m, "debt_to_equity")
  const isBank = company.sector.toLowerCase().includes("bank")
  const leverage = de !== null
    ? clamp(
        isBank
          ? band(de, [[0, 90], [2, 80], [4, 65], [6, 45], [10, 20], [20, 5]])
          : band(de, [[0, 95], [0.5, 85], [1, 68], [2, 42], [4, 15], [8, 2]]),
      )
    : null

  // ---- cash quality: OCF / net profit (cash conversion) ----
  const ocf = pick(m, "operating_cash_flow")
  const np = pick(m, "net_profit")
  let cashQuality: number | null = null
  if (ocf !== null && np !== null) {
    if (np <= 0) {
      // loss-making: positive OCF is a mild positive, negative OCF is bad
      cashQuality = clamp(ocf > 0 ? 45 : 8)
    } else {
      const conv = ocf / np
      cashQuality = clamp(band(conv, [[-1, 3], [0, 10], [0.4, 40], [0.8, 75], [1.2, 92], [3, 85]]))
    }
  } else if (ocf !== null) {
    cashQuality = clamp(ocf > 0 ? 55 : 15)
  }

  const components: ScoreComponent[] = [
    {
      key: "profitability",
      score: profitability,
      inputs: [
        { label: "Net margin", value: nm, unit: "PERCENT" },
        { label: "ROE", value: roe, unit: "PERCENT" },
        { label: "ROA", value: roa, unit: "PERCENT" },
      ],
    },
    {
      key: "growth",
      score: growth,
      inputs: [
        { label: "Revenue growth", value: rg, unit: "PERCENT" },
        { label: "Profit growth", value: pg, unit: "PERCENT" },
        { label: "Equity growth", value: eg, unit: "PERCENT" },
      ],
    },
    { key: "liquidity", score: liquidity, inputs: [{ label: "Current ratio", value: cr, unit: "RATIO" }] },
    { key: "leverage", score: leverage, inputs: [{ label: "Debt / Equity", value: de, unit: "RATIO" }] },
    {
      key: "cash",
      score: cashQuality,
      inputs: [
        { label: "Operating cash flow", value: ocf, unit: "EGP" },
        { label: "Net profit", value: np, unit: "EGP" },
      ],
    },
  ]

  const weighted: [number | null, number][] = [
    [profitability, 0.3],
    [growth, 0.2],
    [liquidity, 0.15],
    [leverage, 0.15],
    [cashQuality, 0.2],
  ]
  let wsum = 0
  let acc = 0
  for (const [sc, w] of weighted) {
    if (sc !== null) {
      acc += sc * w
      wsum += w
    }
  }
  const overall = wsum > 0 ? clamp(acc / wsum) : null

  // ---- valuation: price + P/E + P/B vs sector medians ----
  const staleBefore = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
  const latestPrice = await db.marketPrice.findFirst({
    where: { companyId, asOf: { gte: staleBefore } },
    orderBy: { asOf: "desc" },
    select: { price: true },
  })
  const pe = pick(m, "p_e")
  const pb = pick(m, "p_b")
  let sectorMedianPe: number | null = null
  let sectorMedianPb: number | null = null
  let peDiscountPct: number | null = null
  let pbDiscountPct: number | null = null
  let verdict: "undervalued" | "fair" | "expensive" | "no-price" | null = null

  if (pe !== null || pb !== null) {
    // sector peers with valid multiples
    const peers = await db.company.findMany({ where: { sector: company.sector, isActive: true }, select: { id: true } })
    const peerIds = peers.map((p) => p.id)
    const peerMetrics = await db.calculatedMetric.findMany({
      where: { companyId: { in: peerIds }, code: { in: ["p_e", "p_b"] }, valueStatus: "OK", statementType: "CONSOLIDATED" },
      select: { companyId: true, code: true, value: true, fiscalYear: true, calculatedAt: true },
      orderBy: [{ fiscalYear: "desc" }],
    })
    const latestPerCompany = new Map<string, Map<string, number>>()
    for (const pm of peerMetrics) {
      if (!latestPerCompany.has(pm.companyId)) latestPerCompany.set(pm.companyId, new Map())
      const mm = latestPerCompany.get(pm.companyId)!
      if (!mm.has(pm.code)) mm.set(pm.code, pm.value ?? 0)
    }
    const pes: number[] = []
    const pbs: number[] = []
    for (const mm of latestPerCompany.values()) {
      const v1 = mm.get("p_e")
      const v2 = mm.get("p_b")
      if (v1 !== undefined && v1 >= 1 && v1 < 200) pes.push(v1)
      if (v2 !== undefined && v2 >= 0.15 && v2 < 40) pbs.push(v2)
    }
    const median = (a: number[]) => {
      if (!a.length) return null
      const s = [...a].sort((x, y) => x - y)
      return s[Math.floor(s.length / 2)]
    }
    sectorMedianPe = median(pes)
    sectorMedianPb = median(pbs)
    if (pe !== null && pe >= 1 && sectorMedianPe) peDiscountPct = Math.round((1 - pe / sectorMedianPe) * 1000) / 10
    if (pb !== null && pb >= 0.15 && sectorMedianPb) pbDiscountPct = Math.round((1 - pb / sectorMedianPb) * 1000) / 10
    const discounts: number[] = []
    if (peDiscountPct !== null) discounts.push(peDiscountPct)
    if (pbDiscountPct !== null) discounts.push(pbDiscountPct)
    if (discounts.length) {
      const avg = discounts.reduce((a, b) => a + b, 0) / discounts.length
      verdict = avg >= 15 ? "undervalued" : avg <= -15 ? "expensive" : "fair"
    }
  } else if (!latestPrice) {
    verdict = "no-price"
  }

  return {
    companyId,
    overall,
    components,
    valuation: {
      price: latestPrice?.price ?? null,
      pe,
      pb,
      sectorMedianPe,
      sectorMedianPb,
      peDiscountPct,
      pbDiscountPct,
      verdict,
    },
    asOf: new Date().toISOString(),
  }
}

/** Market-wide valuation screen: discount vs sector medians, strongest discounts first. */
export async function marketValuationScreen(limit = 24) {
  // active filers only: must have REVENUE or NET_PROFIT from the last 2 fiscal years
  const recent = await db.financialValue.findMany({
    where: { metricCode: { in: ["REVENUE", "NET_PROFIT"] }, validationStatus: "VALID", report: { processingStatus: { in: ["VALIDATED", "APPROVED", "EXTRACTED"] }, fiscalYear: { gte: new Date().getFullYear() - 2 } } },
    select: { companyId: true },
  })
  const activeFilers = new Set(recent.map((v) => v.companyId))
  const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true, nameAr: true, nameEn: true, sector: true } })
  const screened = companies.filter((c) => activeFilers.has(c.id))
  const out: {
    companyId: string; ticker: string; name: string; sector: string
    pe: number | null; pb: number | null; sectorMedianPe: number | null
    discountPct: number | null; verdict: string
  }[] = []
  for (const co of screened) {
    const s = await computeCompanyScores(co.id)
    if (!s?.valuation || s.valuation.verdict === "no-price") continue
    const v = s.valuation
    const discounts = [v.peDiscountPct, v.pbDiscountPct].filter((x): x is number => x !== null)
    const discountPct = discounts.length ? Math.round((discounts.reduce((a, b) => a + b, 0) / discounts.length) * 10) / 10 : null
    out.push({
      companyId: co.id,
      ticker: co.ticker,
      name: co.nameAr || co.nameEn,
      sector: co.sector,
      pe: v.pe,
      pb: v.pb,
      sectorMedianPe: v.sectorMedianPe,
      discountPct,
      verdict: v.verdict ?? "fair",
    })
  }
  return out
    .filter((r) => r.discountPct !== null)
    .sort((a, b) => (b.discountPct ?? -999) - (a.discountPct ?? -999))
    .slice(0, limit)
}
