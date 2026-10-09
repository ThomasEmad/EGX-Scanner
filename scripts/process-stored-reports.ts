// Process Stored Reports — runs the FULL extraction pipeline on every
// FinancialReport that has a stored PDF but is still in NEW_DOWNLOADED status.
//
// Pipeline per report:
//   1. Read the PDF file from localFileRef
//   2. Run the extract_pdf.py Python extractor OR the TypeScript extraction engine
//   3. Match extracted values against the metric registry
//   4. Validate (accounting identities)
//   5. Store FinancialValue rows
//   6. Recompute derived metrics (CalculatedMetric)
//   7. Update report processingStatus → EXTRACTED → VALIDATED
//
// After processing all reports, prints a summary including:
//   - Per-company extraction stats (values extracted / valid / failed)
//   - Coverage report (critical metric coverage per company)
//   - Sample derived metrics (ROE, ROA, FCF, Debt/Equity)
//
// Then triggers investor-signals + research-profile generation.

import { readFile } from "node:fs/promises"
import { db } from "../src/lib/db"
import {
  detectDocumentKind,
  extractFromPages,
  classifyDocument,
  runValidation,
  confidenceForCandidate,
  type ExtractedCandidate,
  type ValidatableValue,
} from "../src/lib/financial/extract"
import { parsePdf } from "../src/lib/financial/pdf"
import { validateValues } from "../src/lib/financial/validate"
import { recomputeCompany, type RecomputeResult } from "../src/lib/financial/recompute"
import { reportPeriodKey } from "../src/lib/financial/periods"
import { buildCoverageReport } from "../src/lib/financial/analysis/coverage-report"
import { buildInvestorSignals } from "../src/lib/financial/analysis/investor-signals"
import type { AnalysisContext, PeriodSnapshot } from "../src/lib/financial/analysis/types"

// Optional: read test PDFs and store them as FinancialReports first
async function storeTestPdfsIfMissing() {
  console.log("=== Step 1: Storing test PDFs as FinancialReports ===\n")
  const testPdfDir = "storage/test-pdfs"
  let stored = 0
  let existing = 0

  const companies = await db.company.findMany({ select: { id: true, ticker: true } })
  const tickerToCompany = new Map(companies.map((c) => [c.ticker, c]))

  // List all test PDFs
  const pdfFiles = await Array.fromAsync(
    await import("node:fs").then((fs) => fs.promises.readdir(testPdfDir).then((files) =>
      files.filter((f) => f.endsWith(".pdf")).map((f) => `${testPdfDir}/${f}`)
    ))
  ).catch(() => [])

  for (const pdfPath of pdfFiles) {
    const fileName = pdfPath.split("/").pop()!  // e.g. "COMI-FY2023.pdf"
    const ticker = fileName.split("-")[0]
    const company = tickerToCompany.get(ticker)
    if (!company) {
      console.log(`  ✗ ${fileName} — no matching company for ticker ${ticker}`)
      continue
    }
    // Check if a FinancialReport already exists with this file
    const existingReport = await db.financialReport.findFirst({
      where: { companyId: company.id, fileName },
    })
    if (existingReport) {
      existing++
      continue
    }

    const buffer = await readFile(pdfPath)
    const { createHash } = await import("node:crypto")
    const fileHash = createHash("sha256").update(buffer).digest("hex")

    const report = await db.financialReport.create({
      data: {
        companyId: company.id,
        reportType: "ANNUAL",
        periodType: "ANNUAL",
        statementType: "CONSOLIDATED",
        fiscalYear: 2023,
        periodLabel: "FY 2023",
        periodEnd: new Date("2023-12-31"),
        publicationDate: new Date("2024-03-31"),
        language: "EN",
        sourceName: "TEST_PDF_GENERATED",
        sourceUrl: null,
        localFileRef: pdfPath,
        fileName,
        fileHash,
        fileSize: buffer.length,
        processingStatus: "NEW_DOWNLOADED",
        extractionMethod: null,
        parserVersion: null,
        extractionConfidence: null,
        isDemoData: false,
        discoveredAt: new Date(),
        documentType: "ANNUAL_REPORT",
      },
    })
    stored++
    console.log(`  + Stored ${fileName} → report ${report.id}`)
  }
  console.log(`\nStored: ${stored} | Already existed: ${existing}`)
}

async function processOneReport(reportId: string): Promise<{
  valuesExtracted: number
  valuesValid: number
  valuesNeedsReview: number
  valuesFailed: number
  confidence: number | null
  status: string
  error?: string
}> {
  const report = await db.financialReport.findUnique({
    where: { id: reportId },
    include: { company: true },
  })
  if (!report) throw new Error(`Report ${reportId} not found`)
  if (!report.localFileRef) {
    return { valuesExtracted: 0, valuesValid: 0, valuesNeedsReview: 0, valuesFailed: 0, confidence: null, status: "FAILED", error: "NO_FILE" }
  }

  await db.financialReport.update({
    where: { id: reportId },
    data: { processingStatus: "PROCESSING", errorMessage: null },
  })

  try {
    // 1. Read PDF
    const buffer = await readFile(report.localFileRef)
    const kind = detectDocumentKind(buffer)
    if (kind !== "PDF") {
      throw new Error(`Expected PDF, got ${kind}`)
    }

    // 2. Parse PDF → pages
    const pdf = await parsePdf(buffer)
    if (pdf.looksScanned) {
      throw new Error("PDF is scanned — OCR not available")
    }
    const fullText = pdf.pages.map((p) => p.text).join("\n")

    // 3. Extract candidates via matchMetrics
    const candidates = await extractFromPages(pdf.pages) as ValidatableValue[]
    if (candidates.length === 0) {
      throw new Error("No financial labels matched from the PDF")
    }

    // 4. Document classification
    const docPages = pdf.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text || "" }))
    const classification = classifyDocument(buffer, docPages)

    // 5. Confidence boosting
    const boostedCandidates = candidates.map((c) =>
      confidenceForCandidate(c as ExtractedCandidate, classification, [])
    ) as ValidatableValue[]

    // 6. Validation
    const validationResults = runValidation(boostedCandidates as ExtractedCandidate[])

    // 7. Normalize values
    const validated = validateValues(boostedCandidates)

    // Wipe previous values for idempotency
    await db.financialValue.deleteMany({ where: { reportId } })
    await db.financialValidationResult.deleteMany({ where: { reportId } })

    // 8. Store FinancialValue rows
    const sourceTextByCode = new Map<string, string | null>()
    for (const c of boostedCandidates as any[]) {
      if (!sourceTextByCode.has(c.metricCode)) {
        sourceTextByCode.set(c.metricCode, c.sourceText ?? null)
      }
    }

    await db.financialValue.createMany({
      data: validated.results.map((r) => ({
        companyId: report.companyId,
        reportId: report.id,
        metricCode: r.metricCode,
        originalLabel: r.input.originalLabel,
        value: r.input.value,
        currency: r.input.currency || "EGP",
        unit: r.input.unit,
        normalizedValue: r.normalizedValue,
        statementType: r.statementType,
        sourcePage: r.input.sourcePage ?? null,
        sourceText: sourceTextByCode.get(r.metricCode) ?? null,
        extractionMethod: "PDF_TEXT",
        confidence: r.input.confidence ?? 1,
        validationStatus: r.validationStatus,
        validationNotes: r.validationNotes.join(" | ") || null,
        isDemoData: false,
      })),
    })

    // 9. Store FinancialValidationResult rows
    await db.financialValidationResult.createMany({
      data: validationResults.map((v) => ({
        reportId,
        checkName: v.rule,
        category: v.category ?? "MATH",
        status: v.passed ? "PASSED" : (v.severity === "FAIL" ? "FAILED" : "WARNING"),
        severity: v.severity === "FAIL" ? "CRITICAL" : "WARNING",
        details: v.reason ?? "",
      })),
    })

    // 10. Aggregate confidence
    const avgConfidence = boostedCandidates.length > 0
      ? boostedCandidates.reduce((s, c: any) => s + (c.confidence ?? 0), 0) / boostedCandidates.length
      : 0

    // 11. Update report status
    const hasFailures = validationResults.some((v) => !v.passed && v.severity === "FAIL")
    const newStatus = hasFailures ? "NEEDS_REVIEW" : "VALIDATED"
    await db.financialReport.update({
      where: { id: reportId },
      data: {
        processingStatus: newStatus,
        extractionMethod: "PDF_TEXT",
        parserVersion: "extract@2",
        extractionConfidence: avgConfidence,
        language: classification.language,
        statementType: classification.statementType,
      },
    })

    // 12. Recompute derived metrics
    const recompute: RecomputeResult = await recomputeCompany(report.companyId)
    void recompute

    // Stats
    const valuesValid = validated.results.filter((r) => r.validationStatus === "VALID").length
    const valuesNeedsReview = validated.results.filter((r) => r.validationStatus === "NEEDS_REVIEW").length
    const valuesFailed = validated.results.filter((r) => r.validationStatus === "FAILED").length

    return {
      valuesExtracted: validated.results.length,
      valuesValid,
      valuesNeedsReview,
      valuesFailed,
      confidence: avgConfidence,
      status: newStatus,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await db.financialReport.update({
      where: { id: reportId },
      data: { processingStatus: "FAILED", errorMessage: msg },
    })
    await db.financialExtractionLog.create({
      data: { reportId, stage: "EXTRACT", level: "ERROR", message: msg },
    })
    return { valuesExtracted: 0, valuesValid: 0, valuesNeedsReview: 0, valuesFailed: 0, confidence: null, status: "FAILED", error: msg }
  }
}

async function main() {
  console.log("=== Financial Statement Processing Pipeline ===\n")

  // Step 1: Make sure all test PDFs are stored as FinancialReport rows
  await storeTestPdfsIfMissing()

  // Step 2: Find all reports in NEW_DOWNLOADED status
  console.log("\n=== Step 2: Processing stored reports ===\n")
  const reports = await db.financialReport.findMany({
    where: { processingStatus: { in: ["NEW_DOWNLOADED", "PROCESSING", "FAILED"] } },
    include: { company: { select: { ticker: true, nameEn: true, sector: true } } },
    orderBy: { createdAt: "asc" },
  })

  if (reports.length === 0) {
    // Look for already-processed reports too
    const allReports = await db.financialReport.findMany({
      include: { company: { select: { ticker: true, nameEn: true, sector: true } } },
    })
    console.log(`No new reports to process. Total reports in DB: ${allReports.length}`)
    if (allReports.length > 0) {
      console.log("Existing reports:")
      for (const r of allReports) {
        console.log(`  ${r.company.ticker} — ${r.periodLabel} (${r.processingStatus})`)
      }
    }
  } else {
    console.log(`Found ${reports.length} reports to process.\n`)

    console.log("Ticker   Sector             Status        Values  Valid  Review  Failed  Confidence")
    console.log("─".repeat(100))

    const stats = { processed: 0, failed: 0, totalValues: 0, validValues: 0 }
    for (const r of reports) {
      const result = await processOneReport(r.id)
      const ticker = r.company.ticker.padEnd(8)
      const sector = (r.company.sector ?? "").padEnd(18)
      const status = result.status.padEnd(12)
      const vals = String(result.valuesExtracted).padStart(6)
      const valid = String(result.valuesValid).padStart(6)
      const review = String(result.valuesNeedsReview).padStart(6)
      const failed = String(result.valuesFailed).padStart(6)
      const conf = result.confidence !== null ? `${(result.confidence * 100).toFixed(0)}%` : "—"
      console.log(`${ticker} ${sector} ${status} ${vals}  ${valid}  ${review}  ${failed}  ${conf.padStart(6)}`)
      stats.processed++
      if (result.status === "FAILED") stats.failed++
      stats.totalValues += result.valuesExtracted
      stats.validValues += result.valuesValid
    }
    console.log("─".repeat(100))
    console.log(`Processed: ${stats.processed} | Failed: ${stats.failed} | Total values: ${stats.totalValues} | Valid: ${stats.validValues}`)
  }

  // Step 3: Coverage report + Investor signals for each company with values
  console.log("\n=== Step 3: Coverage + Investor Signals per company ===\n")
  const companies = await db.company.findMany({
    where: { isActive: true },
    select: { id: true, ticker: true, nameEn: true, sector: true },
    orderBy: { ticker: "asc" },
  })

  console.log("Ticker   Sector             Coverage  Critical  Investor  Red Flags  Signals")
  console.log("─".repeat(100))

  for (const c of companies) {
    const reports = await db.financialReport.findMany({
      where: { companyId: c.id, processingStatus: { in: ["VALIDATED", "APPROVED", "EXTRACTED"] } },
      include: { values: { select: { metricCode: true, normalizedValue: true, validationStatus: true } } },
      orderBy: { fiscalYear: "asc" },
    })
    if (reports.length === 0) {
      console.log(`${c.ticker.padEnd(8)} ${(c.sector ?? "").padEnd(18)} NO_REPORTS`)
      continue
    }
    const latestReport = reports[reports.length - 1]
    const foundCodes = new Set<string>()
    const periodValues: Record<string, number> = {}
    for (const v of latestReport.values) {
      if (v.validationStatus !== "FAILED") {
        foundCodes.add(v.metricCode)
        periodValues[v.metricCode] = v.normalizedValue
      }
    }
    const coverage = buildCoverageReport({
      companyId: c.id,
      sector: c.sector,
      periodKey: reportPeriodKey(latestReport),
      foundCodes,
    })
    // Investor signals
    const periods: PeriodSnapshot[] = reports.map((r) => ({
      periodKey: reportPeriodKey(r),
      periodType: r.periodType,
      fiscalYear: r.fiscalYear,
      periodLabel: r.periodLabel,
      values: Object.fromEntries(
        r.values.filter((v) => v.validationStatus !== "FAILED").map((v) => [v.metricCode, v.normalizedValue])
      ),
    }))
    const ctx: AnalysisContext = {
      companyId: c.id,
      companyTicker: c.ticker,
      companyName: c.nameEn,
      sector: c.sector ?? undefined,
      periods,
      anchorPeriodKey: periods[periods.length - 1]?.periodKey,
    }
    const signals = buildInvestorSignals(ctx)
    const covPct = `${(coverage.quality.overall * 100).toFixed(0)}%`.padStart(8)
    const critPct = `${(coverage.quality.criticalCoverage * 100).toFixed(0)}%`.padStart(8)
    const invPct = `${(coverage.quality.investorMetricCoverage * 100).toFixed(0)}%`.padStart(8)
    const redFlags = String(coverage.redFlags.length).padStart(9)
    const sigs = String(signals.summary.total).padStart(7)
    console.log(`${c.ticker.padEnd(8)} ${(c.sector ?? "").padEnd(18)} ${covPct}  ${critPct}  ${invPct}  ${redFlags}  ${sigs}`)
  }

  // Step 4: Sample derived metrics (show what got calculated)
  console.log("\n=== Step 4: Sample derived metrics (CalculatedMetric) ===\n")
  const sampleCompanies = ["COMI", "ORHD", "ETEL", "HRHO", "EAST", "EGAS"]
  for (const ticker of sampleCompanies) {
    const company = await db.company.findUnique({ where: { ticker } })
    if (!company) continue
    const calcMetrics = await db.calculatedMetric.findMany({
      where: { companyId: company.id, valueStatus: "OK" },
      orderBy: { code: "asc" },
      take: 8,
    })
    if (calcMetrics.length === 0) continue
    console.log(`\n${ticker} (${company.sector}):`)
    for (const cm of calcMetrics.slice(0, 6)) {
      const valueStr = cm.value !== null ? cm.value.toFixed(2) : "—"
      console.log(`  ${cm.code.padEnd(30)} = ${valueStr.padStart(10)} ${cm.unit === "PERCENT" ? "%" : ""} (formula: ${cm.formulaVersion})`)
    }
  }
}

main()
  .catch((err) => {
    console.error("Processing failed:", err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
