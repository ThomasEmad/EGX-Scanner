// Resolve the remaining high-severity blocker identities that are provable from
// the stored fields. Nothing is deleted; every change is reversible.
//
//   ASCM FY2021 — TOTAL_LIABILITIES 1.509B makes L+E 1.594B against assets
//     1.36B; assets, equity and the L+E total are consistent, so the
//     liabilities line is the outlier.
//   UEGC FY2021 — assets 832M, equity 1.036B, liabilities 831M and L+E 2.02B
//     cannot belong to one balance sheet; the whole balance-sheet block is
//     mixed and is quarantined.
//   VALU Q4 2024 — the CURRENT Q4-derived copies mix the annual asset total
//     (10.85B) with the Q4 equity/liability block (136M). The Q4 copies are
//     quarantined; the FY2024 annual report remains the trusted source.
//   AXPH FY2025 — the EXCEL_STATEMENTS report is a contaminated duplicate of
//     the ASKBORA_SUMMARY report; its only VALID value (OCF) is quarantined so
//     the duplicate no longer enters canonical periods.
//
// Usage:
//   node scripts/quarantine-high-blockers.mjs            # dry run
//   node scripts/quarantine-high-blockers.mjs --apply
//   node scripts/quarantine-high-blockers.mjs --rollback

import fs from "node:fs"
import path from "node:path"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ROLLBACK = process.argv.includes("--rollback")
const OUT = path.join(process.cwd(), "reports")
const ROLLBACK_FILE = path.join(OUT, "high-blockers-rollback.json")

const CASES = [
  {
    ticker: "ASCM",
    periodLabel: "FY 2021",
    metricCodes: ["TOTAL_LIABILITIES"],
    reason:
      "TOTAL_LIABILITIES 1.509B makes liabilities + equity 1.594B against TOTAL_ASSETS 1.36B; assets, equity and the L+E total agree, so the liabilities line is the outlier.",
  },
  {
    ticker: "UEGC",
    periodLabel: "FY 2021",
    metricCodes: [
      "TOTAL_ASSETS",
      "TOTAL_LIABILITIES",
      "TOTAL_EQUITY",
      "TOTAL_EQUITY_AND_LIABILITIES",
    ],
    reason:
      "Assets 832M, equity 1.036B, liabilities 831M and L+E 2.02B cannot belong to one balance sheet; the block is mixed and cannot be repaired from stored fields.",
  },
  {
    ticker: "VALU",
    periodLabel: "Q4 2024",
    metricCodes: [
      "TOTAL_ASSETS",
      "TOTAL_EQUITY",
      "TOTAL_LIABILITIES",
      "TOTAL_EQUITY_AND_LIABILITIES",
    ],
    reason:
      "CURRENT Q4-derived copies mix the annual asset total (10.85B) with the Q4 equity/liability block (136M); the Q4 balance sheet is not usable and the FY2024 annual report remains the trusted source.",
  },
  {
    ticker: "AXPH",
    periodLabel: "FY 2025",
    sourceName: "EXCEL_STATEMENTS",
    metricCodes: ["OPERATING_CASH_FLOW"],
    reason:
      "Contaminated EXCEL_STATEMENTS duplicate of the ASKBORA_SUMMARY FY2025 report; its only VALID value is quarantined so the duplicate no longer enters canonical periods.",
  },
]

async function runRollback() {
  if (!fs.existsSync(ROLLBACK_FILE)) throw new Error(`rollback file not found: ${ROLLBACK_FILE}`)
  const entries = JSON.parse(fs.readFileSync(ROLLBACK_FILE, "utf8"))
  let changed = 0
  for (const e of entries.values ?? []) {
    await db.financialValue.update({
      where: { id: e.valueId },
      data: { validationStatus: e.oldStatus, validationNotes: e.oldNotes },
    })
    changed++
  }
  console.log(JSON.stringify({ mode: "rollback", restoredValues: changed }, null, 2))
}

if (ROLLBACK) {
  await runRollback()
  await db.$disconnect()
  process.exit(0)
}

const rows = []
const rollback = { generatedAt: new Date().toISOString(), values: [] }

for (const c of CASES) {
  const company = await db.company.findUnique({ where: { ticker: c.ticker }, select: { id: true } })
  if (!company) {
    rows.push({ ...c, status: "company_not_found" })
    continue
  }
  const report = await db.financialReport.findFirst({
    where: {
      companyId: company.id,
      periodLabel: c.periodLabel,
      statementType: "CONSOLIDATED",
      deletedAt: null,
      ...(c.sourceName ? { sourceName: c.sourceName } : {}),
    },
    select: { id: true, sourceName: true },
    orderBy: { version: "desc" },
  })
  if (!report) {
    rows.push({ ...c, status: "report_not_found" })
    continue
  }
  for (const code of c.metricCodes) {
    const value = await db.financialValue.findUnique({
      where: { reportId_metricCode_subPeriod: { reportId: report.id, metricCode: code, subPeriod: "CURRENT" } },
      select: { id: true, validationStatus: true, validationNotes: true, normalizedValue: true },
    })
    if (!value) {
      rows.push({ ...c, code, status: "value_not_found", reportId: report.id })
      continue
    }
    const note = `AUDIT_QUARANTINE: ${c.reason}`
    rollback.values.push({
      valueId: value.id,
      ticker: c.ticker,
      periodLabel: c.periodLabel,
      metricCode: code,
      oldStatus: value.validationStatus,
      oldNotes: value.validationNotes,
      newStatus: "NEEDS_REVIEW",
      newNotes: value.validationNotes ? `${value.validationNotes} ${note}` : note,
    })
    if (APPLY) {
      await db.financialValue.update({
        where: { id: value.id },
        data: {
          validationStatus: "NEEDS_REVIEW",
          validationNotes: value.validationNotes ? `${value.validationNotes} ${note}` : note,
        },
      })
    }
    rows.push({
      ...c,
      code,
      status: APPLY ? "quarantined" : "would_quarantine",
      reportId: report.id,
      sourceName: report.sourceName,
      valueId: value.id,
      oldStatus: value.validationStatus,
      normalizedValue: value.normalizedValue,
    })
  }
}

const summary = {
  applied: APPLY,
  cases: CASES.length,
  values: rows.filter((r) => r.status === "quarantined" || r.status === "would_quarantine").length,
  rows,
}
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, "high-blockers-quarantine.json"), JSON.stringify(summary, null, 2))
if (APPLY) fs.writeFileSync(ROLLBACK_FILE, JSON.stringify(rollback, null, 2))
console.log(JSON.stringify(summary, null, 1))
if (!APPLY) console.log("Dry run only. Re-run with --apply to write.")
await db.$disconnect()
