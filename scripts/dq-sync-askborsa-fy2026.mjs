// Adds the latest AskBorsa annual summaries for MPCI/AXPH (FY2026, and a
// corrected AXPH FY2025) and fixes their fiscal-year end dates. Both companies
// start their fiscal year in July, but the TradingView/Excel imports were dated
// 31 December. The app therefore ranked MPCI on FY2025 while AskBorsa already
// has FY2026, and AXPH FY2025 had net profit = gross profit (a 10x copy error).
//
//   node scripts/dq-sync-askborsa-fy2026.mjs            # dry run
//   node scripts/dq-sync-askborsa-fy2026.mjs --apply
//   node scripts/dq-sync-askborsa-fy2026.mjs --rollback
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ROLLBACK = process.argv.includes("--rollback")
const PATH = "reports/askborsa-fy2026-rollback.json"

const PERIOD_END_FIXES = [
  // MPCI: fiscal year starts July; FY N ends 30 June N.
  ...[2021, 2022, 2023, 2024, 2025].map((y) => ({ ticker: "MPCI", year: y, old: `${y}-12-31`, value: `${y}-06-30` })),
  // AXPH: same July–June fiscal year.
  ...[2021, 2022, 2023, 2024, 2025].map((y) => ({ ticker: "AXPH", year: y, old: `${y}-12-31`, value: `${y}-06-30` })),
]

const REPORTS = [
  {
    ticker: "MPCI", year: 2026, version: 1, periodStart: "2025-07-01", periodEnd: "2026-06-30",
    sourceUrl: "https://askborsa.com/company/MPCI",
    note: "AskBorsa annual summary FY2026 (fiscal year starts July); cross-checked against the AskBorsa company financial table.",
    values: [
      ["NET_PROFIT", 480_000_000, "صافي الربح 2026 = 480 مليون"],
      ["GROSS_PROFIT", 707_000_000, "مجمل الربح 2026 = 707 مليون"],
      ["TOTAL_ASSETS", 1_490_000_000, "إجمالي الأصول 2026 = 1.49 مليار"],
      ["TOTAL_LIABILITIES", 647_000_000, "إجمالي المطلوبات 2026 = 647 مليون"],
      ["TOTAL_EQUITY", 843_000_000, "حقوق المساهمين 2026 = 843 مليون"],
      ["TOTAL_EQUITY_AND_LIABILITIES", 1_490_000_000, "إجمالي المطلوبات وحقوق المساهمين 2026 = 1.49 مليار"],
      ["OPERATING_CASH_FLOW", 220_000_000, "التدفق النقدي التشغيلي 2026 = 220 مليون"],
    ],
  },
  {
    ticker: "AXPH", year: 2025, version: 2, periodStart: "2024-07-01", periodEnd: "2025-06-30",
    sourceUrl: "https://askborsa.com/company/AXPH",
    note: "AskBorsa annual summary FY2025 (fiscal year starts July). Supersedes the Excel report whose net profit and gross profit were both 539.894m (a 10x copy error; AskBorsa FY2025 net profit is 53.59m). Assets/liabilities derived from total liabilities+equity 1.53bn minus equity 994m because AskBorsa prints a dash for those two lines.",
    values: [
      ["NET_PROFIT", 53_590_000, "صافي الربح 2025 = 53.59 مليون"],
      ["GROSS_PROFIT", 98_720_000, "مجمل الربح 2025 = 98.72 مليون"],
      ["TOTAL_ASSETS", 1_530_000_000, "إجمالي الأصول 2025 = 1.53 مليار (مشتق من إجمالي المطلوبات وحقوق المساهمين)"],
      ["TOTAL_LIABILITIES", 536_000_000, "إجمالي المطلوبات 2025 = 536 مليون (مشتق: 1.53 مليار - 994 مليون)"],
      ["TOTAL_EQUITY", 994_000_000, "حقوق المساهمين 2025 = 994 مليون"],
      ["TOTAL_EQUITY_AND_LIABILITIES", 1_530_000_000, "إجمالي المطلوبات وحقوق المساهمين 2025 = 1.53 مليار"],
    ],
  },
  {
    ticker: "AXPH", year: 2026, version: 1, periodStart: "2025-07-01", periodEnd: "2026-06-30",
    sourceUrl: "https://askborsa.com/company/AXPH",
    note: "AskBorsa annual summary FY2026 (fiscal year starts July); cross-checked against the AskBorsa company financial table.",
    values: [
      ["NET_PROFIT", 660_000_000, "صافي الربح 2026 = 660 مليون"],
      ["GROSS_PROFIT", 1_350_000_000, "مجمل الربح 2026 = 1.35 مليار"],
      ["TOTAL_ASSETS", 1_780_000_000, "إجمالي الأصول 2026 = 1.78 مليار"],
      ["TOTAL_LIABILITIES", 597_000_000, "إجمالي المطلوبات 2026 = 597 مليون"],
      ["TOTAL_EQUITY", 1_180_000_000, "حقوق المساهمين 2026 = 1.18 مليار"],
      ["TOTAL_EQUITY_AND_LIABILITIES", 1_780_000_000, "إجمالي المطلوبات وحقوق المساهمين 2026 = 1.78 مليار"],
      ["OPERATING_CASH_FLOW", 522_000_000, "التدفق النقدي التشغيلي 2026 = 522 مليون"],
    ],
  },
]

// Old AXPH FY2025 values are superseded; keep them for provenance but mark them
// non-authoritative so nothing can silently fall back to the 10x figures.
const OLD_QUARANTINE = {
  ticker: "AXPH", year: 2025, metrics: ["NET_PROFIT", "GROSS_PROFIT", "TOTAL_ASSETS", "TOTAL_EQUITY", "TOTAL_LIABILITIES", "REVENUE"],
  reason: "superseded by ASKBORA_SUMMARY FY2025: old Excel report had net profit = gross profit = 539.894m (10x the AskBorsa net profit 53.59m) and a FY2026-like balance sheet",
}

async function annualReport(companyId, year) {
  return db.financialReport.findFirst({ where: { companyId, fiscalYear: year, periodType: "ANNUAL" }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], select: { id: true, version: true, sourceName: true, periodEnd: true } })
}

async function main() {
  if (ROLLBACK) {
    if (!existsSync(PATH)) throw new Error(`No rollback file at ${PATH}`)
    const data = JSON.parse(readFileSync(PATH, "utf8"))
    let n = 0
    for (const r of data.reports ?? []) {
      await db.financialReport.delete({ where: { id: r.id } }).catch(() => {})
      n++
    }
    for (const c of data.periodEnds ?? []) {
      await db.financialReport.update({ where: { id: c.id }, data: { periodEnd: new Date(c.old) } }).catch(() => {})
      n++
    }
    for (const q of data.quarantines ?? []) {
      await db.financialValue.update({ where: { id: q.id }, data: { validationStatus: q.oldStatus, validationNotes: q.oldNotes } }).catch(() => {})
      n++
    }
    console.log(`Rolled back ${n} change(s)`)
    return
  }

  const rollback = { reports: [], periodEnds: [], quarantines: [] }

  for (const f of PERIOD_END_FIXES) {
    const c = await db.company.findUnique({ where: { ticker: f.ticker }, select: { id: true } })
    if (!c) { console.log(`SKIP ${f.ticker}: missing`); continue }
    const r = await annualReport(c.id, f.year)
    if (!r) { console.log(`SKIP ${f.ticker} ${f.year}: report missing`); continue }
    const current = r.periodEnd?.toISOString().slice(0, 10)
    if (current === f.value) { console.log(`OK   ${f.ticker} ${f.year} periodEnd already ${f.value}`); continue }
    if (current !== f.old) { console.log(`SKIP ${f.ticker} ${f.year} periodEnd ${current} != ${f.old}`); continue }
    console.log(`FIX  ${f.ticker} ${f.year} periodEnd ${current} -> ${f.value}`)
    rollback.periodEnds.push({ id: r.id, ticker: f.ticker, year: f.year, old: current })
    if (APPLY) await db.financialReport.update({ where: { id: r.id }, data: { periodEnd: new Date(`${f.value}T00:00:00.000Z`) } })
  }

  for (const spec of REPORTS) {
    const c = await db.company.findUnique({ where: { ticker: spec.ticker }, select: { id: true } })
    if (!c) { console.log(`SKIP ${spec.ticker}: missing`); continue }
    const existing = await db.financialReport.findFirst({ where: { companyId: c.id, fiscalYear: spec.year, periodType: "ANNUAL", sourceName: "ASKBORA_SUMMARY", version: spec.version }, select: { id: true } })
    if (existing) { console.log(`OK   ${spec.ticker} FY${spec.year} ASKBORA_SUMMARY v${spec.version} already exists`); continue }
    console.log(`NEW  ${spec.ticker} FY${spec.year} ASKBORA_SUMMARY v${spec.version} (${spec.values.length} values)`)
    if (!APPLY) continue
    const report = await db.financialReport.create({
      data: {
        companyId: c.id,
        reportType: "ANNUAL",
        periodType: "ANNUAL",
        statementType: "CONSOLIDATED",
        fiscalYear: spec.year,
        periodLabel: `FY ${spec.year}`,
        periodStart: new Date(`${spec.periodStart}T00:00:00.000Z`),
        periodEnd: new Date(`${spec.periodEnd}T00:00:00.000Z`),
        language: "MIXED",
        sourceName: "ASKBORA_SUMMARY",
        sourceUrl: spec.sourceUrl,
        processingStatus: "APPROVED",
        extractionMethod: "MANUAL_ENTRY",
        parserVersion: "askborsa-summary@1",
        extractionConfidence: 1,
        version: spec.version,
        notes: spec.note,
      },
    })
    rollback.reports.push({ id: report.id, ticker: spec.ticker, year: spec.year, version: spec.version })
    for (const [metricCode, value, sourceText] of spec.values) {
      await db.financialValue.create({
        data: {
          companyId: c.id,
          reportId: report.id,
          metricCode,
          originalLabel: `AskBorsa annual summary — ${metricCode}`,
          value,
          currency: "EGP",
          unit: "UNIT",
          normalizedValue: value,
          statementType: "CONSOLIDATED",
          subPeriod: "CURRENT",
          extractionMethod: "MANUAL_ENTRY",
          confidence: 1,
          validationStatus: "VALID",
          validationNotes: `ASKBORA_SUMMARY: ${spec.note}`,
          sourceText,
        },
      })
    }
  }

  const qc = await db.company.findUnique({ where: { ticker: OLD_QUARANTINE.ticker }, select: { id: true } })
  const qr = qc && await db.financialReport.findFirst({ where: { companyId: qc.id, fiscalYear: OLD_QUARANTINE.year, periodType: "ANNUAL", version: 1 }, select: { id: true } })
  if (qr) {
    for (const metric of OLD_QUARANTINE.metrics) {
      const v = await db.financialValue.findFirst({ where: { reportId: qr.id, metricCode: metric }, select: { id: true, validationStatus: true, validationNotes: true } })
      if (!v) { console.log(`SKIP AXPH 2025 ${metric}: missing`); continue }
      if (v.validationStatus === "NEEDS_REVIEW" && (v.validationNotes ?? "").includes(OLD_QUARANTINE.reason)) { console.log(`OK   AXPH 2025 ${metric} already quarantined`); continue }
      console.log(`QUAR AXPH 2025 ${metric}`)
      rollback.quarantines.push({ id: v.id, metric, oldStatus: v.validationStatus, oldNotes: v.validationNotes })
      if (APPLY) await db.financialValue.update({ where: { id: v.id }, data: { validationStatus: "NEEDS_REVIEW", validationNotes: `AUDIT_QUARANTINE: ${OLD_QUARANTINE.reason}` } })
    }
  } else {
    console.log("SKIP AXPH 2025 quarantine: version-1 report missing")
  }

  if (APPLY) { mkdirSync("reports", { recursive: true }); writeFileSync(PATH, JSON.stringify(rollback, null, 2), "utf8"); console.log(`\nApplied. Rollback: ${PATH}`) }
  else console.log("\nDry run — re-run with --apply to write.")
}
main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
