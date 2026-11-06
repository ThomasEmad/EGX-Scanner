// Fiscal-period repair — reversible, evidence-based.
//
// Many AskBorsa / Mubasher / TradingView imports stored every annual report as
// if the fiscal year ended on 31 December, even when the company's own source
// note says "fiscal year starts يوليو" or its historical filings end in June,
// March or August. The values can be correct while periodEnd is wrong; that
// wrong date makes an already-published FY2026 report look like a future
// forecast and corrupts freshness/staleness logic.
//
// This script infers the fiscal year end from:
//   1. the source note ("fiscal year starts <month>"), and
//   2. historical annual reports that carry explicit periodStart/periodEnd.
// It then repairs periodStart/periodEnd for auto-imported reports. It never
// changes a financial value, and writes a rollback file before applying.
//
// Usage:
//   node scripts/dq-fix-fiscal-periods.mjs            # dry run
//   node scripts/dq-fix-fiscal-periods.mjs --apply    # apply + rollback file
//   node scripts/dq-fix-fiscal-periods.mjs --rollback # restore last applied run
import { PrismaClient } from "@prisma/client"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ROLLBACK = process.argv.includes("--rollback")
const ROLLBACK_FILE = "reports/fiscal-period-corrections.json"
const PROPOSAL_FILE = "reports/fiscal-period-proposal.json"

const MONTHS = {
  "يناير": 1, "فبراير": 2, "مارس": 3, "ابريل": 4, "أبريل": 4, "مايو": 5, "يونيو": 6,
  "يوليو": 7, "اغسطس": 8, "أغسطس": 8, "سبتمبر": 9, "اكتوبر": 10, "أكتوبر": 10,
  "نوفمبر": 11, "ديسمبر": 12,
}
const AUTO_SOURCE = /ASKBORA|MUBASHER|TRADINGVIEW|YAHOO|EXCEL/i
const TRUSTED = new Set(["VALIDATED", "APPROVED", "EXTRACTED"])
const PERIOD_TYPES = new Set(["ANNUAL", "QUARTERLY", "SEMIANNUAL", "NINE_MONTH"])

function startMonthFromNotes(notes) {
  if (!notes) return null
  const m = notes.match(/fiscal year starts\s+([^\s;.,]+)/i)
  if (!m) return null
  return MONTHS[m[1]] ?? null
}

function mode(values) {
  const counts = new Map()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best = null
  let bestCount = 0
  let tie = false
  for (const [value, count] of counts) {
    if (count > bestCount) { best = value; bestCount = count; tie = false }
    else if (count === bestCount) tie = true
  }
  return best === null || tie ? null : { value: best, count: bestCount }
}

function inferFiscalEnd(reports) {
  const noteVotes = []
  const explicitVotes = []
  const tomorrow = Date.now() + 24 * 3600 * 1000
  for (const r of reports) {
    const noteStart = startMonthFromNotes(r.notes)
    if (noteStart) noteVotes.push(noteStart === 1 ? 12 : noteStart - 1)
    // A future-dated report is exactly the row we are trying to repair; it
    // must not vote on the company's fiscal calendar. (CIRA/MICH had a future
    // Mubasher December row that otherwise tied with their real Aug/Jun row.)
    if (r.periodStart && r.periodEnd && r.periodEnd.getTime() <= tomorrow) {
      explicitVotes.push(r.periodEnd.getUTCMonth() + 1)
    }
  }
  const noteMode = mode(noteVotes)
  const explicitMode = mode(explicitVotes)
  // Source notes are company-specific and explicit. Historical rows are a
  // fallback; if both disagree, prefer the source note when it is at least as
  // well represented (IRON: Yahoo says December, AskBorsa says July start).
  if (noteMode && explicitMode && noteMode.value !== explicitMode.value) {
    return noteMode.count >= explicitMode.count ? noteMode.value : explicitMode.value
  }
  return noteMode?.value ?? explicitMode?.value ?? null
}

function lastDay(year, month) {
  return new Date(Date.UTC(year, month, 0))
}

function expectedWindow(fiscalYear, periodType, periodLabel, endMonth) {
  if (!endMonth) return null
  const startMonth = endMonth === 12 ? 1 : endMonth + 1
  const startYear = endMonth === 12 ? fiscalYear : fiscalYear - 1
  const fiscalStart = new Date(Date.UTC(startYear, startMonth - 1, 1))
  if (periodType === "ANNUAL") {
    return { start: fiscalStart, end: lastDay(fiscalYear, endMonth) }
  }
  let months = null
  let startOffset = 0
  if (periodType === "QUARTERLY") {
    const q = Number((periodLabel.match(/Q([1-4])/i) ?? [])[1])
    if (!q) return null
    months = 3
    startOffset = (q - 1) * 3
  } else if (periodType === "SEMIANNUAL") {
    const h = Number((periodLabel.match(/H([1-2])/i) ?? [])[1])
    if (!h) return null
    months = 6
    startOffset = (h - 1) * 6
  } else if (periodType === "NINE_MONTH") {
    months = 9
  }
  if (!months) return null
  const start = new Date(Date.UTC(fiscalStart.getUTCFullYear(), fiscalStart.getUTCMonth() + startOffset, 1))
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 0))
  return { start, end }
}

function sameDay(a, b) {
  return a && b && a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
}

function correctionNote(oldEnd, newEnd) {
  return `AUDIT_CORRECTION: fiscal period end corrected from ${oldEnd.toISOString().slice(0, 10)} to ${newEnd.toISOString().slice(0, 10)} (company fiscal calendar; source note/historical filings).`
}

async function rollback() {
  if (!existsSync(ROLLBACK_FILE)) throw new Error(`rollback file not found: ${ROLLBACK_FILE}`)
  const entries = JSON.parse(readFileSync(ROLLBACK_FILE, "utf8"))
  let restored = 0
  for (const e of entries) {
    const r = await db.financialReport.findUnique({ where: { id: e.reportId }, select: { id: true } })
    if (!r) continue
    await db.financialReport.update({
      where: { id: e.reportId },
      data: {
        periodStart: e.oldPeriodStart ? new Date(e.oldPeriodStart) : null,
        periodEnd: e.oldPeriodEnd ? new Date(e.oldPeriodEnd) : null,
        notes: e.oldNotes,
      },
    })
    restored++
  }
  console.log(JSON.stringify({ mode: "rollback", restored }, null, 2))
}

async function main() {
  if (ROLLBACK) return rollback()

  const companies = await db.company.findMany({
    where: { isActive: true },
    select: { id: true, ticker: true, nameEn: true },
    orderBy: { ticker: "asc" },
  })
  const proposal = []
  const skipped = []
  for (const c of companies) {
    const reports = await db.financialReport.findMany({
      where: { companyId: c.id, deletedAt: null },
      select: {
        id: true, periodLabel: true, periodType: true, fiscalYear: true,
        periodStart: true, periodEnd: true, processingStatus: true,
        sourceName: true, notes: true,
      },
      orderBy: [{ fiscalYear: "asc" }, { periodLabel: "asc" }],
    })
    if (reports.length === 0) continue
    const endMonth = inferFiscalEnd(reports)
    if (!endMonth) continue
    for (const r of reports) {
      if (!PERIOD_TYPES.has(r.periodType)) continue
      if (!r.periodEnd || !AUTO_SOURCE.test(r.sourceName ?? "")) continue
      if (!TRUSTED.has(r.processingStatus)) continue
      const exp = expectedWindow(r.fiscalYear, r.periodType, r.periodLabel, endMonth)
      if (!exp) { skipped.push({ ticker: c.ticker, reportId: r.id, label: r.periodLabel, reason: "unparsed-period-label" }); continue }
      if (sameDay(r.periodEnd, exp.end)) continue
      proposal.push({
        ticker: c.ticker,
        name: c.nameEn,
        reportId: r.id,
        periodLabel: r.periodLabel,
        periodType: r.periodType,
        fiscalYear: r.fiscalYear,
        source: r.sourceName,
        oldPeriodStart: r.periodStart?.toISOString() ?? null,
        oldPeriodEnd: r.periodEnd.toISOString(),
        newPeriodStart: exp.start.toISOString(),
        newPeriodEnd: exp.end.toISOString(),
        inferredEndMonth: endMonth,
        oldNotes: r.notes,
        newNotes: `${r.notes ? `${r.notes} ` : ""}${correctionNote(r.periodEnd, exp.end)}`,
      })
    }
  }

  const byTicker = {}
  for (const p of proposal) byTicker[p.ticker] = (byTicker[p.ticker] ?? 0) + 1
  mkdirSync("reports", { recursive: true })
  writeFileSync(PROPOSAL_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), proposal, skipped }, null, 2), "utf8")
  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run",
    changes: proposal.length,
    companies: Object.keys(byTicker).length,
    byTicker,
    skipped: skipped.length,
    proposalFile: PROPOSAL_FILE,
  }, null, 2))

  if (!APPLY) {
    console.log("No database changes. Re-run with --apply to write these corrections.")
    return
  }
  writeFileSync(ROLLBACK_FILE, JSON.stringify(proposal.map((p) => ({
    reportId: p.reportId,
    oldPeriodStart: p.oldPeriodStart,
    oldPeriodEnd: p.oldPeriodEnd,
    oldNotes: p.oldNotes,
  })), null, 2), "utf8")
  let applied = 0
  for (const p of proposal) {
    await db.financialReport.update({
      where: { id: p.reportId },
      data: {
        periodStart: new Date(p.newPeriodStart),
        periodEnd: new Date(p.newPeriodEnd),
        notes: p.newNotes,
      },
    })
    applied++
  }
  console.log(JSON.stringify({ applied, rollbackFile: ROLLBACK_FILE }, null, 2))
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
