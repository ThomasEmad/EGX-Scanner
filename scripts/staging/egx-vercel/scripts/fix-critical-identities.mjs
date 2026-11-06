// Resolve the remaining identity criticals from audit run
// cmw0wh4ot0000bxy0tfp7t475 that are provable from the stored fields.
//
// Three kinds of change, all reversible:
//   * SCALE_UP   — a component is 1e6 too small and the scaled value closes the
//                  identity (allowed upward 1e6 correction).
//   * SIGN_FIX   — gross profit has the wrong sign; revenue - COGS proves it.
//   * QUARANTINE — the line is the demonstrable outlier and cannot be repaired
//                  from the stored fields; it is moved to NEEDS_REVIEW, never
//                  deleted.
//
// Usage:
//   node scripts/fix-critical-identities.mjs            # dry run
//   node scripts/fix-critical-identities.mjs --apply    # write
//   node scripts/fix-critical-identities.mjs --rollback

import fs from "node:fs"
import path from "node:path"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ROLLBACK = process.argv.includes("--rollback")
const OUT = path.join(process.cwd(), "reports")
const ROLLBACK_FILE = path.join(OUT, "critical-identities-rollback.json")

const SCALE_UP = [
  {
    ticker: "EGAS",
    periodLabel: "FY 2024",
    metricCode: "CURRENT_ASSETS",
    multiplier: 1_000_000,
    reason:
      "CURRENT_ASSETS 11,404.34 is 1e6 too small: 11.404B + NON_CURRENT_ASSETS 4.732B = 16.136B, within 0.83% of TOTAL_ASSETS 16.271B.",
  },
  {
    ticker: "EGAS",
    periodLabel: "FY 2024",
    metricCode: "CASH_AND_EQUIVALENTS",
    multiplier: 1_000_000,
    reason:
      "CASH_AND_EQUIVALENTS 130.59 is 1e6 too small; 130.59M is consistent with the scaled current-assets total.",
  },
]

const SIGN_FIXES = [
  {
    ticker: "NCEM",
    periodLabel: "FY 2014",
    metricCode: "GROSS_PROFIT",
    reason:
      "REVENUE 1,040,498,407.24 - COGS 1,135,089,171.54 = -94,590,764.29, exactly the absolute stored gross profit; the sign is flipped.",
  },
]

const QUARANTINE = [
  {
    ticker: "SIPC",
    periodLabel: "FY 2022",
    metricCodes: ["TOTAL_ASSETS", "TOTAL_EQUITY_AND_LIABILITIES"],
    reason:
      "Stored total 156.0M contradicts CURRENT_ASSETS 1.699B + NON_CURRENT_ASSETS 1.199B = 2.898B; the components are credible, the total is the outlier.",
  },
  {
    ticker: "FWRY",
    periodLabel: "FY 2019",
    metricCodes: ["GROSS_PROFIT"],
    reason:
      "GROSS_PROFIT equals COGS exactly (374,889,868.42); revenue - COGS = 562,334,802.62, so the gross-profit line is a duplicate mapping of COGS.",
  },
  {
    ticker: "IRON",
    periodLabel: "FY 2011",
    metricCodes: ["GROSS_PROFIT"],
    reason:
      "GROSS_PROFIT 316,656,170.81 is exactly COGS/10 and contradicts REVENUE 2.770B - COGS 3.167B = -395.8M.",
  },
  {
    ticker: "IRON",
    periodLabel: "FY 2018",
    metricCodes: ["GROSS_PROFIT"],
    reason:
      "GROSS_PROFIT 1.13B contradicts REVENUE 1.688B - COGS 2.743B = -1.055B; the line is not a gross-profit figure.",
  },
  {
    ticker: "MPCO",
    periodLabel: "FY 2022",
    metricCodes: ["COGS"],
    reason:
      "COGS 168.7M exceeds REVENUE 143.36M while GROSS_PROFIT is +22.75M; the implied COGS is 120.61M, so the stored COGS is the outlier.",
  },
  {
    ticker: "ARAB",
    periodLabel: "FY 2023",
    metricCodes: ["OPERATING_CASH_FLOW", "INVESTING_CASH_FLOW", "FINANCING_CASH_FLOW"],
    reason:
      "Legs sum to 302.8M while NET_CHANGE_IN_CASH is 0.491M and is corroborated by opening/closing cash (157.170M -> 157.661M); the legs are unusable.",
  },
  {
    ticker: "MFPC",
    periodLabel: "FY 2023",
    metricCodes: ["OPERATING_CASH_FLOW", "INVESTING_CASH_FLOW", "FINANCING_CASH_FLOW", "FX_EFFECT_CASH"],
    reason:
      "Legs + FX sum to -1.619B while NET_CHANGE_IN_CASH is 3.430B and is corroborated by opening/closing cash (4.384B -> 7.815B); the legs are unusable.",
  },
  {
    ticker: "MAAL",
    periodLabel: "FY 2022",
    metricCodes: ["NET_CHANGE_IN_CASH"],
    reason:
      "NET_CHANGE_IN_CASH 99.21M contradicts OPENING_CASH 5.998M -> CLOSING_CASH 29.827M = 23.828M; the opening/closing cash values are the simpler, corroborated pair.",
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
        value: e.oldValue,
        normalizedValue: e.oldNormalizedValue,
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

for (const c of SCALE_UP) {
  const found = await findValue(c.ticker, c.periodLabel, c.metricCode)
  if (found.error) {
    rows.push({ ...c, status: found.error })
    continue
  }
  const { report, value } = found
  const newNormalized = value.normalizedValue * c.multiplier
  const note = `AUDIT_SCALE_FIX: ${c.reason} Normalized value multiplied by ${c.multiplier}; printed value/unit preserved.`
  rollback.values.push({
    valueId: value.id,
    ticker: c.ticker,
    periodLabel: c.periodLabel,
    metricCode: c.metricCode,
    oldValue: value.value,
    oldNormalizedValue: value.normalizedValue,
    newValue: value.value,
    newNormalizedValue: newNormalized,
    oldStatus: value.validationStatus,
    oldNotes: value.validationNotes,
  })
  if (APPLY) {
    await db.financialValue.update({
      where: { id: value.id },
      data: {
        normalizedValue: newNormalized,
        validationNotes: value.validationNotes ? `${value.validationNotes} ${note}` : note,
      },
    })
  }
  rows.push({
    ...c,
    action: APPLY ? "scaled_up" : "would_scale_up",
    reportId: report.id,
    valueId: value.id,
    oldNormalizedValue: value.normalizedValue,
    newNormalizedValue: newNormalized,
  })
}

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
    oldNormalizedValue: value.normalizedValue,
    newNormalizedValue: newNormalized,
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
  scaleUps: SCALE_UP.length,
  signFixes: SIGN_FIXES.length,
  quarantines: QUARANTINE.reduce((n, c) => n + c.metricCodes.length, 0),
  rows,
}
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, "critical-identities.json"), JSON.stringify(summary, null, 2))
if (APPLY) fs.writeFileSync(ROLLBACK_FILE, JSON.stringify(rollback, null, 2))
console.log(JSON.stringify(summary, null, 1))
if (!APPLY) console.log("Dry run only. Re-run with --apply to write.")
await db.$disconnect()
