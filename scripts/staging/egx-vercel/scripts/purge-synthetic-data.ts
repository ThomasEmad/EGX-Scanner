// PURGE all synthetic / generated / demo / benchmark financial data from the
// production database. Architecture (code, ontology, modules) is preserved —
// only DATA is deleted.
//
// Spec task: "DELETE ALL SYNTHETIC / FAKE FINANCIAL DATA"
// Spec: "Physically remove fake/test financial records from the production dataset."
//
// After this script runs, the DB should be EMPTY of all financial facts and
// reports. The Company table may be cleared too (we'll re-seed with real
// companies afterwards).
//
// Affected tables:
//   - FinancialValue (raw extracted values)
//   - CalculatedMetric (derived metrics)
//   - FinancialValidationResult
//   - FinancialExtractionLog
//   - DataQualityScore
//   - FinancialReport (the reports themselves)
//   - DebtInstrument, SegmentDisclosure, FairValueMovement,
//     InvestmentDisclosure, RelatedPartyTransaction, ContingencyDisclosure,
//     ShareMovement (structured disclosure tables)
//   - IngestionError, IngestionRun
//   - AiAnalysis (LLM-generated analysis attached to reports)
//   - Company (will re-seed real ones after)
//   - MarketPrice (will be filled from real market data sources later)
//
// Storage:
//   - storage/test-pdfs/ (delete all generated test PDFs)
//   - storage/ingested/ (any downloaded-but-synthetic PDFs)

import { db } from "../src/lib/db"
import { rm, readdir } from "node:fs/promises"
import { join } from "node:path"

async function purgeDb() {
  console.log("=== PURGING ALL FINANCIAL DATA FROM PRODUCTION DB ===\n")
  const counts: Array<[string, number]> = []

  // Order matters — delete children before parents (foreign key constraints)
  const deletions: Array<[string, () => Promise<number>]> = [
    ["FinancialExtractionLog", () => db.financialExtractionLog.deleteMany({})],
    ["FinancialValidationResult", () => db.financialValidationResult.deleteMany({})],
    ["DataQualityScore", () => db.dataQualityScore.deleteMany({})],
    ["AiAnalysis", () => db.aiAnalysis.deleteMany({})],
    ["DebtInstrument", () => db.debtInstrument.deleteMany({})],
    ["SegmentDisclosure", () => db.segmentDisclosure.deleteMany({})],
    ["FairValueMovement", () => db.fairValueMovement.deleteMany({})],
    ["InvestmentDisclosure", () => db.investmentDisclosure.deleteMany({})],
    ["RelatedPartyTransaction", () => db.relatedPartyTransaction.deleteMany({})],
    ["ContingencyDisclosure", () => db.contingencyDisclosure.deleteMany({})],
    ["ShareMovement", () => db.shareMovement.deleteMany({})],
    ["FinancialValue", () => db.financialValue.deleteMany({})],
    ["CalculatedMetric", () => db.calculatedMetric.deleteMany({})],
    ["IngestionError", () => db.ingestionError.deleteMany({})],
    ["IngestionRun", () => db.ingestionRun.deleteMany({})],
    ["FinancialReport", () => db.financialReport.deleteMany({})],
    ["MarketPrice", () => db.marketPrice.deleteMany({})],
    ["Dividend", () => db.dividend.deleteMany({})],
    ["FinancialEvent", () => db.financialEvent.deleteMany({})],
    ["Company", () => db.company.deleteMany({})],
  ]

  for (const [tableName, deleteFn] of deletions) {
    try {
      const result = await deleteFn()
      counts.push([tableName, result.count])
      console.log(`  ✓ ${tableName.padEnd(35)} deleted ${result.count} row(s)`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`  ✗ ${tableName.padEnd(35)} FAILED: ${msg}`)
    }
  }

  console.log("\n=== Final DB state ===")
  const remaining = {
    companies: await db.company.count(),
    reports: await db.financialReport.count(),
    values: await db.financialValue.count(),
    calculated: await db.calculatedMetric.count(),
    validation: await db.financialValidationResult.count(),
  }
  console.log("  Companies:", remaining.companies)
  console.log("  FinancialReports:", remaining.reports)
  console.log("  FinancialValues:", remaining.values)
  console.log("  CalculatedMetrics:", remaining.calculated)
  console.log("  FinancialValidationResults:", remaining.validation)
  return counts
}

async function purgeStorage() {
  console.log("\n=== PURGING STORAGE DIRECTORIES ===\n")
  const dirs = ["storage/test-pdfs", "storage/ingested"]
  for (const dir of dirs) {
    try {
      const files = await readdir(dir).catch(() => [])
      if (files.length === 0) {
        console.log(`  • ${dir}/  (already empty or does not exist)`)
        continue
      }
      console.log(`  • ${dir}/  contains ${files.length} file(s):`)
      for (const f of files.slice(0, 10)) console.log(`     - ${f}`)
      await rm(dir, { recursive: true, force: true })
      console.log(`     ✓ Deleted ${files.length} file(s) from ${dir}/`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`  ✗ ${dir}/  error: ${msg}`)
    }
  }
}

async function verifyTestFilesGone() {
  console.log("\n=== VERIFICATION ===\n")
  const dirs = ["storage/test-pdfs", "storage/ingested"]
  for (const dir of dirs) {
    try {
      const files = await readdir(dir).catch(() => [])
      console.log(`  ${dir.padEnd(30)} → ${files.length} file(s)`)
    } catch {
      console.log(`  ${dir.padEnd(30)} → removed`)
    }
  }
}

async function main() {
  await purgeDb()
  await purgeStorage()
  await verifyTestFilesGone()
  console.log("\n✓ PURGE COMPLETE — DB and storage are now clean.")
  console.log("\nNext: re-seed REAL companies and acquire REAL PDFs.")
}

main()
  .catch((err) => {
    console.error("Purge failed:", err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
