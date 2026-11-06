import { describe, expect, it } from "vitest"
import { evaluateUndervaluation, type MetricMap } from "../engine"

const sector = {
  medianPE: 10,
  medianPB: 2,
  yield75th: 0.05,
  medianROE: 0.1,
  evEbitda25th: null,
  medianEvEbitda: null,
}

function metrics(overrides: MetricMap): MetricMap & { currentPrice: number } {
  return { currentPrice: 10, ...overrides }
}

describe("evaluateUndervaluation — fair-value sanity guard", () => {
  it("publishes a normal relative valuation", () => {
    const r = evaluateUndervaluation(metrics({ EPS: 2, P_E: 5 }), sector)
    expect(r.fairValue).toBe(20)
    expect(r.upside).toBe(100)
    expect(r.reviewRequired).toBe(false)
  })

  it("withholds a fair value when the implied gap exceeds 10x", () => {
    const r = evaluateUndervaluation(metrics({ EPS: 100, P_E: 0.1 }), sector)
    expect(r.fairValue).toBeNull()
    expect(r.upside).toBeNull()
    expect(r.reviewRequired).toBe(true)
    expect(r.reviewReason).toBe("EXTREME_VALUATION_GAP")
  })

  it("withholds a fair value when the implied gap is below 0.1x", () => {
    const r = evaluateUndervaluation(metrics({ currentPrice: 100, EPS: 0.1, P_E: 50 }), sector)
    expect(r.fairValue).toBeNull()
    expect(r.upside).toBeNull()
    expect(r.reviewRequired).toBe(true)
  })

  it("keeps a 3x gap but flags it for review", () => {
    const r = evaluateUndervaluation(metrics({ EPS: 3, P_E: 3.33 }), sector)
    expect(r.fairValue).toBe(30)
    expect(r.upside).toBe(200)
    expect(r.reviewRequired).toBe(true)
  })

  it("never fabricates a fair value without price or inputs", () => {
    const r = evaluateUndervaluation({ currentPrice: null }, sector)
    expect(r.fairValue).toBeNull()
    expect(r.upside).toBeNull()
    expect(r.reviewRequired).toBe(false)
  })
})
