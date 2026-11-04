// Reversible quarantine for balance-sheet equation failures found by audit run
// cmw0wh4ot0000bxy0tfp7t475. Each case is quarantined on the specific value
// that is demonstrably unsafe, not on the whole report:
//
//   ARVA FY2022/FY2023, GOCO FY2022 — TOTAL_ASSETS is duplicated across
//     companies or is 44% larger than the reported L+E total; the asset line is
//     the outlier, so it is removed from analytics while liabilities/equity stay.
//   EHDR FY2024, IRON FY2013, NAHO FY2023 — the gap is consistent with missing
//     non-controlling interest; parent TOTAL_EQUITY is quarantined so the
//     equation is not asserted with an incomplete equity base.
//   MAAL FY2021/FY2022 — TOTAL_ASSETS and TOTAL_LIABILITIES are 1000x the
//     internally consistent TOTAL_EQUITY_AND_LIABILITIES (2.56T vs 2.56B).
//     Downward scaling is not auto-applied; the two scaled lines are quarantined
//     and the equity/L+E lines remain.
//
// Nothing is deleted. Every status/notes change is recorded for rollback.
//
// Usage:
//   node scripts/quarantine-balance-sheet-failures.mjs            # dry run
//   node scripts/quarantine-balance-sheet-failures.mjs --apply    # write
//   node scripts/quarantine-balance-sheet-failures.mjs --rollback

import fs from "node:fs"
import path from "node:path"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ROLLBACK = process.argv.includes("--rollback")
const OUT = path.join(process.cwd(), "reports")
const ROLLBACK_FILE = path.join(OUT, "balance-sheet-failures-rollback.json")

const CASES = [
  {
    ticker: "ARVA",
    periodLabel: "FY 2022",
    metricCodes: ["TOTAL_ASSETS"],
    reason:
      "TOTAL_ASSETS 264,768,835.62 is identical to GOCO FY2022 and is 44.22% above the internally consistent L+E total; asset line is the outlier.",
  },
  {
    ticker: "ARVA",
    periodLabel: "FY 2023",
    metricCodes: ["TOTAL_ASSETS"],
    reason:
      "TOTAL_ASSETS 340,458,874.55 is 44.69% above the internally consistent L+E total; asset line is the outlier.",
  },
  {
    ticker: "GOCO",
    periodLabel: "FY 2022",
    metricCodes: ["TOTAL_ASSETS"],
    reason:
      "TOTAL_ASSETS 264,768,835.62 is identical to ARVA FY2022 and is 23.09% above the internally consistent L+E total; asset line is the outlier.",
  },
  {
    ticker: "EHDR",
    periodLabel: "FY 2024",
    metricCodes: ["TOTAL_EQUITY"],
    reason:
      "Parent TOTAL_EQUITY excludes a 333.6M gap that is consistent with non-controlling interest; total equity including NCI is not available.",
  },
  {
    ticker: "IRON",
    periodLabel: "FY 2013",
    metricCodes: ["TOTAL_EQUITY"],
    reason:
      "Assets are 273.9M below liabilities + parent equity; a negative/non-controlling interest balance is not captured, so the parent equity base is incomplete.",
  },
  {
    ticker: "NAHO",
    periodLabel: "FY 2023",
    metricCodes: ["TOTAL_EQUITY"],
    reason:
      "Assets exceed liabilities + parent equity by 35.9M (15.38%); the gap is consistent with missing non-controlling interest.",
  },
  {
    ticker: "MAAL",
    periodLabel: "FY 2021",
    metricCodes: ["TOTAL_ASSETS", "TOTAL_LIABILITIES"],
    reason:
      "TOTAL_ASSETS (2.56T) and TOTAL_LIABILITIES (2.43T) are 1000x the internally consistent TOTAL_EQUITY_AND_LIABILITIES (2.56B); downward scale correction is not auto-applied.",
  },
  {
    ticker: "MAAL",
    periodLabel: "FY 2022",
    metricCodes: ["TOTAL_ASSETS", "TOTAL_LIABILITIES"],
    reason:
      "TOTAL_ASSETS (2.53T) and TOTAL_LIABILITIES (2.40T) are 1000x the internally consistent TOTAL_EQUITY_AND_LIABILITIES (2.57B); downward scale correction is not auto-applied.",
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
  const company = await db.company.findUnique({ where: { ticker: c.ticker }, select: { id: true, nameEn: true } })
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
    },
    select: { id: true, periodLabel: true, sourceName: true },
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
fs.writeFileSync(path.join(OUT, "balance-sheet-failures-quarantine.json"), JSON.stringify(summary, null, 2))
if (APPLY) fs.writeFileSync(ROLLBACK_FILE, JSON.stringify(rollback, null, 2))
console.log(JSON.stringify(summary, null, 1))
if (!APPLY) console.log("Dry run only. Re-run with --apply to write.")
await db.$disconnect()
