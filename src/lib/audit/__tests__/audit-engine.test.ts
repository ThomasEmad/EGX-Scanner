import { describe, it, expect } from "vitest"
import { isValidISIN } from "../provenance-checks"
import { runAccountingChecks, type BSPeriodValues } from "../accounting-checks"
import { criticalMetricsFor } from "../missing-data-checks"
import { computeConfidenceScore } from "../confidence-score"
import { classifyStoredIssue, rootCauseFromDescription, materiality } from "../issue-class"
import { isAuthoritativeValue, nonAuthoritativeReason } from "../../financial/integrity-policy"

// ISO 6166 Luhn vectors — real ISINs verified against public registries.
describe("isValidISIN (ISO 6166 Luhn)", () => {
  it("accepts known-valid international ISINs", () => {
    expect(isValidISIN("US0378331005")).toBe(true) // Apple
    expect(isValidISIN("AU0000XVGZA3")).toBe(true) // Wikipedia example
    expect(isValidISIN("GB0002634946")).toBe(true) // BAE Systems
    expect(isValidISIN("DE0007164600")).toBe(true) // SAP
  })

  it("accepts known-valid EGX ISINs", () => {
    expect(isValidISIN("EGS60121C018")).toBe(true) // CIB (verified)
  })

  it("rejects checksum failures", () => {
    expect(isValidISIN("EGS02001C016")).toBe(false) // DB's corrupted COMI ISIN
    expect(isValidISIN("EGS02091C019")).toBe(false) // known placeholder
    expect(isValidISIN("US0378331006")).toBe(false) // Apple with wrong check digit
  })

  it("rejects structural violations", () => {
    expect(isValidISIN("")).toBe(false)
    expect(isValidISIN("US037833100")).toBe(false) // too short
    expect(isValidISIN("us0378331005")).toBe(false) // lowercase
    expect(isValidISIN("1S0378331005")).toBe(false) // must start with 2 letters
    expect(isValidISIN("US037833100X")).toBe(false) // check digit must be numeric
  })
})

// Accounting identity checks — real value vectors, not mocks of the checker.
describe("runAccountingChecks", () => {
  const ticker = "TEST"

  it("passes a balanced consolidated statement", () => {
    const period: BSPeriodValues = {
      period: "FY 2024",
      TOTAL_ASSETS: 1000, TOTAL_LIABILITIES: 600, TOTAL_EQUITY: 400,
      REVENUE: 500, COGS: 300, GROSS_PROFIT: 200,
      NET_PROFIT: 60, PROFIT_BEFORE_TAX: 80, INCOME_TAX: 20,
      OPERATING_CASH_FLOW: 100, INVESTING_CASH_FLOW: -40, FINANCING_CASH_FLOW: -30, NET_CHANGE_IN_CASH: 30,
    }
    const results = runAccountingChecks(ticker, [period], "Industrial")
    expect(results.filter((r) => r.passed === false)).toHaveLength(0)
  })

  it("flags an unbalanced balance sheet as critical", () => {
    const results = runAccountingChecks(ticker, [{
      period: "FY 2024",
      TOTAL_ASSETS: 1000, TOTAL_LIABILITIES: 600, TOTAL_EQUITY: 300, // 25% off → critical
    }], "Industrial")
    const bs = results.find((r) => r.checkName === "BALANCE_SHEET_EQUATION")
    expect(bs).toBeDefined()
    expect(bs!.passed).toBe(false)
    expect(bs!.severity).toBe("critical")
  })

  it("flags gross profit exceeding revenue", () => {
    const results = runAccountingChecks(ticker, [{
      period: "FY 2024", REVENUE: 500, COGS: 300, GROSS_PROFIT: 400,
    }], "Industrial")
    expect(results.some((r) => r.checkName === "GROSS_PROFIT_IDENTITY" && !r.passed)).toBe(true)
  })

  it("treats a corroborated but incomplete cash-flow breakdown as coverage, and bank FX effects as advisory", () => {
    const period: BSPeriodValues = {
      period: "FY 2024",
      OPERATING_CASH_FLOW: 100, INVESTING_CASH_FLOW: -40, FINANCING_CASH_FLOW: -30, NET_CHANGE_IN_CASH: 5, // way off 30
      OPENING_CASH: 1000, CLOSING_CASH: 1005, // corroborates the net change
    }
    const industrial = runAccountingChecks(ticker, [period], "Industrial").find((r) => r.checkName === "CASH_FLOW_SUM")
    const bank = runAccountingChecks(ticker, [period], "Banks").find((r) => r.checkName === "CASH_FLOW_SUM")
    expect(industrial && !industrial.passed).toBe(true)
    expect(industrial!.severity).toBe("high")
    expect(industrial!.issueClass).toBe("coverage")
    expect(bank && !bank.passed).toBe(true)
    expect(bank!.severity).toBe("medium") // sector-aware severity, not silenced
  })

  it("keeps a net change that contradicts opening/closing cash as a blocker", () => {
    const results = runAccountingChecks(ticker, [{
      period: "FY 2024",
      OPERATING_CASH_FLOW: 100, INVESTING_CASH_FLOW: -40, FINANCING_CASH_FLOW: -30, NET_CHANGE_IN_CASH: 5,
      OPENING_CASH: 1000, CLOSING_CASH: 2000, // contradicts the reported net change
    }], "Industrial")
    const cf = results.find((r) => r.checkName === "CASH_FLOW_SUM")
    expect(cf).toBeDefined()
    expect(cf!.passed).toBe(false)
    expect(cf!.severity).toBe("critical")
    expect(cf!.issueClass).toBe("blocker")
  })
})

// Sector-aware critical metric sets.
describe("criticalMetricsFor", () => {
  it("uses bank KPIs for Banks instead of industrial working-capital lines", () => {
    const b = criticalMetricsFor("Banks")
    expect(b).toContain("NET_INTEREST_INCOME")
    expect(b).toContain("CUSTOMER_DEPOSITS")
    expect(b).not.toContain("CURRENT_ASSETS")
    expect(b).not.toContain("OPERATING_CASH_FLOW")
  })

  it("keeps the universal set for industrial sectors", () => {
    const i = criticalMetricsFor("Industrial")
    expect(i).toContain("REVENUE")
    expect(i).toContain("NET_PROFIT")
    expect(i).toContain("TOTAL_ASSETS")
  })

  it("does not require a conventional revenue line for financial/holding companies", () => {
    for (const sector of ["Financial Services", "Investment"]) {
      const metrics = criticalMetricsFor(sector)
      expect(metrics).toContain("NET_PROFIT")
      expect(metrics).not.toContain("REVENUE")
    }
  })
})

// Confidence score behaviour.
describe("computeConfidenceScore", () => {
  const base = {
    ticker: "TEST",
    latestDataAgeMonths: 2,
    sources: ["YAHOO_FINANCE_API", "REUTERS_FINANCIALS_PAGE"],
    issues: [],
    criticalCoveragePct: 100,
  }

  it("scores fresh, complete, clean data high", () => {
    const { score, rating } = computeConfidenceScore(base)
    expect(score).toBeGreaterThanOrEqual(80)
    expect(rating).toBe("high")
  })

  it("penalises stale data", () => {
    const fresh = computeConfidenceScore(base).score
    const stale = computeConfidenceScore({ ...base, latestDataAgeMonths: 20 }).score
    expect(stale).toBeLessThan(fresh)
  })

  it("penalises critical issues more than medium issues", () => {
    const mk = (severity: string) => ({
      id: severity, auditRunId: "r", ticker: "TEST", category: "accounting" as const, status: "open" as const,
      severity: severity as never, description: "x", detectedAt: new Date(),
    })
    const clean = computeConfidenceScore(base).score
    const withMedium = computeConfidenceScore({ ...base, issues: [mk("medium"), mk("medium"), mk("medium")] }).score
    const withCritical = computeConfidenceScore({ ...base, issues: [mk("critical")] }).score
    expect(clean - withCritical).toBeGreaterThan(clean - withMedium)
  })

  it("penalises missing critical metrics", () => {
    const full = computeConfidenceScore(base).score
    const partial = computeConfidenceScore({ ...base, criticalCoveragePct: 50 }).score
    expect(partial).toBeLessThan(full)
  })

  it("stays within 0-100 for pathological inputs", () => {
    const mk = () => ({
      id: "x", auditRunId: "r", ticker: "X", category: "accounting" as const, status: "open" as const,
      severity: "critical" as const, description: "x", detectedAt: new Date(),
    })
    const worst = computeConfidenceScore({
      ticker: "X",
      latestDataAgeMonths: 240,
      sources: [],
      issues: Array.from({ length: 400 }, mk),
      criticalCoveragePct: 0,
    })
    expect(worst.score).toBeGreaterThanOrEqual(0)
    expect(worst.score).toBeLessThanOrEqual(100)
  })
})

// v2 issue classification — only genuine contradictions are blockers.
describe("classifyStoredIssue", () => {
  it("treats negative equity as advisory, never as a blocker", () => {
    const c = classifyStoredIssue({
      category: "logical",
      severity: "medium",
      description: "[NEGATIVE_EQUITY] TOTAL_EQUITY negative — accumulated losses; flag for review (not an error per se).",
    })
    expect(c.issueClass).toBe("advisory")
    expect(c.rootCause).toBe("NEGATIVE_EQUITY")
  })

  it("distinguishes balance-sheet mapping, component and identity failures", () => {
    expect(rootCauseFromDescription("[BALANCE_SHEET_EQUATION] MAPPING ERROR: TOTAL_LIABILITIES is calibrated like total assets"))
      .toBe("BS_MAPPING")
    expect(rootCauseFromDescription("[ASSET_COMPONENTS] CURRENT_ASSETS+NON_CURRENT_ASSETS = 10 vs TOTAL_ASSETS = 100"))
      .toBe("BS_COMPONENTS")
    expect(rootCauseFromDescription("[BALANCE_SHEET_EQUATION] FAILED: balance sheet does not balance"))
      .toBe("BS_IDENTITY")
  })

  it("keeps coverage and metadata out of the accuracy score", () => {
    expect(classifyStoredIssue({ category: "missing", severity: "high", description: "[MISSING_CRITICAL_METRIC] REVENUE missing" }).issueClass).toBe("coverage")
    expect(classifyStoredIssue({ category: "provenance", severity: "low", description: "[ISIN_MISSING] no ISIN" }).issueClass).toBe("metadata")
  })
})

// Integrity policy — missing/derived values must never be treated as observed.
describe("integrity policy", () => {
  const v = (over: Partial<Parameters<typeof isAuthoritativeValue>[0]>) => ({
    metricCode: "REVENUE",
    normalizedValue: 100,
    validationStatus: "VALID",
    ...over,
  })

  it("accepts a clean VALID observation", () => {
    expect(isAuthoritativeValue(v({}))).toBe(true)
  })

  it("rejects quarantined and non-VALID values", () => {
    expect(isAuthoritativeValue(v({ validationStatus: "NEEDS_REVIEW" }))).toBe(false)
    expect(isAuthoritativeValue(v({ validationStatus: "FAILED" }))).toBe(false)
    expect(isAuthoritativeValue(v({ validationNotes: "AUDIT_QUARANTINE: broken" }))).toBe(false)
  })

  it("rejects carried-forward copies but allows static metrics", () => {
    expect(isAuthoritativeValue(v({ originalLabel: "COPIED from FY 2023" }))).toBe(false)
    expect(isAuthoritativeValue(v({ metricCode: "SHARE_CAPITAL", originalLabel: "COPIED from FY 2023" }))).toBe(true)
  })

  it("rejects zero placeholders only on never-zero metrics", () => {
    expect(nonAuthoritativeReason(v({ metricCode: "TOTAL_ASSETS", normalizedValue: 0 }))).toBe("ZERO_PLACEHOLDER")
    expect(isAuthoritativeValue(v({ metricCode: "INVENTORY", normalizedValue: 0 }))).toBe(true)
  })
})

// Materiality uses both a relative tolerance and an absolute floor.
describe("materiality", () => {
  it("ignores sub-floor differences even when the percentage looks large", () => {
    expect(materiality(500_000, 100_000_000, 0.01).material).toBe(false)
  })

  it("flags differences above the floor and relative tolerance", () => {
    expect(materiality(2_000_000, 100_000_000, 0.01).material).toBe(true)
  })
})
