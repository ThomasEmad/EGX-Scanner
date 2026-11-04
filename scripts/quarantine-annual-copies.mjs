// Reversibly quarantine quarterly values that are proven annual copies and have
// no verified AskBorsa discrete replacement.
//
//   node scripts/quarantine-annual-copies.mjs            # dry run
//   node scripts/quarantine-annual-copies.mjs --apply    # write + rollback
//   node scripts/quarantine-annual-copies.mjs --rollback # undo
//
// Evidence rule: a report is quarantined only when at least TWO of its values
// equal the annual FY value within 0.5%.  Single-value coincidences are left
// untouched and stay in the review file.  Q4 stock values are never quarantined
// because Q4 stock legitimately equals FY.
import { PrismaClient } from "@prisma/client"
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"

const db = new PrismaClient()
const PLAN = "reports/askborsa-quarterly-plan.json"
const ROLLBACK = "reports/annual-copy-quarantine.json"
const MARK = "AUDIT_QUARANTINE:"
const APPLY = process.argv.includes("--apply")
const ROLLBACK_MODE = process.argv.includes("--rollback")
const STOCK = new Set(["TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY", "TOTAL_EQUITY_AND_LIABILITIES"])

function approx(a, b) {
  return Math.abs(a - b) <= Math.max(Math.abs(b) * 0.005, 1)
}

async function runRollback() {
  if (!existsSync(ROLLBACK)) {
    console.error(`No rollback file at ${ROLLBACK}`)
    process.exit(1)
  }
  const data = JSON.parse(readFileSync(ROLLBACK, "utf8"))
  let reverted = 0
  let skipped = 0
  for (const row of data.quarantined ?? []) {
    const current = await db.financialValue.findUnique({ where: { id: row.id } })
    if (!current) { skipped++; continue }
    if (!String(current.validationNotes ?? "").startsWith(MARK)) { skipped++; continue }
    await db.financialValue.update({
      where: { id: row.id },
      data: { validationStatus: row.oldStatus, validationNotes: row.oldNotes },
    })
    reverted++
  }
  console.log(`rollback complete: reverted=${reverted}, skipped=${skipped}`)
}

async function main() {
  if (ROLLBACK_MODE) return runRollback()
  if (!existsSync(PLAN)) {
    console.error(`Missing ${PLAN}; run recover-quarterly-askborsa.mjs first`)
    process.exit(1)
  }
  const plan = JSON.parse(readFileSync(PLAN, "utf8"))
  const review = (plan.review ?? []).filter((r) => r.reason === "ANNUAL_COPY_NO_VERIFIED_REPLACEMENT" && r.valueId)
  const byReport = new Map()
  for (const r of review) {
    const key = `${r.ticker}|${r.fiscalYear}|${r.quarter}`
    if (!byReport.has(key)) byReport.set(key, [])
    byReport.get(key).push(r)
  }

  const selected = []
  const leftSingle = []
  for (const [key, rows] of byReport) {
    if (rows.length < 2) { leftSingle.push(...rows); continue }
    for (const r of rows) {
      if (r.quarter === "Q4" && STOCK.has(r.metric)) continue
      selected.push(r)
    }
  }

  const values = await db.financialValue.findMany({
    where: { id: { in: selected.map((r) => r.valueId) } },
    select: { id: true, normalizedValue: true, validationStatus: true, validationNotes: true },
  })
  const byId = new Map(values.map((v) => [v.id, v]))

  const quarantine = []
  for (const r of selected) {
    const current = byId.get(r.valueId)
    if (!current) continue
    if (!approx(current.normalizedValue, r.value)) continue
    if (current.validationStatus === "NEEDS_REVIEW" && String(current.validationNotes ?? "").startsWith(MARK)) continue
    quarantine.push({
      id: r.valueId, ticker: r.ticker, fiscalYear: r.fiscalYear, quarter: r.quarter,
      metric: r.metric, value: r.value,
      oldStatus: current.validationStatus, oldNotes: current.validationNotes,
    })
  }

  const byTicker = {}
  for (const q of quarantine) byTicker[q.ticker] = (byTicker[q.ticker] ?? 0) + 1
  console.log(`mode: ${APPLY ? "APPLY" : "DRY RUN"}`)
  console.log(`reports with >=2 annual copies: ${[...byReport.values()].filter((r) => r.length >= 2).length}`)
  console.log(`values to quarantine: ${quarantine.length}`)
  console.log(`single-value review left untouched: ${leftSingle.length}`)
  console.log(`top tickers: ${JSON.stringify(Object.entries(byTicker).sort((a, b) => b[1] - a[1]).slice(0, 20))}`)

  mkdirSync("reports", { recursive: true })
  writeFileSync("reports/annual-copy-quarantine-plan.json", JSON.stringify({
    generatedAt: new Date().toISOString(), selected, leftSingle, quarantine,
  }, null, 2), "utf8")

  if (!APPLY) return

  let changed = 0
  for (const q of quarantine) {
    await db.financialValue.update({
      where: { id: q.id },
      data: {
        validationStatus: "NEEDS_REVIEW",
        validationNotes: `${MARK} annual-copy quarter (${q.quarter} FY${q.fiscalYear}) equals the annual FY value; no verified AskBorsa discrete replacement exists. Original status: ${q.oldStatus}. Reversible via scripts/quarantine-annual-copies.mjs --rollback.${q.oldNotes ? ` Previous note: ${q.oldNotes}` : ""}`,
      },
    })
    changed++
  }
  writeFileSync(ROLLBACK, JSON.stringify({
    generatedAt: new Date().toISOString(), quarantined: quarantine,
  }, null, 2), "utf8")
  await db.auditLog.create({
    data: {
      actor: "system",
      action: "VALIDATE",
      entityType: "FinancialValue",
      details: `AUDIT_QUARANTINE annual-copy quarters: ${changed} values quarantined across ${new Set(quarantine.map((q) => `${q.ticker}|${q.fiscalYear}|${q.quarter}`)).size} reports; ${leftSingle.length} single-value cases left for review. Rollback ${ROLLBACK}`,
    },
  })
  console.log(`quarantined: ${changed}; rollback: ${ROLLBACK}`)
}

main()
  .catch((e) => { console.error("ANNUAL-COPY QUARANTINE FAILED:", e); process.exitCode = 1 })
  .finally(async () => { await db.$disconnect() })
