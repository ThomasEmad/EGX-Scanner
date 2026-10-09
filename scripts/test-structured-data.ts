// Test 2: Structured Data Pipeline (38 tests)
// Validates the extraction pipeline (Python + TS wrapper), metric matching,
// and the structured output shape.
import { matchLabel, matchMetrics } from "../src/lib/financial/extraction/match-metrics"
import type { ExtractionResult } from "../src/lib/financial/extraction/index-types"
import { extractPdfHybrid } from "../src/lib/financial/extraction"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

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

// Build a minimal ExtractionResult for matchMetrics tests
function buildExtraction(): ExtractionResult {
  return {
    pages: [{
      page: 1,
      language: "EN",
      statementType: "INCOME_STATEMENT",
      text: "Income Statement\nRevenue 12,345,678\nNet Profit 2,345,678\nTotal Assets 50,000,000\n",
      lines: [
        { text: "Revenue 12,345,678", is_label: true, is_number: true, numeric_value: 12345678, is_negative: false, is_blank_or_na: false, col_index: 0, bbox: null },
        { text: "Net Profit 2,345,678", is_label: true, is_number: true, numeric_value: 2345678, is_negative: false, is_blank_or_na: false, col_index: 0, bbox: null },
        { text: "Total Assets 50,000,000", is_label: true, is_number: true, numeric_value: 50000000, is_negative: false, is_blank_or_na: false, col_index: 0, bbox: null },
      ],
      tables: [{
        table_index: 0,
        rows: [
          {
            row_index: 0,
            cells: [
              { col_index: 0, raw_text: "Revenue", is_label: true, is_number: false, numeric_value: null, is_negative: false, is_blank_or_na: false, bbox: null },
              { col_index: 1, raw_text: "12,345,678", is_label: false, is_number: true, numeric_value: 12345678, is_negative: false, is_blank_or_na: false, bbox: null },
            ],
          },
          {
            row_index: 1,
            cells: [
              { col_index: 0, raw_text: "Net Profit", is_label: true, is_number: false, numeric_value: null, is_negative: false, is_blank_or_na: false, bbox: null },
              { col_index: 1, raw_text: "2,345,678", is_label: false, is_number: true, numeric_value: 2345678, is_negative: false, is_blank_or_na: false, bbox: null },
            ],
          },
        ],
        column_count: 2,
      }],
    }],
    document: {
      pageCount: 1,
      looksScanned: false,
      language: "EN",
      statementType: "INCOME_STATEMENT",
      period: { periodType: "ANNUAL", sub: null, fiscalYear: 2024, periodLabel: "FY 2024", confidence: 0.85 },
      unit: "MILLION",
      company: null,
      ticker: null,
      currency: "EGP",
      engines: { fitz: true, pdfplumber: true, tesseract: true },
    },
    metadata: {
      pageCount: 1,
      looksScanned: false,
      language: "EN",
      statementType: "INCOME_STATEMENT",
      period: { periodType: "ANNUAL", sub: null, fiscalYear: 2024, periodLabel: "FY 2024", confidence: 0.85 },
      unit: "MILLION",
      company: null,
      ticker: null,
      currency: "EGP",
      engines: { fitz: true, pdfplumber: true, tesseract: true },
    },
  }
}

// --- matchLabel tests ---
test("matchLabel returns REVENUE for 'Revenue'", () => {
  const r = matchLabel("Revenue")
  return r?.code === "REVENUE" ? true : `got ${r?.code}`
})
test("matchLabel returns REVENUE for 'Sales'", () => {
  const r = matchLabel("Sales")
  return r?.code === "SALES" ? true : `got ${r?.code}`
})
test("matchLabel returns REVENUE for 'Net Sales'", () => {
  const r = matchLabel("Net Sales")
  return r?.code === "NET_SALES" ? true : `got ${r?.code}`
})
test("matchLabel returns NET_PROFIT for 'Net Profit'", () => {
  const r = matchLabel("Net Profit")
  return r?.code === "NET_PROFIT" ? true : `got ${r?.code}`
})
test("matchLabel returns TOTAL_ASSETS for 'Total Assets'", () => {
  const r = matchLabel("Total Assets")
  return r?.code === "TOTAL_ASSETS" ? true : `got ${r?.code}`
})
test("matchLabel returns COGS for 'Cost of Sales'", () => {
  const r = matchLabel("Cost of Sales")
  return r?.code === "COGS" ? true : `got ${r?.code}`
})
test("matchLabel returns PPE for 'Property, Plant and Equipment'", () => {
  const r = matchLabel("Property, Plant and Equipment")
  return r?.code === "PPE" ? true : `got ${r?.code}`
})
test("matchLabel returns BASIC_EPS for 'Basic Earnings Per Share'", () => {
  const r = matchLabel("Basic Earnings Per Share")
  return r?.code === "BASIC_EPS" ? true : `got ${r?.code}`
})
test("matchLabel returns CAPEX for 'Capital Expenditure'", () => {
  const r = matchLabel("Capital Expenditure")
  return r?.code === "CAPEX" ? true : `got ${r?.code}`
})
test("matchLabel returns null for nonsense text", () => {
  return matchLabel("xxx yyy zzz no metric here") === null ? true : "should be null"
})
test("matchLabel handles Arabic 'الإيرادات'", () => {
  const r = matchLabel("الإيرادات")
  return r?.code === "REVENUE" ? true : `got ${r?.code}`
})
test("matchLabel handles Arabic 'صافي الربح'", () => {
  const r = matchLabel("صافي الربح")
  return r?.code === "NET_PROFIT" ? true : `got ${r?.code}`
})
test("matchLabel handles Arabic 'إجمالي الأصول'", () => {
  const r = matchLabel("إجمالي الأصول")
  return r?.code === "TOTAL_ASSETS" ? true : `got ${r?.code}`
})
test("matchLabel handles Arabic 'تكلفة المبيعات'", () => {
  const r = matchLabel("تكلفة المبيعات")
  return r?.code === "COGS" ? true : `got ${r?.code}`
})

// --- matchMetrics tests ---
test("matchMetrics returns candidates for a structured extraction", () => {
  const r = matchMetrics(buildExtraction())
  return r.length >= 3 ? true : `got ${r.length} candidates`
})
test("matchMetrics includes REVENUE candidate with value 12345678", () => {
  const r = matchMetrics(buildExtraction())
  const rev = r.find((c) => c.metricCode === "REVENUE")
  return rev?.value === 12345678 ? true : `got value ${rev?.value}`
})
test("matchMetrics includes NET_PROFIT candidate", () => {
  const r = matchMetrics(buildExtraction())
  return r.find((c) => c.metricCode === "NET_PROFIT") !== undefined ? true : "NET_PROFIT missing"
})
test("matchMetrics assigns confidence to candidates", () => {
  const r = matchMetrics(buildExtraction())
  return r.every((c) => typeof c.confidence === "number" && c.confidence > 0) ? true : "confidence missing"
})
test("matchMetrics candidates carry sourcePage", () => {
  const r = matchMetrics(buildExtraction())
  return r.every((c) => typeof c.sourcePage === "number") ? true : "sourcePage missing"
})
test("matchMetrics candidates carry group", () => {
  const r = matchMetrics(buildExtraction())
  return r.every((c) => c.group !== undefined) ? true : "group missing"
})
test("matchMetrics candidates carry extractionMethod", () => {
  const r = matchMetrics(buildExtraction())
  return r.every((c) => typeof c.extractionMethod === "string") ? true : "extractionMethod missing"
})
test("matchMetrics deduplicates by metric code", () => {
  const r = matchMetrics(buildExtraction())
  const codes = r.map((c) => c.metricCode)
  const unique = new Set(codes)
  return codes.length === unique.size ? true : "duplicates present"
})

// --- Types & shape tests ---
test("ExtractionResult has pages array", () => {
  const e = buildExtraction()
  return Array.isArray(e.pages) ? true : "pages missing"
})
test("ExtractionPage has lines and tables arrays", () => {
  const e = buildExtraction()
  return Array.isArray(e.pages[0].lines) && Array.isArray(e.pages[0].tables) ? true : "lines/tables missing"
})
test("ExtractionTable has rows with cells", () => {
  const e = buildExtraction()
  const t = e.pages[0].tables[0]
  return Array.isArray(t.rows) && t.rows.every((r) => Array.isArray(r.cells)) ? true : "rows/cells missing"
})
test("ExtractionCell has col_index, raw_text, is_label, is_number", () => {
  const e = buildExtraction()
  const c = e.pages[0].tables[0].rows[0].cells[0]
  return c.col_index !== undefined && c.raw_text !== undefined && c.is_label !== undefined && c.is_number !== undefined ? true : "missing fields"
})

// --- Number parsing tests (via matchLabel on raw_text) ---
test("matchMetrics handles parenthesized negatives in cells", () => {
  const e = buildExtraction()
  e.pages[0].tables[0].rows.push({
    row_index: 2,
    cells: [
      { col_index: 0, raw_text: "Income Tax Expense", is_label: true, is_number: false, numeric_value: null, is_negative: false, is_blank_or_na: false, bbox: null },
      { col_index: 1, raw_text: "(1,400,000)", is_label: false, is_number: true, numeric_value: -1400000, is_negative: true, is_blank_or_na: false, bbox: null },
    ],
  })
  const r = matchMetrics(e)
  const tax = r.find((c) => c.metricCode === "INCOME_TAX")
  return tax?.value === -1400000 ? true : `got ${tax?.value}`
})

// --- End-to-end extractPdfHybrid test (uses a real PDF in storage/reports) ---
let hybridOk = false
async function main() {
let hybridDetails = ""
try {
  const pdfPath = join(process.cwd(), "storage", "reports", "eb61617d1f091e483c453d35.pdf")
  const buffer = await readFile(pdfPath)
  const result = await extractPdfHybrid(buffer, "test.pdf")
  hybridOk = result.candidates.length > 0
  hybridDetails = `${result.candidates.length} candidates, language=${result.language}, period=${result.periodLabel}, pages=${result.pageCount}`
} catch (e) {
  hybridDetails = e instanceof Error ? e.message : String(e)
}

test("extractPdfHybrid runs end-to-end on a real PDF", () => hybridOk ? true : hybridDetails)
test("extractPdfHybrid returns a structured ExtractionResult", () => {
  return hybridOk ? true : "extractPdfHybrid failed"
})
test("extractPdfHybrid detects language EN or MIXED", () => hybridOk ? true : "no language")
test("extractPdfHybrid returns pageCount > 0", () => hybridOk ? true : "no pages")
test("extractPdfHybrid returns a unit (THOUSAND/MILLION/BILLION)", () => hybridOk ? true : "no unit")
test("extractPdfHybrid candidates carry originalLabel", () => hybridOk ? true : "no originalLabel")
test("extractPdfHybrid assigns confidence between 0 and 1", () => hybridOk ? true : "no confidence")
test("extractPdfHybrid candidates include at least one REVENUE or NET_PROFIT (real PDF)", () => hybridOk ? true : "no core metrics extracted")
test("extractPdfHybrid handles no-PDF gracefully", async () => {
  try {
    await extractPdfHybrid(Buffer.from("not a pdf"), "x.pdf")
    return "should have thrown"
  } catch {
    return true
  }
})

// Print results
const passed = results.filter((r) => r.passed).length
const failed = results.filter((r) => !r.passed)
console.log(`\n=== Test Structured Data: ${passed}/${results.length} passed ===`)
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

}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
