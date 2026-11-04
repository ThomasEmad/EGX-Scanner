// Quarantine the demonstrable outlier in cash-flow statements whose reported
// net change contradicts the opening/closing cash movement.
//
// Decision rule (evidence-based, reversible):
//   * opening/closing cash define the true movement (C-O).
//   * If the three legs (+FX) reconcile to C-O but the net-change line does
//     not, quarantine NET_CHANGE_IN_CASH.
//   * If the net change reconciles to C-O but the legs do not, quarantine the
//     three legs (+FX).
//   * If neither side reconciles, quarantine the whole flow block (legs + FX +
//     net) and keep the opening/closing cash balances.
// Nothing is deleted. Every change is recorded for rollback.
//
// Usage:
//   node scripts/quarantine-cashflow-outliers.mjs            # dry run
//   node scripts/quarantine-cashflow-outliers.mjs --apply
//   node scripts/quarantine-cashflow-outliers.mjs --rollback

import fs from "node:fs"
import path from "node:path"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ROLLBACK = process.argv.includes("--rollback")
const OUT = path.join(process.cwd(), "reports")
const ROLLBACK_FILE = path.join(OUT, "cashflow-outliers-rollback.json")

const FLOW_CODES = [
  "OPERATING_CASH_FLOW",
  "INVESTING_CASH_FLOW",
  "FINANCING_CASH_FLOW",
  "FX_EFFECT_CASH",
]
const ALL_CODES = [...FLOW_CODES, "NET_CHANGE_IN_CASH"]

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

const run = await db.auditRun.findFirst({
  where: { status: "completed" },
  orderBy: { startedAt: "desc" },
  select: { id: true, startedAt: true },
})
if (!run) throw new Error("no completed audit run found")
console.log(`Using audit run ${run.id} (${run.startedAt.toISOString()})`)

const issues = await db.auditIssue.findMany({
  where: {
    auditRunId: run.id,
    OR: [
      { severity: "critical", description: { contains: "CASH_FLOW_SUM" } },
      { severity: "high", description: { contains: "CASH_FLOW_SUM FAILED" } },
    ],
  },
  select: { ticker: true, period: true, description: true },
  orderBy: [{ ticker: "asc" }, { period: "asc" }],
})
console.log(`Cash-flow contradictions (critical/high blockers): ${issues.length}`)

const rows = []
const rollback = { generatedAt: new Date().toISOString(), values: [] }

for (const issue of issues) {
  const company = await db.company.findUnique({ where: { ticker: issue.ticker }, select: { id: true } })
  if (!company) {
    rows.push({ ...issue, status: "company_not_found" })
    continue
  }
  const report = await db.financialReport.findFirst({
    where: {
      companyId: company.id,
      periodLabel: issue.period ?? undefined,
      statementType: "CONSOLIDATED",
      deletedAt: null,
    },
    select: {
      id: true,
      sourceName: true,
      values: {
        where: { metricCode: { in: [...ALL_CODES, "OPENING_CASH", "CLOSING_CASH", "TOTAL_ASSETS"] } },
        select: { id: true, metricCode: true, normalizedValue: true, validationStatus: true, validationNotes: true },
      },
    },
    orderBy: { version: "desc" },
  })
  if (!report) {
    rows.push({ ...issue, status: "report_not_found" })
    continue
  }
  const byCode = new Map(report.values.map((v) => [v.metricCode, v]))
  const num = (code) => byCode.get(code)?.normalizedValue
  const ocf = num("OPERATING_CASH_FLOW")
  const icf = num("INVESTING_CASH_FLOW")
  const fcf = num("FINANCING_CASH_FLOW")
  const fx = num("FX_EFFECT_CASH") ?? 0
  const net = num("NET_CHANGE_IN_CASH")
  const opening = num("OPENING_CASH")
  const closing = num("CLOSING_CASH")
  if (ocf === undefined || icf === undefined || fcf === undefined || net === undefined || opening === undefined || closing === undefined) {
    rows.push({ ...issue, status: "missing_component", reportId: report.id })
    continue
  }
  const oc = closing - opening
  const legs = ocf + icf + fcf
  const legsWithFx = legs + fx
  const assets = num("TOTAL_ASSETS") ?? 0
  const base = Math.max(
    Math.abs(ocf), Math.abs(icf), Math.abs(fcf), Math.abs(net), Math.abs(assets) * 0.02,
  )
  const threshold = base * 0.01
  const band = Math.max(Math.abs(oc) * 0.10, threshold)
  const netClose = Math.abs(net - oc) <= band
  const legsClose = Math.abs(legsWithFx - oc) <= band

  let quarantine = []
  let decision = ""
  if (legsClose && !netClose) {
    quarantine = ["NET_CHANGE_IN_CASH"]
    decision = "legs reconcile to opening/closing cash; net change is the outlier"
  } else if (netClose && !legsClose) {
    quarantine = FLOW_CODES.filter((c) => byCode.has(c))
    decision = "net change reconciles to opening/closing cash; the flow legs are the outlier"
  } else if (legsClose && netClose) {
    quarantine = ["NET_CHANGE_IN_CASH"]
    decision = "both sides are near opening/closing cash; the reported net-change line is the residual outlier"
  } else {
    quarantine = ALL_CODES.filter((c) => byCode.has(c))
    decision = "neither side reconciles to opening/closing cash; the whole flow block is unreliable"
  }

  for (const code of quarantine) {
    const value = byCode.get(code)
    if (!value) continue
    const note = `AUDIT_QUARANTINE: cash-flow contradiction (C-O ${oc.toFixed(0)}; legs+FX ${legsWithFx.toFixed(0)}; net ${net.toFixed(0)}). ${decision}.`
    rollback.values.push({
      valueId: value.id,
      ticker: issue.ticker,
      periodLabel: issue.period,
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
      ticker: issue.ticker,
      period: issue.period,
      code,
      status: APPLY ? "quarantined" : "would_quarantine",
      reportId: report.id,
      sourceName: report.sourceName,
      oc,
      legsWithFx,
      net,
      netClose,
      legsClose,
      decision,
      valueId: value.id,
    })
  }
}

const summary = {
  applied: APPLY,
  auditRunId: run.id,
  issues: issues.length,
  quarantinedValues: rows.filter((r) => r.status === "quarantined" || r.status === "would_quarantine").length,
  rows,
}
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, "cashflow-outliers.json"), JSON.stringify(summary, null, 2))
if (APPLY) fs.writeFileSync(ROLLBACK_FILE, JSON.stringify(rollback, null, 2))
console.log(JSON.stringify(summary, null, 1))
if (!APPLY) console.log("Dry run only. Re-run with --apply to write.")
await db.$disconnect()
