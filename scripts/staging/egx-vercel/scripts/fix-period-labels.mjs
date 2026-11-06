#!/usr/bin/env node
// Period-label repair — interim reports stored with FISCAL labels.
//
//   node scripts/fix-period-labels.mjs               # plan (dry run)
//   node scripts/fix-period-labels.mjs --apply       # relabel (+ merge shells)
//   node scripts/fix-period-labels.mjs --apply --recompute  # + rebuild metrics
//   node scripts/fix-period-labels.mjs --rollback    # undo the last apply
//   node scripts/fix-period-labels.mjs --tickers=ABUK,ADCI
//
// The problem: an investor opening "Q1 2025" for a June-fiscal filer (ABUK,
// ADCI, …) sees the quarter that actually ended Sep-2024 — the stored label
// follows the filer's fiscal calendar while the platform presents it as a
// calendar quarter. 900+ interim reports across ~150 EGX companies are
// affected (askborsa harvest + an earlier TradingView import both used fiscal
// labels). Annual reports are fiscal-year based by convention and stay as-is.
//
// The fix: derive the interim label from the STORED periodEnd (the physical
// truth on the filing):
//   QUARTERLY  "Q{n} {year}"   n = calendar quarter of periodEnd
//   SEMIANNUAL "H1|H2 {year}"  half of the calendar year of periodEnd
// fiscalYear follows the periodEnd year, and every change is recorded in the
// rollback file + AuditLog.
//
// Label collision policy: if a calendar-correct report already exists for the
// same slot, the mislabeled shell is MERGED into it (only-missing value move,
// then soft-delete of the shell) — never duplicated, never destroyed blind.
import { PrismaClient } from "@prisma/client"
import { writeFileSync, readFileSync, existsSync } from "node:fs"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ROLLBACK_MODE = process.argv.includes("--rollback")
const RECOMPUTE = process.argv.includes("--recompute")
const tickersArg = process.argv.find((a) => a.startsWith("--tickers="))
const ONLY_TICKERS = tickersArg ? tickersArg.split("=")[1].split(",").map((t) => t.trim().toUpperCase()).filter(Boolean) : null

const ROLLBACK = "reports/period-labels-rollback.json"
const PLAN_OUT = "reports/period-labels-plan.json"
const MARK = "PERIOD_LABEL_FIX:"

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

function correctLabel(periodType, periodEnd) {
  const d = new Date(periodEnd)
  const y = d.getUTCFullYear()
  const q = Math.floor(d.getUTCMonth() / 3) + 1
  if (periodType === "QUARTERLY") return { label: `Q${q} ${y}`, fiscalYear: y }
  if (periodType === "SEMIANNUAL") return { label: `${q <= 2 ? "H1" : "H2"} ${y}`, fiscalYear: y }
  return null
}

async function buildPlan() {
  const companyFilter = ONLY_TICKERS
    ? (await db.company.findMany({ where: { ticker: { in: ONLY_TICKERS } }, select: { id: true } })).map((c) => c.id)
    : null
  const reports = await db.financialReport.findMany({
    where: {
      periodType: { in: ["QUARTERLY", "SEMIANNUAL"] },
      deletedAt: null,
      isDemoData: false,
      ...(companyFilter ? { companyId: { in: companyFilter } } : {}),
    },
    select: { id: true, companyId: true, periodLabel: true, periodType: true, periodEnd: true, fiscalYear: true, statementType: true, version: true, processingStatus: true, _count: { select: { values: true } } },
    orderBy: { periodEnd: "asc" },
  })
  const companies = await db.company.findMany({ select: { id: true, ticker: true } })
  const tickerOf = new Map(companies.map((c) => [c.id, c.ticker]))

  const ops = []
  const skipped = []
  for (const r of reports) {
    const fix = correctLabel(r.periodType, r.periodEnd)
    if (!fix) continue
    if (fix.label === r.periodLabel && fix.fiscalYear === r.fiscalYear) continue // already correct
    // collision: another live report on the same corrected slot?
    const twin = await db.financialReport.findFirst({
      where: { companyId: r.companyId, periodType: r.periodType, periodLabel: fix.label, statementType: r.statementType, deletedAt: null, id: { not: r.id } },
      select: { id: true, processingStatus: true, _count: { select: { values: true } }, periodEnd: true },
    })
    ops.push({
      ticker: tickerOf.get(r.companyId),
      reportId: r.id,
      from: r.periodLabel,
      to: fix.label,
      fromFiscalYear: r.fiscalYear,
      toFiscalYear: fix.fiscalYear,
      periodEnd: new Date(r.periodEnd).toISOString().slice(0, 10),
      values: r._count.values,
      twin: twin ? { id: twin.id, values: twin._count.values, periodEnd: twin.periodEnd ? new Date(twin.periodEnd).toISOString().slice(0, 10) : null, processingStatus: twin.processingStatus } : null,
    })
  }
  return { ops, skipped, scanned: reports.length }
}

async function applyOps(ops) {
  const rollback = { generatedAt: new Date().toISOString(), renames: [], merges: [] }
  let renamed = 0, merged = 0, movedValues = 0, softDeleted = 0
  for (const op of ops) {
    if (!op.twin) {
      if (!APPLY) { renamed++; continue }
      const cur = await db.financialReport.findUnique({ where: { id: op.reportId }, select: { notes: true } })
      await db.financialReport.update({
        where: { id: op.reportId },
        data: {
          periodLabel: op.to,
          fiscalYear: op.toFiscalYear,
          notes: `${cur?.notes ? cur.notes + " | " : ""}${MARK} relabeled from "${op.from}" on ${new Date().toISOString().slice(0, 10)} (periodEnd alignment)`,
        },
      })
      rollback.renames.push({ id: op.reportId, ticker: op.ticker, from: op.from, to: op.to, fromFiscalYear: op.fromFiscalYear })
      renamed++
      continue
    }
    // collision → merge values into the twin, soft-delete the shell
    if (!APPLY) { merged++; continue }
    const twinVals = await db.financialValue.findMany({ where: { reportId: op.twin.id }, select: { metricCode: true, subPeriod: true } })
    const have = new Set(twinVals.filter((v) => !v.subPeriod || v.subPeriod === "CURRENT").map((v) => v.metricCode))
    const shellVals = await db.financialValue.findMany({ where: { reportId: op.reportId }, select: { id: true, metricCode: true, subPeriod: true } })
    const movable = []
    for (const v of shellVals) {
      if ((!v.subPeriod || v.subPeriod === "CURRENT") && have.has(v.metricCode)) continue // twin wins
      movable.push(v)
    }
    if (movable.length) {
      const res = await db.financialValue.updateMany({
        where: { id: { in: movable.map((v) => v.id) } },
        data: { reportId: op.twin.id },
      })
      movedValues += res.count
      rollback.merges.push({ shellId: op.reportId, targetId: op.twin.id, ticker: op.ticker, movedValueIds: movable.map((v) => v.id) })
    }
    await db.financialReport.update({
      where: { id: op.reportId },
      data: { deletedAt: new Date(), processingStatus: "DELETED" },
    })
    softDeleted++
    merged++
  }
  if (APPLY) writeFileSync(ROLLBACK, JSON.stringify(rollback), "utf8")
  return { renamed, merged, movedValues, softDeleted }
}

async function runRollback() {
  if (!existsSync(ROLLBACK)) { console.error(`No rollback file at ${ROLLBACK}`); process.exit(1) }
  const data = JSON.parse(readFileSync(ROLLBACK, "utf8"))
  let renames = 0, merges = 0
  for (const m of data.merges ?? []) {
    if (m.movedValueIds?.length) {
      await db.financialValue.updateMany({ where: { id: { in: m.movedValueIds } }, data: { reportId: m.shellId } })
      // restore the shell
      await db.financialReport.update({ where: { id: m.shellId }, data: { deletedAt: null, processingStatus: "EXTRACTED" } }).catch(() => {})
      merges++
    }
  }
  for (const r of data.renames ?? []) {
    const cur = await db.financialReport.findUnique({ where: { id: r.id }, select: { notes: true } })
    await db.financialReport.update({
      where: { id: r.id },
      data: {
        periodLabel: r.from,
        fiscalYear: r.fromFiscalYear,
        notes: (cur?.notes ?? "").replace(new RegExp(`\\s*\\|?\\s*${MARK} relabeled from "${r.from}".*$`), ""),
      },
    })
    renames++
  }
  await db.auditLog.create({
    data: { actor: "system", action: "UPDATE", entityType: "FinancialReport", details: `${MARK} rollback: ${renames} labels restored, ${merges} merges undone` },
  })
  log(`rollback done: ${renames} labels restored, ${merges} merges undone`)
}

async function recomputeAll() {
  const PORT = process.env.PORT || "3000"
  const SECRET = process.env.CRON_SECRET
  if (!SECRET) { log("recompute skipped: CRON_SECRET not set"); return }
  log("triggering full metric recompute …")
  const res = await fetch(`http://127.0.0.1:${PORT}/api/v1/cron/recompute`, { headers: { authorization: `Bearer ${SECRET}` } })
  const body = await res.json().catch(() => ({}))
  log(res.ok && body.ok ? `recompute done: ${JSON.stringify(body.totals ?? {})}` : `recompute failed: HTTP ${res.status}`)
}

async function main() {
  if (ROLLBACK_MODE) { await runRollback(); await db.$disconnect(); return }
  log(`scanning interim reports${ONLY_TICKERS ? ` (tickers: ${ONLY_TICKERS.join(",")})` : ""} …`)
  const plan = await buildPlan()
  const byTicker = {}
  for (const op of plan.ops) byTicker[op.ticker] = (byTicker[op.ticker] ?? 0) + 1
  const twinCount = plan.ops.filter((o) => o.twin).length
  log(`scanned: ${plan.scanned} interim reports`)
  log(`to relabel: ${plan.ops.length} (collisions to merge: ${twinCount})`)
  log(`top tickers: ${Object.entries(byTicker).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t, n]) => `${t}(${n})`).join(" ")}`)
  const samples = plan.ops.slice(0, 10)
  for (const s of samples) log(`  ${s.ticker}: "${s.from}" → "${s.to}" (end ${s.periodEnd}, ${s.values} vals${s.twin ? ", twin exists" : ""})`)
  writeFileSync(PLAN_OUT, JSON.stringify({ generatedAt: new Date().toISOString(), apply: APPLY, ops: plan.ops }, null, 2), "utf8")
  if (!APPLY) {
    log("dry run only — nothing written. Re-run with --apply.")
  } else {
    const res = await applyOps(plan.ops)
    log(`apply done: ${res.renamed} relabeled, ${res.merged} merged into twins (${res.movedValues} values moved, ${res.softDeleted} shells soft-deleted) → ${ROLLBACK}`)
    await db.auditLog.create({
      data: { actor: "system", action: "UPDATE", entityType: "FinancialReport", details: `${MARK} ${res.renamed} labels fixed, ${res.merged} shells merged (${res.movedValues} values moved)` },
    })
    if (RECOMPUTE) await recomputeAll()
  }
  await db.$disconnect()
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1) })
