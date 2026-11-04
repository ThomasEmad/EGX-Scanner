import { describe, it, expect } from "vitest"
import { runTemporalChecks } from "../temporal-checks"

describe("temporal checks — future periods", () => {
  const values = new Map<string, number>()

  it("flags a period that ends in the future", () => {
    const future = new Date()
    future.setUTCDate(future.getUTCDate() + 60)
    const issues = runTemporalChecks("TEST", [{
      period: "FY 2026",
      periodType: "ANNUAL",
      fiscalYear: 2026,
      periodEnd: future,
      values,
    }])
    expect(issues.some((i) => i.checkName === "FUTURE_PERIOD")).toBe(true)
  })

  it("does not flag a period that ended earlier today", () => {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const issues = runTemporalChecks("TEST", [{
      period: "FY 2026",
      periodType: "ANNUAL",
      fiscalYear: 2026,
      periodEnd: today,
      values,
    }])
    expect(issues.some((i) => i.checkName === "FUTURE_PERIOD")).toBe(false)
  })
})
