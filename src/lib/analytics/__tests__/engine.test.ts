import { describe, expect, it } from "vitest"
import {
  thresholdScore, percentileRank, computeFinancialHealth,
  profitabilityScore, liquidityScore, leverageScore, efficiencyScore,
  evaluateUndervaluation, computeSnowflake, dimensionAnalysis,
} from "../engine"

describe("thresholdScore piecewise linear", () => {
  it("interpolates within and clamps beyond the bands", () => {
    expect(thresholdScore(0, [[0, 0], [5, 25], [10, 50]])).toBe(0)
    expect(thresholdScore(2.5, [[0, 0], [5, 25], [10, 50]])).toBe(12.5)
    expect(thresholdScore(10, [[0, 0], [5, 25], [10, 50]])).toBe(50)
    expect(thresholdScore(15, [[0, 0], [5, 25], [10, 50]])).toBe(50)
  })
})

describe("category scores", () => {
  it("profitability: all 4 metrics", () => {
    const s = profitabilityScore({ ROE: 18.4, ROA: 8.2, NET_MARGIN: 22, GROSS_MARGIN: 41 })
    expect(s).not.toBeNull()
    expect(s!).toBeGreaterThan(80)
    expect(s!).toBeLessThanOrEqual(100)
  })

  it("profitability: 2 metrics missing still scores", () => {
    const s = profitabilityScore({ ROE: 18.4, NET_MARGIN: 22 })
    expect(s).not.toBeNull()
    expect(s!).toBeGreaterThan(50)
  })

  it("leverage: negative equity / D/E below zero uses interest coverage only", () => {
    const s = leverageScore({ DEBT_TO_EQUITY: -0.5, INTEREST_COVERAGE: 6 }, false)
    expect(s).not.toBeNull()
    expect(s!).toBeGreaterThan(40)
    expect(s!).toBeLessThanOrEqual(100)
  })

  it("banks skip inventory turnover (efficiency)", () => {
    const bank = efficiencyScore({ ASSET_TURNOVER: 0.5, INVENTORY_TURNOVER: 5 }, true)
    const mfg = efficiencyScore({ ASSET_TURNOVER: 0.5, INVENTORY_TURNOVER: 5 }, false)
    expect(bank).not.toBeNull()
    expect(mfg).not.toBeNull()
    expect(bank).not.toBe(mfg)
  })

  it("liquidity: quick ratio only (current-ratio metric removed from the product)", () => {
    const s = liquidityScore({ CURRENT_RATIO: 1.5, QUICK_RATIO: 1.0 })
    expect(s).toBe(70) // thresholdScore(1.0, [[0.5,0],[0.7,35],[1.0,70],[1.5,100]])
  })
})

describe("computeFinancialHealth", () => {
  it("<3 categories with data → insufficient", () => {
    const r = computeFinancialHealth({ REVENUE: 100 })
    expect(r).not.toBeNull()
    expect(r!.insufficient).toBe(true)
    expect(r!.total).toBeNull()
  })

  it("full data → weighted total with redistribution", () => {
    const r = computeFinancialHealth({
      ROE: 18, ROA: 8, NET_MARGIN: 16, GROSS_MARGIN: 30,
      QUICK_RATIO: 1.1,
      DEBT_TO_EQUITY: 0.4, INTEREST_COVERAGE: 8,
      ASSET_TURNOVER: 0.8, INVENTORY_TURNOVER: 9,
    })
    expect(r).not.toBeNull()
    expect(r!.insufficient).toBe(false)
    expect(r!.total).toBeGreaterThanOrEqual(75)
    expect(r!.total).toBeLessThanOrEqual(100)
    expect(r!.rating === "strong" || r!.rating === "good").toBe(true)
    expect(r!.coverage).toBe(100) // all 9 category metrics provided
  })

  it("only profitability has data → insufficient but category still scored", () => {
    const r = computeFinancialHealth({ ROE: 18, ROA: 8 })
    expect(r!.categories).toHaveLength(4) // profitability, liquidity, leverage, efficiency
    expect(r!.insufficient).toBe(true)
    const byName = Object.fromEntries(r!.categories.map((c) => [c.name, c.score]))
    expect(byName.profitability).not.toBeNull()
    expect(byName.liquidity).toBeNull()
    expect(byName.leverage).toBeNull()
    expect(byName.efficiency).toBeNull()
  })
})

describe("percentileRank", () => {
  it("works in both directions", () => {
    const vals = [10, 20, 30, 40, 50]
    expect(percentileRank(30, vals, "higher_better")).toBe(50)
    expect(percentileRank(30, vals, "lower_better")).toBe(50)
    expect(percentileRank(45, vals, "higher_better")).toBeGreaterThan(60)
  })

  it("needs at least 2 finite sector values", () => {
    expect(percentileRank(30, [30], "higher_better")).toBeNull()
  })
})

describe("computeSnowflake", () => {
  it("7 axes with sector median", () => {
    const peers = [
      { P_E: 10, ROE: 12, DIVIDEND_YIELD: 2, NET_MARGIN: 10, ASSET_TURNOVER: 0.6, PRICE_RETURN_1Y: 10, MARKET_CAP: 1e9 },
      { P_E: 15, ROE: 18, DIVIDEND_YIELD: 3, NET_MARGIN: 14, ASSET_TURNOVER: 0.8, PRICE_RETURN_1Y: 20, MARKET_CAP: 2e9 },
    ]
    const axes = computeSnowflake(
      { P_E: 12, ROE: 15, DIVIDEND_YIELD: 2.5, NET_MARGIN: 12, ASSET_TURNOVER: 0.7, PRICE_RETURN_1Y: 15, MARKET_CAP: 1.5e9 },
      peers,
    )
    expect(axes).toHaveLength(7)
    expect(axes.every((a) => a.sectorMedian !== null)).toBe(true)
    expect(axes.map((a) => a.axis)).toEqual([
      "value", "quality", "dividend", "profitability", "efficiency", "momentum", "size",
    ])
  })
})

describe("dimensionAnalysis framing rules", () => {
  it("tone follows the percentile bands", () => {
    expect(dimensionAnalysis("P/E", 8, 12, 80, "en")!.tone).toBe("positive")
    expect(dimensionAnalysis("P/E", 8, 12, 40, "en")!.tone).toBe("cautionary")
    expect(dimensionAnalysis("P/E", 8, 12, 10, "en")!.tone).toBe("warning")
  })

  it("missing value or percentile → null", () => {
    expect(dimensionAnalysis("P/E", null, 12, 80, "en")).toBeNull()
  })
})

describe("evaluateUndervaluation", () => {
  const sector = { medianPE: 12, medianPB: 1.2, yield75th: 4, medianROE: 12, evEbitda25th: 5, medianEvEbitda: 8 }

  it("3+ criteria flags, fair value = honest average of the 3 methods", () => {
    const r = evaluateUndervaluation(
      { currentPrice: 50, P_E: 8, P_B: 0.8, ROE: 18, DIVIDEND_YIELD: 6, EV_EBITDA: 3, EPS: 5, BOOK_VALUE_PER_SHARE: 40, DIVIDEND_PER_SHARE: 3 },
      sector,
    )
    expect(r.flagged).toBe(true)
    expect(r.criteriaMet).toHaveLength(5)
    // fair value = (60 + 48 + 31.5) / 3 = 46.5 — DDM drags it below price
    expect(r.fairValue).toBe(46.5)
    expect(r.upside).toBe(-7)
    expect(r.method).toContain("P/E relative")
    expect(r.method).toContain("P/B relative")
    expect(r.method).toContain("DDM")
    expect(r.reviewRequired).toBe(false)
  })

  it("<3 criteria not flagged", () => {
    const r = evaluateUndervaluation(
      { currentPrice: 50, P_E: 20, P_B: 3, ROE: 5, DIVIDEND_YIELD: 1, EV_EBITDA: 12, EPS: 2, BOOK_VALUE_PER_SHARE: 10, DIVIDEND_PER_SHARE: 0.5 },
      sector,
    )
    expect(r.flagged).toBe(false)
  })

  it("negative earnings → PE criteria skipped", () => {
    const r = evaluateUndervaluation(
      { currentPrice: 20, P_E: -5, P_B: 0.5, ROE: -8, DIVIDEND_YIELD: 0, EV_EBITDA: null, EPS: -1, BOOK_VALUE_PER_SHARE: 30, DIVIDEND_PER_SHARE: 0 },
      sector,
    )
    expect(r.criteriaMet).not.toContain("PE_BELOW_SECTOR_0_85")
  })

  it("extreme gap (>10x) → reviewRequired instead of publishing nonsense", () => {
    const r = evaluateUndervaluation(
      { currentPrice: 2, P_E: 8, P_B: 0.8, ROE: 18, DIVIDEND_YIELD: 6, EV_EBITDA: 3, EPS: 5, BOOK_VALUE_PER_SHARE: 40, DIVIDEND_PER_SHARE: 3 },
      sector,
    )
    expect(r.fairValue).toBeNull()
    expect(r.upside).toBeNull()
    expect(r.reviewRequired).toBe(true)
    expect(r.reviewReason).toBe("EXTREME_VALUATION_GAP")
  })
})
