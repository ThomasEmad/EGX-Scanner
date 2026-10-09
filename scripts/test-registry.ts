// Test 1: Metric Registry (22 tests)
// Validates the expanded metric registry structure, group mappings, and
// the database MetricDefinition count.
import { db } from "../src/lib/db"
import {
  RAW_METRICS, CALC_METRICS, RAW_METRIC_MAP, isUnitlessMetric,
} from "../src/lib/financial/registry"
import {
  EXPANDED_METRICS, METRIC_GROUPS, METRIC_CODE_TO_GROUP, getMetricGroup,
} from "../src/lib/financial/expanded-metrics"

interface TestResult { name: string; passed: boolean; details?: string }
const results: TestResult[] = []
function test(name: string, fn: () => boolean | string): void {
  try {
    const r = fn()
    if (r === true) results.push({ name, passed: true })
    else if (r === false) results.push({ name, passed: false })
    else results.push({ name, passed: false, details: String(r) })
  } catch (e) {
    results.push({ name, passed: false, details: e instanceof Error ? e.message : String(e) })
  }
}

// 1. EXPANDED_METRICS has at least 103 metrics
test("EXPANDED_METRICS contains 103+ metric definitions", () => EXPANDED_METRICS.length >= 103 ? true : `actual=${EXPANDED_METRICS.length}`)

// 2. Every expanded metric has the required fields
test("Every expanded metric has code, labelEn, labelAr, statementType, aliases", () => {
  for (const m of EXPANDED_METRICS) {
    if (!m.code || !m.labelEn || !m.labelAr || !m.statementType || !Array.isArray(m.aliases) || m.aliases.length === 0) {
      return `Metric ${m.code} is missing required fields`
    }
  }
  return true
})

// 3. Every expanded metric has a `group` field
test("Every expanded metric has a `group` field", () => {
  const missing = EXPANDED_METRICS.filter((m) => !m.group).map((m) => m.code)
  return missing.length === 0 ? true : `missing group: ${missing.join(", ")}`
})

// 4. Every expanded metric has a `displayOrder` field
test("Every expanded metric has a `displayOrder` field", () => {
  const missing = EXPANDED_METRICS.filter((m) => m.displayOrder === undefined).map((m) => m.code)
  return missing.length === 0 ? true : `missing displayOrder: ${missing.join(", ")}`
})

// 5. Income statement metrics count (>= 19 in task spec)
test("Income statement expanded metrics count >= 19", () => {
  const incomeMetrics = EXPANDED_METRICS.filter((m) => m.statementType === "INCOME_STATEMENT")
  return incomeMetrics.length >= 19 ? true : `actual=${incomeMetrics.length}`
})

// 6. Balance sheet metrics count (>= 24)
test("Balance sheet expanded metrics count >= 24", () => {
  const bsMetrics = EXPANDED_METRICS.filter((m) => m.statementType === "BALANCE_SHEET")
  return bsMetrics.length >= 24 ? true : `actual=${bsMetrics.length}`
})

// 7. Cash flow metrics count (>= 22)
test("Cash flow expanded metrics count >= 22", () => {
  const cfMetrics = EXPANDED_METRICS.filter((m) => m.statementType === "CASH_FLOW")
  return cfMetrics.length >= 22 ? true : `actual=${cfMetrics.length}`
})

// 8. Notes disclosures count (>= 16)
test("Notes disclosures count >= 16", () => {
  const noteMetrics = EXPANDED_METRICS.filter((m) => m.statementType === "OTHER")
  return noteMetrics.length >= 16 ? true : `actual=${noteMetrics.length}`
})

// 9. Per-share flags set on EPS / DPS / BVPS
test("Per-share flags set on BASIC_EPS, DILUTED_EPS, DPS_DECLARED", () => {
  const codes = ["BASIC_EPS", "DILUTED_EPS", "DPS_DECLARED"]
  for (const code of codes) {
    const m = EXPANDED_METRICS.find((e) => e.code === code)
    if (!m || !m.isPerShare) return `${code} not flagged as isPerShare`
  }
  return true
})

// 10. Share-count flags on WEIGHTED_AVG_SHARES, WEIGHTED_AVG_SHARES_DILUTED
test("Share-count flags set on WEIGHTED_AVG_SHARES, WEIGHTED_AVG_SHARES_DILUTED", () => {
  const codes = ["WEIGHTED_AVG_SHARES", "WEIGHTED_AVG_SHARES_DILUTED"]
  for (const code of codes) {
    const m = EXPANDED_METRICS.find((e) => e.code === code)
    if (!m || !m.isCount) return `${code} not flagged as isCount`
  }
  return true
})

// 11. METRIC_GROUPS has 33+ groups
test("METRIC_GROUPS contains 33+ group definitions", () => METRIC_GROUPS.length >= 33 ? true : `actual=${METRIC_GROUPS.length}`)

// 12. Every METRIC_GROUP has EN+AR labels, displayOrder, metrics array
test("Every METRIC_GROUP has labelEn, labelAr, displayOrder, metrics", () => {
  for (const g of METRIC_GROUPS) {
    if (!g.group || !g.labelEn || !g.labelAr || g.displayOrder === undefined || !Array.isArray(g.metrics)) {
      return `Group ${g.group} missing required fields`
    }
  }
  return true
})

// 13. METRIC_CODE_TO_GROUP reverse lookup works
test("METRIC_CODE_TO_GROUP returns group for a known code (REVENUE)", () => {
  const g = METRIC_CODE_TO_GROUP["REVENUE"]
  return g ? true : "REVENUE not mapped"
})

// 14. getMetricGroup returns MetricGroupDef for SALES
test("getMetricGroup returns MetricGroupDef for SALES", () => {
  const g = getMetricGroup("SALES")
  return g && g.group === "income.revenue" ? true : `got ${g?.group}`
})

// 15. getMetricGroup returns undefined for unknown code
test("getMetricGroup returns undefined for UNKNOWN_CODE", () => {
  return getMetricGroup("UNKNOWN_CODE_XYZ") === undefined ? true : "should be undefined"
})

// 16. RAW_METRICS includes EXPANDED_METRICS (count check)
test("RAW_METRICS includes expanded metrics (count >= 141)", () => {
  return RAW_METRICS.length >= 141 ? true : `actual=${RAW_METRICS.length}`  // 38 original + 103 expanded
})

// 17. RAW_METRIC_MAP has every expanded code
test("RAW_METRIC_MAP has every expanded metric code", () => {
  const missing = EXPANDED_METRICS.filter((m) => !RAW_METRIC_MAP[m.code]).map((m) => m.code)
  return missing.length === 0 ? true : `missing: ${missing.join(", ")}`
})

// 18. isUnitlessMetric returns true for BASIC_EPS
test("isUnitlessMetric returns true for BASIC_EPS", () => isUnitlessMetric("BASIC_EPS") ? true : "BASIC_EPS should be unitless")

// 19. isUnitlessMetric returns true for WEIGHTED_AVG_SHARES
test("isUnitlessMetric returns true for WEIGHTED_AVG_SHARES", () => isUnitlessMetric("WEIGHTED_AVG_SHARES") ? true : "should be unitless")

// 20. Calculated metrics count is 26
test("CALC_METRICS contains 26 calculated metrics", () => CALC_METRICS.length === 26 ? true : `actual=${CALC_METRICS.length}`)

// 21. Database MetricDefinition count is 167 (38 raw + 103 expanded + 26 calculated)
test("Database has 167 MetricDefinition rows", async () => {
  const count = await db.metricDefinition.count()
  return count === 167 ? true : `actual=${count}`
})

// 22. Each expanded metric's aliases include at least one Arabic OR English alias
test("Each expanded metric has at least one alias >= 4 chars", () => {
  const bad = EXPANDED_METRICS.filter((m) => m.aliases.every((a) => a.length < 4)).map((m) => m.code)
  return bad.length === 0 ? true : `bad: ${bad.join(", ")}`
})

async function main() {
  // Wait for the async test
  const r21 = await (async () => {
    try {
      const count = await db.metricDefinition.count()
      return count === 167 ? true : `actual=${count}`
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  })()
  const idx = results.findIndex((r) => r.name.includes("167 MetricDefinition"))
  if (idx >= 0) {
    results[idx] = { name: results[idx].name, passed: r21 === true, details: r21 === true ? undefined : String(r21) }
  }
  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed)
  console.log(`\n=== Test Registry: ${passed}/${results.length} passed ===`)
  for (const r of results) {
    const sym = r.passed ? "✓" : "✗"
    console.log(`${sym} ${r.name}${r.details ? ` — ${r.details}` : ""}`)
  }
  if (failed.length > 0) {
    console.log(`\n${failed.length} test(s) FAILED`)
    process.exit(1)
  } else {
    console.log(`\nAll ${results.length} tests passed ✓`)
  }
  await db.$disconnect()
}

main().catch((e) => {
  console.error("Test runner crashed:", e)
  process.exit(1)
})
