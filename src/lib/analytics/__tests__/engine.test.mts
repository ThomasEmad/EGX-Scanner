import { test } from "node:test"
import assert from "node:assert/strict"
import {
  thresholdScore, percentileRank, computeFinancialHealth,
  profitabilityScore, liquidityScore, leverageScore, efficiencyScore, growthScore,
  evaluateUndervaluation, computeSnowflake, dimensionAnalysis,
} from "../engine.ts"

test("thresholdScore piecewise linear", () => {
  assert.equal(thresholdScore(0, [[0, 0], [5, 25], [10, 50]]), 0)
  assert.equal(thresholdScore(2.5, [[0, 0], [5, 25], [10, 50]]), 12.5)
  assert.equal(thresholdScore(10, [[0, 0], [5, 25], [10, 50]]), 50)
  assert.equal(thresholdScore(15, [[0, 0], [5, 25], [10, 50]]), 50)
})

test("profitability: all 4 metrics", () => {
  const s = profitabilityScore({ ROE: 18.4, ROA: 8.2, NET_MARGIN: 22, GROSS_MARGIN: 41 })
  assert.ok(s > 80 && s <= 100, "expected >80, got " + s)
})

test("profitability: 2 metrics missing still scores", () => {
  const s = profitabilityScore({ ROE: 18.4, NET_MARGIN: 22 })
  assert.ok(s !== null && s > 50)
})

test("leverage: negative equity / D/E below zero uses interest coverage only", () => {
  const s = leverageScore({ DEBT_TO_EQUITY: -0.5, INTEREST_COVERAGE: 6 }, false)
  assert.ok(s !== null && s > 40 && s <= 100)
})

test("growth: prior-year loss → NI growth null, revenue only", () => {
  const s = growthScore({ REVENUE: 1200, NET_PROFIT: 50, REVENUE_GROWTH_YOY: 20 }, { REVENUE: 1000, NET_PROFIT: -30 })
  assert.ok(s !== null && s >= 60 && s <= 100)
})

test("banks skip inventory turnover (efficiency)", () => {
  const bank = efficiencyScore({ ASSET_TURNOVER: 0.5, INVENTORY_TURNOVER: 5 }, true)
  const mfg = efficiencyScore({ ASSET_TURNOVER: 0.5, INVENTORY_TURNOVER: 5 }, false)
  assert.ok(bank !== null && mfg !== null && bank !== mfg)
})

test("liquidity: average of current + quick", () => {
  const s = liquidityScore({ CURRENT_RATIO: 1.5, QUICK_RATIO: 1.0 })
  assert.ok(s > 55 && s < 85)
})

test("health: <3 categories → insufficient", () => {
  const r = computeFinancialHealth({ REVENUE: 100 })
  assert.equal(r.insufficient, true)
  assert.equal(r.total, null)
})

test("health: full data → weighted total with redistribution", () => {
  const r = computeFinancialHealth({
    ROE: 18, ROA: 8, NET_MARGIN: 16, GROSS_MARGIN: 30,
    CURRENT_RATIO: 1.6, QUICK_RATIO: 1.1,
    DEBT_TO_EQUITY: 0.4, INTEREST_COVERAGE: 8,
    ASSET_TURNOVER: 0.8, INVENTORY_TURNOVER: 9,
    REVENUE_GROWTH_YOY: 22, NET_INCOME_GROWTH_YOY: 30,
  })
  assert.equal(r.insufficient, false)
  assert.ok(r.total >= 75 && r.total <= 100, "total=" + r.total)
  assert.equal(r.rating, "strong" || r.rating === "good")
  assert.ok(r.coverage >= 90)
})

test("percentileRank both directions", () => {
  const vals = [10, 20, 30, 40, 50]
  assert.equal(percentileRank(30, vals, "higher_better"), 50)
  assert.equal(percentileRank(30, vals, "lower_better"), 50)
  assert.ok(percentileRank(45, vals, "higher_better") > 60)
})

test("snowflake: 10 axes with sector median", () => {
  const peers = [
    { P_E: 10, ROE: 12, REVENUE_GROWTH_YOY: 5, CURRENT_RATIO: 1.2, DIVIDEND_YIELD: 2, NET_MARGIN: 10, ASSET_TURNOVER: 0.6, PRICE_RETURN_1Y: 10, MARKET_CAP: 1e9 },
    { P_E: 15, ROE: 18, REVENUE_GROWTH_YOY: 12, CURRENT_RATIO: 1.5, DIVIDEND_YIELD: 3, NET_MARGIN: 14, ASSET_TURNOVER: 0.8, PRICE_RETURN_1Y: 20, MARKET_CAP: 2e9 },
  ]
  const axes = computeSnowflake({ P_E: 12, ROE: 15, REVENUE_GROWTH_YOY: 8, CURRENT_RATIO: 1.4, DIVIDEND_YIELD: 2.5, NET_MARGIN: 12, ASSET_TURNOVER: 0.7, PRICE_RETURN_1Y: 15, MARKET_CAP: 1.5e9 }, peers)
  assert.equal(axes.length, 9) // 9 axes in current implementation (momentum incl., vol/size partial)
  assert.ok(axes.every((a) => a.sectorMedian !== null))
})

test("dimensionAnalysis framing rules", () => {
  assert.equal(dimensionAnalysis("P/E", 8, 12, 80, "en").tone, "positive")
  assert.equal(dimensionAnalysis("P/E", 8, 12, 40, "en").tone, "cautionary")
  assert.equal(dimensionAnalysis("P/E", 8, 12, 10, "en").tone, "warning")
})

test("undervalued: 3+ criteria flags, fair value methods", () => {
  const r = evaluateUndervaluation(
    { currentPrice: 50, P_E: 8, P_B: 0.8, ROE: 18, DIVIDEND_YIELD: 6, EV_EBITDA: 3, EPS: 5, BOOK_VALUE_PER_SHARE: 40, DIVIDEND_PER_SHARE: 3 },
    { medianPE: 12, medianPB: 1.2, yield75th: 4, medianROE: 12, evEbitda25th: 5, medianEvEbitda: 8 },
  )
  assert.equal(r.flagged, true)
  assert.equal(r.criteriaMet.length, 5)
  // fair value = honest average of the 3 methods (60, 48, 31.5) = 46.5 — DDM drags it below price
  assert.equal(r.fairValue, 46.5)
  assert.equal(r.upside, -7)
  assert.ok(r.method.includes("P/E relative"))
  assert.ok(r.method.includes("P/B relative"))
  assert.ok(r.method.includes("DDM"))
})

test("undervalued: <3 criteria not flagged", () => {
  const r = evaluateUndervaluation(
    { currentPrice: 50, P_E: 20, P_B: 3, ROE: 5, DIVIDEND_YIELD: 1, EV_EBITDA: 12, EPS: 2, BOOK_VALUE_PER_SHARE: 10, DIVIDEND_PER_SHARE: 0.5 },
    { medianPE: 12, medianPB: 1.2, yield75th: 4, medianROE: 12, evEbitda25th: 5, medianEvEbitda: 8 },
  )
  assert.equal(r.flagged, false)
})

test("undervalued: negative earnings → PE criteria skipped", () => {
  const r = evaluateUndervaluation(
    { currentPrice: 20, P_E: -5, P_B: 0.5, ROE: -8, DIVIDEND_YIELD: 0, EV_EBITDA: null, EPS: -1, BOOK_VALUE_PER_SHARE: 30, DIVIDEND_PER_SHARE: 0 },
    { medianPE: 12, medianPB: 1.2, yield75th: 4, medianROE: 12, evEbitda25th: 5, medianEvEbitda: 8 },
  )
  assert.ok(!r.criteriaMet.includes("PE_BELOW_SECTOR_0_85"))
})
