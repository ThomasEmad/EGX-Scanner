// Resolve the PBT / tax / net-profit audit failures in run
// cmw0wh4ot0000bxy0tfp7t475.
//
// Two cases are provable sign errors: the reported net profit equals
// PBT + INCOME_TAX, not PBT - INCOME_TAX, so the stored tax sign is flipped.
// Those are corrected in place and recorded for rollback.
//
// The remaining cases cannot be reconciled from the stored fields alone
// (possible non-controlling interest, discontinued operations or a
// cumulative-vs-standalone quarter). Their PBT and tax lines are moved to
// NEEDS_REVIEW so the unverifiable identity is not asserted, while net profit
// stays available. Nothing is deleted.
//
// Usage:
//   node scripts/fix-pbt-tax-failures.mjs            # dry run
//   node scripts/fix-pbt-tax-failures.mjs --apply    # write
//   node scripts/fix-pbt-tax-failures.mjs --rollback

import fs from "node:fs"
import path from "node:path"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ROLLBACK = process.argv.includes("--rollback")
const OUT = path.join(process.cwd(), "reports")
const ROLLBACK_FILE = path.join(OUT, "pbt-tax-failures-rollback.json")

const SIGN_FIXES = [
  {
    ticker: "EGTS",
    periodLabel: "FY 2024",
    metricCode: "INCOME_TAX",
    reason:
      "Stored -61,013,777 makes PBT - tax = -351.1M, but reported net profit is -473.1M; PBT + tax = -473.1M exactly. Tax sign is flipped.",
  },
  {
    ticker: "MMAT",
    periodLabel: "FY 2025",
    metricCode: "INCOME_TAX",
    reason:
      "Stored -379,260 makes PBT - tax = +303,240, but reported net profit is -455,280; PBT + tax = -455,280 exactly. Tax sign is flipped.",
  },
]

const QUARANTINE = [
  {
    ticker: "AMER",
    periodLabel: "9M 2025",
    metricCodes: ["PROFIT_BEFORE_TAX", "INCOME_TAX"],
    reason:
      "PBT - tax = 147.7M vs net profit 99.9M; parent net profit is 85.4M, so the 47.8M gap is not fully explained by NCI. Source period may mix 9M and annual figures.",
  },
  {
    ticker: "BINV",
    periodLabel: "Q2 2026",
    metricCodes: ["PROFIT_BEFORE_TAX", "INCOME_TAX"],
    reason:
      "Negative tax and a 51.4% gap on a Q2 2026 TradingView report suggest a cumulative/standalone or sign mismatch; the quarter cannot be reconciled from stored fields.",
  },
  {
    ticker: "FIRE",
    periodLabel: "FY 2024",
    metricCodes: ["PROFIT_BEFORE_TAX", "INCOME_TAX"],
    reason:
      "PBT is -2.66M while net profit is +1.32M and tax is 3,470; the identity is off by 149.7% and the source does not provide a reconciling item.",
  },
  {
    ticker: "GIHD",
    periodLabel: "FY 2024",
    metricCodes: ["PROFIT_BEFORE_TAX", "INCOME_TAX"],
    reason:
      "PBT - tax = 1.99M vs net profit 0.95M (52.6% gap); the difference is consistent with non-controlling interest but no NCI line is stored.",
  },
  {
    ticker: "OFH",
    periodLabel: "FY 2024",
    metricCodes: ["PROFIT_BEFORE_TAX", "INCOME_TAX"],
    reason:
      "PBT - tax = 221.4M vs net profit 41.0M (70.5% gap); the difference is consistent with non-controlling interest but no NCI line is stored.",
  },
]

async function runRollback() {
  if (!fs.existsSync(ROLLBACK_FILE)) throw new Error(`rollback file not found: ${ROLLBACK_FILE}`)
  const entries = JSON.parse(fs.readFileSync(ROLLBACK_FILE, "utf8"))
  let changed = 0
  for (const e of entries.values ?? []) {
    await db.financialValue.update({
      where: { id: e.valueId },
      data: {
        normalizedValue: e.oldNormalizedValue,
        value: e.oldValue,
        validationStatus: e.oldStatus,
        validationNotes: e.oldNotes,
      },
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

async function findValue(ticker, periodLabel, metricCode) {
  const company = await db.company.findUnique({ where: { ticker }, select: { id: true } })
  if (!company) return { error: "company_not_found" }
  const report = await db.financialReport.findFirst({
    where: {
      companyId: company.id,
      periodLabel,
      statementType: "CONSOLIDATED",
      deletedAt: null,
    },
    select: { id: true, sourceName: true },
  })
  if (!report) return { error: "report_not_found" }
  const value = await db.financialValue.findUnique({
    where: { reportId_metricCode_subPeriod: { reportId: report.id, metricCode, subPeriod: "CURRENT" } },
    select: {
      id: true,
      value: true,
      normalizedValue: true,
      validationStatus: true,
      validationNotes: true,
      unit: true,
    },
  })
  if (!value) return { error: "value_not_found", reportId: report.id }
  return { report, value }
}

const rows = []
const rollback = { generatedAt: new Date().toISOString(), values: [] }

for (const c of SIGN_FIXES) {
  const found = await findValue(c.ticker, c.periodLabel, c.metricCode)
  if (found.error) {
    rows.push({ ...c, status: found.error })
    continue
  }
  const { report, value } = found
  const newNormalized = -value.normalizedValue
  const newValue = -value.value
  const note = `AUDIT_SIGN_FIX: ${c.reason}`
  rollback.values.push({
    valueId: value.id,
    ticker: c.ticker,
    periodLabel: c.periodLabel,
    metricCode: c.metricCode,
    oldValue: value.value,
    oldNormalizedValue: value.normalizedValue,
    newValue,
    newNormalizedValue: newNormalized,
    oldStatus: value.validationStatus,
    oldNotes: value.validationNotes,
  })
  if (APPLY) {
    await db.financialValue.update({
      where: { id: value.id },
      data: {
        value: newValue,
        normalizedValue: newNormalized,
        validationNotes: value.validationNotes ? `${value.validationNotes} ${note}` : note,
      },
    })
  }
  rows.push({
    ...c,
    action: APPLY ? "sign_fixed" : "would_fix_sign",
    reportId: report.id,
    valueId: value.id,
    oldValue: value.normalizedValue,
    newValue: newNormalized,
  })
}

for (const c of QUARANTINE) {
  for (const code of c.metricCodes) {
    const found = await findValue(c.ticker, c.periodLabel, code)
    if (found.error) {
      rows.push({ ...c, code, status: found.error })
      continue
    }
    const { report, value } = found
    const note = `AUDIT_QUARANTINE: ${c.reason}`
    rollback.values.push({
      valueId: value.id,
      ticker: c.ticker,
      periodLabel: c.periodLabel,
      metricCode: code,
      oldValue: value.value,
      oldNormalizedValue: value.normalizedValue,
      newValue: value.value,
      newNormalizedValue: value.normalizedValue,
      oldStatus: value.validationStatus,
      oldNotes: value.validationNotes,
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
      action: APPLY ? "quarantined" : "would_quarantine",
      reportId: report.id,
      valueId: value.id,
      oldStatus: value.validationStatus,
      normalizedValue: value.normalizedValue,
    })
  }
}

const summary = {
  applied: APPLY,
  signFixes: SIGN_FIXES.length,
  quarantines: QUARANTINE.reduce((n, c) => n + c.metricCodes.length, 0),
  rows,
}
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, "pbt-tax-failures.json"), JSON.stringify(summary, null, 2))
if (APPLY) fs.writeFileSync(ROLLBACK_FILE, JSON.stringify(rollback, null, 2))
console.log(JSON.stringify(summary, null, 1))
if (!APPLY) console.log("Dry run only. Re-run with --apply to write.")
await db.$disconnect()
