import { describe, expect, it } from "vitest"
import { applicableMetricsFor, coverage } from "../completeness"

describe("applicableMetricsFor", () => {
  it("uses bank-specific denominators and never requires revenue", () => {
    const metrics = applicableMetricsFor("Banks")
    expect(metrics).toContain("NET_INTEREST_INCOME")
    expect(metrics).toContain("LOANS_TO_CUSTOMERS")
    expect(metrics).toContain("CUSTOMER_DEPOSITS")
    expect(metrics).toContain("TOTAL_ASSETS")
    expect(metrics).not.toContain("REVENUE")
    expect(metrics).not.toContain("COGS")
    expect(metrics).not.toContain("GROSS_PROFIT")
  })

  it("uses the financial denominator for insurance, financial services and investment", () => {
    for (const sector of ["Insurance", "Financial Services", "Investment"]) {
      const metrics = applicableMetricsFor(sector)
      expect(metrics).toContain("NET_PROFIT")
      expect(metrics).toContain("TOTAL_ASSETS")
      expect(metrics).toContain("OPERATING_CASH_FLOW")
      expect(metrics).not.toContain("REVENUE")
      expect(metrics).not.toContain("COGS")
      expect(metrics).not.toContain("GROSS_PROFIT")
    }
  })

  it("requires revenue, COGS and gross profit for non-financial sectors", () => {
    const metrics = applicableMetricsFor("Food")
    expect(metrics).toContain("REVENUE")
    expect(metrics).toContain("COGS")
    expect(metrics).toContain("GROSS_PROFIT")
    expect(metrics).toContain("NET_PROFIT")
  })
})

describe("coverage", () => {
  it("returns null instead of zero when the denominator is zero", () => {
    expect(coverage(0, 0)).toEqual({ numerator: 0, denominator: 0, pct: null })
    expect(coverage(3, 0)).toEqual({ numerator: 3, denominator: 0, pct: null })
  })

  it("rounds to two decimal places", () => {
    expect(coverage(1, 3).pct).toBe(33.33)
    expect(coverage(2, 3).pct).toBe(66.67)
    expect(coverage(5, 5).pct).toBe(100)
  })
})
