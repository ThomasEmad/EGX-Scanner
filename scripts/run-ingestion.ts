// Ingestion runner — runs the full pipeline (search → download → content-verify →
// dedup → store) for all seeded EGX companies targeting FY2023 ANNUAL reports.
//
// Spec: User asked "نضيف كل القوائم المالية للشركات ونستخرجها ونحللها"
//   Source: web search + download
//   Scope: 16 companies (8 sectors)
//   Target period: FY2023 ANNUAL
//
// Output: For each company, records:
//   - IngestionRun row with all stats
//   - One FinancialReport per discovered PDF
//   - Per-document errors recorded in IngestionError
//   - Downloaded PDFs stored under storage/ingested/{TICKER}-FY2023-*.pdf
//
// Idempotent: re-running will skip PDFs already in DB (by SHA-256 hash).
// Rate-limited: 2s between requests, exponential backoff on transient errors.

import { db } from "../src/lib/db"
import { runIngestion, type IngestionRequest } from "../src/lib/ingestion/orchestrator"

const TARGET_FISCAL_YEAR = 2023
const TARGET_PERIOD_TYPE = "ANNUAL"

async function main() {
  console.log(`\n=== Ingestion Runner — FY${TARGET_FISCAL_YEAR} ${TARGET_PERIOD_TYPE} ===\n`)

  // Load all active companies
  const companies = await db.company.findMany({
    where: { isActive: true },
    select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true },
    orderBy: { ticker: "asc" },
  })

  if (companies.length === 0) {
    console.error("No active companies in DB. Run `npx tsx scripts/seed-companies.ts` first.")
    process.exit(1)
  }

  console.log(`Found ${companies.length} active companies.`)
  console.log(`Target: FY${TARGET_FISCAL_YEAR} ${TARGET_PERIOD_TYPE}`)
  console.log(`Estimated time: ~${Math.ceil(companies.length * 30 / 60)} minutes (web search + downloads + 2s rate-limit)\n`)

  const reqs: IngestionRequest[] = companies.map((c) => ({
    companyId: c.id,
    fiscalYear: TARGET_FISCAL_YEAR,
    periodType: TARGET_PERIOD_TYPE,
    minConfidence: 0.4, // Filter out low-quality results
  }))

  console.log("=== Running ingestion ===\n")
  const result = await runIngestion(reqs)

  // Print per-company outcomes
  console.log(`\n=== Per-company outcomes (runId: ${result.runId}) ===\n`)
  console.log("Ticker   Sector             Docs  Stored  Failed  Errors  Duration")
  console.log("─".repeat(80))

  let totalDocs = 0
  let totalStored = 0
  let totalFailed = 0
  let totalErrors = 0

  for (const outcome of result.outcomes) {
    const company = companies.find((c) => c.id === outcome.companyId)!
    const sector = (company.sector ?? "").padEnd(18)
    const docs = String(outcome.documentsDiscovered).padStart(4)
    const stored = String(outcome.documentsStored).padStart(6)
    const failed = String(outcome.documentsFailed).padStart(6)
    const errors = String(outcome.errors.length).padStart(6)
    const duration = `${(outcome.durationMs / 1000).toFixed(1)}s`.padStart(8)
    console.log(`${company.ticker.padEnd(8)} ${sector} ${docs}  ${stored}  ${failed}  ${errors}  ${duration}`)
    totalDocs += outcome.documentsDiscovered
    totalStored += outcome.documentsStored
    totalFailed += outcome.documentsFailed
    totalErrors += outcome.errors.length
  }

  console.log("─".repeat(80))
  console.log(`${"TOTAL".padEnd(8)} ${"".padEnd(18)} ${String(totalDocs).padStart(4)}  ${String(totalStored).padStart(6)}  ${String(totalFailed).padStart(6)}  ${String(totalErrors).padStart(6)}`)

  // List stored reports
  console.log(`\n=== Stored reports ===\n`)
  const storedReports = await db.financialReport.findMany({
    where: { ingestionRunId: result.runId },
    include: { company: { select: { ticker: true, nameEn: true, sector: true } } },
    orderBy: { createdAt: "asc" },
  })

  if (storedReports.length === 0) {
    console.log("No reports were stored this run. The web search likely found PDFs that")
    console.log("either failed content verification (not financial) or were already in DB.")
    console.log("\nNext steps:")
    console.log("  1. Check the IngestionError table for failure reasons: npx prisma studio")
    console.log("  2. Lower minConfidence threshold in the script")
    console.log("  3. Manually upload PDFs via /admin/extraction-review")
  } else {
    console.log(`Stored ${storedReports.length} new reports:\n`)
    for (const r of storedReports) {
      console.log(`  ${r.company.ticker} — ${r.company.nameEn}`)
      console.log(`    Report ID: ${r.id}`)
      console.log(`    Period: ${r.periodLabel} (FY${r.fiscalYear})`)
      console.log(`    Status: ${r.processingStatus}`)
      console.log(`    File: ${r.fileName ?? r.localFileRef ?? "—"} (${r.fileSize ?? 0} bytes)`)
      console.log(`    Source: ${r.sourceUrl ?? "—"}\n`)
    }
  }

  // Summary
  console.log(`\n=== Summary ===`)
  console.log(`  Companies processed: ${companies.length}`)
  console.log(`  Documents discovered: ${totalDocs}`)
  console.log(`  Documents stored: ${totalStored}`)
  console.log(`  Documents failed: ${totalFailed}`)
  console.log(`  Errors recorded: ${totalErrors}`)
  console.log(`  Ingestion run ID: ${result.runId}`)
  console.log(`\nNext steps:`)
  console.log(`  1. Process the stored reports: npx tsx scripts/process-stored-reports.ts`)
  console.log(`  2. View results in admin UI: /admin/extraction-review`)
  console.log(`  3. Inspect DB directly: npx prisma studio`)
}

main()
  .catch((err) => {
    console.error("Ingestion runner failed:", err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
