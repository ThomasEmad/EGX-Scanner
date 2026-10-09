// Process Real PDFs Already On Disk — extract financial facts from
// already-downloaded real EGX annual report PDFs.
//
// This script:
//   1. Scans storage/real-pdfs/ for downloaded real PDFs
//   2. For each PDF, matches it to a Company by ticker prefix (ETEL-*.pdf → ETEL)
//   3. Creates/updates a FinancialReport row with full provenance
//   4. Runs the FULL extraction pipeline:
//        parsePdf → extractFromPages → confidenceForCandidate → runValidation
//        → validateValues → store FinancialValue rows → store FinancialValidationResult rows
//        → recomputeCompany (derived metrics) → update report status
//
// NEVER fabricates values. If extraction finds 0 candidates, the report is
// marked NEEDS_REVIEW with an explicit error message.

import { readFile, readdir, stat } from "node:fs/promises"
import { createHash } from "node:crypto"
import { join } from "node:path"
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
import { recomputeCompany } from "../src/lib/financial/recompute"
import { reportPeriodKey } from "../src/lib/financial/periods"
import { buildCoverageReport } from "../src/lib/financial/analysis/coverage-report"
import { buildInvestorSignals } from "../src/lib/financial/analysis/investor-signals"
import type { AnalysisContext, PeriodSnapshot } from "../src/lib/financial/analysis/types"

const STORAGE_DIR = "storage/real-pdfs"
const REAL_SOURCE_URLS: Record<string, string> = {
  "ETEL-FY2023-Annual-Report.pdf": "https://ir.te.eg/IRMedia/Financial_Information/2023/Financial_Information048fa29c-b6d9-41a2-8802-725eafdbb590.pdf",
  "ETEL-FY2020-Integrated-Annual-Report.pdf": "https://ir.te.eg/IRMedia/Financial_Information/2023/Financial_Informationf4203974-0282-4202-9cfc-6c58c420b91b.pdf",
  "ETEL-FY2018-Annual-Report.pdf": "https://ir.te.eg/IRMedia/Financial_Information/2019/Financial_Information95fb160d-b706-4edd-b322-e1bd3b25bc86.pdf",
}

// Filename pattern: TICKER-FYYYY-period-label.pdf
const PERIOD_PATTERNS: Array<{ regex: RegExp; periodLabel: string; fiscalYear: number; periodType: string; periodEnd: string }> = [
  { regex: /FY(\d{4})-Annual/, periodLabel: "FY {year} Annual Report", fiscalYear: 0, periodType: "ANNUAL", periodEnd: "{year}-12-31" },
  { regex: /FY(\d{4})-Integrated/, periodLabel: "FY {year} Integrated Annual Report", fiscalYear: 0, periodType: "ANNUAL", periodEnd: "{year}-12-31" },
  { regex: /FY(\d{4})/, periodLabel: "FY {year}", fiscalYear: 0, periodType: "ANNUAL", periodEnd: "{year}-12-31" },
  { regex: /Q(\d)-(\d{4})/, periodLabel: "Q{q} {year}", fiscalYear: 0, periodType: "QUARTERLY", periodEnd: "" },
]

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex")
}

function parsePeriodFromFilename(fileName: string): { periodLabel: string; fiscalYear: number; periodType: string; periodEnd: string } | null {
  for (const p of PERIOD_PATTERNS) {
    const m = fileName.match(p.regex)
    if (m) {
      const year = parseInt(m[1])
      return {
        periodLabel: p.periodLabel.replace("{year}", String(year)).replace("{q}", m[2] ?? "1"),
        fiscalYear: year,
        periodType: p.periodType,
        periodEnd: p.periodEnd.replace("{year}", String(year)),
      }
    }
  }
  return null
}

async function processPdfFile(filePath: string, fileName: string) {
  const ticker = fileName.split("-")[0]
  const company = await db.company.findUnique({ where: { ticker } })
  if (!company) {
    console.log(`  ✗ No company in DB for ticker ${ticker}`)
    return null
  }

  console.log(`\n  [${ticker}] ${fileName}`)
  console.log(`     Company: ${company.nameEn} [${company.sector}]`)

  const buffer = await readFile(filePath)
  console.log(`     File size: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`)

  // SHA-256 dedup
  const fileHash = sha256(buffer)
  const existing = await db.financialReport.findFirst({ where: { fileHash } })
  if (existing) {
    console.log(`     • Already in DB as report ${existing.id} (status: ${existing.processingStatus}) — re-processing for fresh extraction`)
    await db.financialValue.deleteMany({ where: { reportId: existing.id } })
    await db.financialValidationResult.deleteMany({ where: { reportId: existing.id } })
  }

  // Verify it's a PDF
  if (buffer.slice(0, 5).toString("ascii") !== "%PDF-") {
    console.log(`     ✗ Not a PDF — skipping`)
    return null
  }

  // Parse period from filename
  const periodInfo = parsePeriodFromFilename(fileName) ?? {
    periodLabel: fileName,
    fiscalYear: 2023,
    periodType: "ANNUAL",
    periodEnd: "2023-12-31",
  }
  console.log(`     Period: ${periodInfo.periodLabel} (${periodInfo.periodType})`)

  // Detect document kind (sanity check)
  const kind = detectDocumentKind(buffer)
  console.log(`     Document kind: ${kind}`)

  // Create or update FinancialReport row
  const report = existing ?? await db.financialReport.create({
    data: {
      companyId: company.id,
      reportType: periodInfo.periodType === "ANNUAL" ? "ANNUAL" : "INTERIM",
      periodType: periodInfo.periodType,
      statementType: "UNKNOWN", // will be detected by classification
      fiscalYear: periodInfo.fiscalYear,
      periodLabel: periodInfo.periodLabel,
      periodStart: new Date(`${periodInfo.fiscalYear}-01-01`),
      periodEnd: new Date(periodInfo.periodEnd),
      publicationDate: null,
      language: "UNKNOWN", // will be detected
      sourceName: "REAL_IR_PAGE",
      sourceUrl: REAL_SOURCE_URLS[fileName] ?? null,
      localFileRef: filePath,
      fileName,
      fileHash,
      fileSize: buffer.length,
      processingStatus: "PROCESSING",
      extractionMethod: null,
      parserVersion: null,
      extractionConfidence: null,
      isDemoData: false,
      discoveredAt: new Date(),
      documentType: periodInfo.periodType === "ANNUAL" ? "ANNUAL_REPORT" : "INTERIM_REPORT",
      notes: `Real source PDF — downloaded directly from ${REAL_SOURCE_URLS[fileName] ? "company IR page" : "manual upload"}`,
    },
  })

  try {
    // PARSE
    console.log(`     Parsing PDF...`)
    const pdf = await parsePdf(buffer)
    console.log(`     ✓ ${pdf.pageCount} pages, engine: ${pdf.engine}, scanned: ${pdf.looksScanned}`)
    if (pdf.error) console.log(`     PDF parser note: ${pdf.error}`)

    if (pdf.looksScanned) {
      await db.financialReport.update({
        where: { id: report.id },
        data: { processingStatus: "NEEDS_REVIEW", errorMessage: "PDF is scanned — OCR not available" },
      })
      return { reportId: report.id, status: "NEEDS_REVIEW", valuesExtracted: 0, valuesValid: 0 }
    }

    // EXTRACT
    console.log(`     Extracting financial labels...`)
    const candidates = await extractFromPages(pdf.pages, { companySector: company.sector ?? undefined }) as ValidatableValue[]
    console.log(`     ✓ ${candidates.length} candidate values extracted`)

    if (candidates.length === 0) {
      await db.financialReport.update({
        where: { id: report.id },
        data: { processingStatus: "NEEDS_REVIEW", errorMessage: "No financial labels matched from PDF" },
      })
      return { reportId: report.id, status: "NEEDS_REVIEW", valuesExtracted: 0, valuesValid: 0 }
    }

    // CLASSIFY (boost confidence)
    const docPages = pdf.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text || "" }))
    const classification = classifyDocument(buffer, docPages)
    console.log(`     Classification: language=${classification.language}, statementType=${classification.statementType}, unit=${classification.unit}, fiscalYear=${classification.fiscalYear}, confidence=${(classification.confidence * 100).toFixed(0)}%`)

    const boostedCandidates = candidates.map((c) =>
      confidenceForCandidate(c as ExtractedCandidate, classification, [])
    ) as ValidatableValue[]

    // VALIDATE
    const validationResults = runValidation(boostedCandidates as ExtractedCandidate[])
    console.log(`     Validation: ${validationResults.length} checks, ${validationResults.filter((v) => v.passed).length} passed, ${validationResults.filter((v) => !v.passed).length} failed`)

    // NORMALIZE
    const validated = validateValues(boostedCandidates)

    // Wipe previous values (idempotent)
    await db.financialValue.deleteMany({ where: { reportId: report.id } })
    await db.financialValidationResult.deleteMany({ where: { reportId: report.id } })

    // Map source text by metric code
    const sourceTextByCode = new Map<string, string | null>()
    for (const c of boostedCandidates as any[]) {
      if (!sourceTextByCode.has(c.metricCode)) {
        sourceTextByCode.set(c.metricCode, c.sourceText ?? null)
      }
    }

    // STORE FinancialValue rows
    await db.financialValue.createMany({
      data: validated.results.map((r) => ({
        companyId: company.id,
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
        extractionMethod: pdf.engine === "unpdf" ? "PDF_TEXT" : "PDF_ZLIB",
        confidence: r.input.confidence ?? 1,
        validationStatus: r.validationStatus,
        validationNotes: r.validationNotes.join(" | ") || null,
        isDemoData: false,
      })),
    })

    // STORE FinancialValidationResult rows
    await db.financialValidationResult.createMany({
      data: validationResults.map((v) => ({
        reportId: report.id,
        checkName: v.rule,
        category: v.category ?? "MATH",
        status: v.passed ? "PASSED" : (v.severity === "FAIL" ? "FAILED" : "WARNING"),
        severity: v.severity === "FAIL" ? "CRITICAL" : "WARNING",
        details: v.reason ?? "",
      })),
    })

    // Aggregate confidence
    const avgConfidence = boostedCandidates.length > 0
      ? boostedCandidates.reduce((s, c: any) => s + (c.confidence ?? 0), 0) / boostedCandidates.length
      : 0

    const hasFailures = validationResults.some((v) => !v.passed && v.severity === "FAIL")
    const newStatus = hasFailures ? "NEEDS_REVIEW" : "VALIDATED"

    // Update report
    await db.financialReport.update({
      where: { id: report.id },
      data: {
        processingStatus: newStatus,
        extractionMethod: pdf.engine === "unpdf" ? "PDF_TEXT" : "PDF_ZLIB",
        parserVersion: "extract@3-real",
        extractionConfidence: avgConfidence,
        language: classification.language,
        statementType: classification.statementType,
        notes: `Real source PDF. Extracted ${validated.results.length} values via ${pdf.engine} parser. Period auto-detected from filename.`,
      },
    })

    // Recompute derived metrics for this company
    await recomputeCompany(company.id)

    const valuesValid = validated.results.filter((r) => r.validationStatus === "VALID").length
    const valuesNeedsReview = validated.results.filter((r) => r.validationStatus === "NEEDS_REVIEW").length
    const valuesFailed = validated.results.filter((r) => r.validationStatus === "FAILED").length

    console.log(`     ✓ Stored ${validated.results.length} FinancialValue rows`)
    console.log(`     ✓ Valid: ${valuesValid} | Needs review: ${valuesNeedsReview} | Failed: ${valuesFailed}`)
    console.log(`     ✓ Avg confidence: ${(avgConfidence * 100).toFixed(0)}%`)
    console.log(`     ✓ Report status: ${newStatus}`)

    // Print top 10 extracted values for verification
    console.log(`     Sample extracted values:`)
    const sortedByConfidence = [...validated.results].sort((a, b) => (b.input.confidence ?? 0) - (a.input.confidence ?? 0))
    for (const r of sortedByConfidence.slice(0, 10)) {
      console.log(`       ${r.metricCode.padEnd(30)} = ${r.normalizedValue.toExponential(3).padStart(15)}  (${(r.input.confidence * 100).toFixed(0)}% conf, page ${r.input.sourcePage ?? "—"})`)
    }

    return {
      reportId: report.id,
      status: newStatus,
      valuesExtracted: validated.results.length,
      valuesValid,
      needsReview: valuesNeedsReview,
      failed: valuesFailed,
      confidence: avgConfidence,
      classification,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`     ✗ Extraction failed: ${msg}`)
    await db.financialReport.update({
      where: { id: report.id },
      data: { processingStatus: "FAILED", errorMessage: msg },
    })
    await db.financialExtractionLog.create({
      data: { reportId: report.id, stage: "EXTRACT", level: "ERROR", message: msg },
    })
    return { reportId: report.id, status: "FAILED", valuesExtracted: 0, valuesValid: 0, error: msg }
  }
}

async function main() {
  console.log("=== Process Real PDFs Pipeline ===\n")

  // List all PDFs in storage/real-pdfs/
  let files: string[] = []
  try {
    files = (await readdir(STORAGE_DIR)).filter((f) => f.endsWith(".pdf"))
  } catch {
    console.log(`Directory ${STORAGE_DIR} does not exist. No PDFs to process.`)
    return
  }

  if (files.length === 0) {
    console.log(`No PDFs found in ${STORAGE_DIR}/`)
    return
  }

  console.log(`Found ${files.length} real PDF(s) to process:\n`)
  for (const f of files) {
    const stats = await stat(join(STORAGE_DIR, f))
    console.log(`  - ${f.padEnd(60)} ${(stats.size / 1024 / 1024).toFixed(1)} MB`)
  }

  const results = []
  for (const f of files) {
    const filePath = join(STORAGE_DIR, f)
    const result = await processPdfFile(filePath, f)
    if (result) results.push({ file: f, ...result })
  }

  // Summary
  console.log("\n=== EXTRACTION SUMMARY ===\n")
  console.log("File".padEnd(55) + "Status".padEnd(15) + "Values".padStart(8) + "  " + "Valid".padStart(8) + "  " + "Conf".padStart(6))
  console.log("─".repeat(100))
  for (const r of results) {
    const conf = r.confidence !== undefined ? `${(r.confidence * 100).toFixed(0)}%` : "—"
    console.log(
      r.file.padEnd(55) +
      r.status.padEnd(15) +
      String(r.valuesExtracted).padStart(8) +
      "  " +
      String(r.valuesValid).padStart(8) +
      "  " +
      conf.padStart(6),
    )
  }
  console.log("─".repeat(100))

  // Per-company analysis
  console.log("\n=== PER-COMPANY ANALYSIS (real data only) ===\n")
  const companies = await db.company.findMany({
    where: { isActive: true },
    select: { id: true, ticker: true, nameEn: true, sector: true },
    orderBy: { ticker: "asc" },
  })

  console.log("Ticker   Sector             Reports  Values  Valid  Coverage  Signals")
  console.log("─".repeat(85))
  for (const c of companies) {
    const reports = await db.financialReport.findMany({
      where: { companyId: c.id, deletedAt: null },
      include: { values: { select: { metricCode: true, normalizedValue: true, validationStatus: true, confidence: true } } },
      orderBy: { fiscalYear: "asc" },
    })
    if (reports.length === 0) {
      console.log(`${c.ticker.padEnd(8)} ${(c.sector ?? "").padEnd(20)}        0        0       0       —        —`)
      continue
    }
    const validReports = reports.filter((r) => r.processingStatus === "VALIDATED" || r.processingStatus === "APPROVED")
    const totalValues = reports.reduce((s, r) => s + r.values.length, 0)
    const validValues = reports.reduce((s, r) => s + r.values.filter((v) => v.validationStatus === "VALID").length, 0)

    // Build coverage report for the latest period
    const latest = reports[reports.length - 1]
    const foundCodes = new Set(
      latest.values.filter((v) => v.validationStatus !== "FAILED").map((v) => v.metricCode),
    )
    const coverage = buildCoverageReport({
      companyId: c.id,
      sector: c.sector,
      periodKey: reportPeriodKey(latest),
      foundCodes,
    })

    // Investor signals across all periods
    const periods: PeriodSnapshot[] = validReports.map((r) => ({
      periodKey: reportPeriodKey(r),
      periodType: r.periodType,
      fiscalYear: r.fiscalYear,
      periodLabel: r.periodLabel,
      values: Object.fromEntries(
        r.values.filter((v) => v.validationStatus !== "FAILED").map((v) => [v.metricCode, v.normalizedValue]),
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

    const reportCount = String(reports.length).padStart(7)
    const valCount = String(totalValues).padStart(7)
    const valValid = String(validValues).padStart(7)
    const covPct = `${(coverage.quality.overall * 100).toFixed(0)}%`.padStart(8)
    const sigCount = String(signals.summary.total).padStart(7)
    console.log(`${c.ticker.padEnd(8)} ${(c.sector ?? "").padEnd(20)} ${reportCount}  ${valCount}  ${valValid}  ${covPct}  ${sigCount}`)
  }

  // Final DB state
  console.log("\n=== FINAL DB STATE ===")
  const finalState = {
    companies: await db.company.count(),
    reports: await db.financialReport.count(),
    values: await db.financialValue.count(),
    calculated: await db.calculatedMetric.count(),
    validation: await db.financialValidationResult.count(),
  }
  console.log(`  Companies:                 ${finalState.companies}`)
  console.log(`  FinancialReports:          ${finalState.reports}`)
  console.log(`  FinancialValues:           ${finalState.values}`)
  console.log(`  CalculatedMetrics:         ${finalState.calculated}`)
  console.log(`  FinancialValidationResults: ${finalState.validation}`)
}

main()
  .catch((err) => {
    console.error("Pipeline failed:", err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
