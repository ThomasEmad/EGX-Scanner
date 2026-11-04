// Fill only-missing shares outstanding from two independent public market
// sources: the TradingView EGX scanner snapshot and the Thndr market watch
// snapshot. Existing values are never overwritten. When the two sources
// disagree by more than 1%, the row is left unresolved and written to the
// conflicts report.
//
// Usage:
//   node scripts/recover-shares.mjs            # dry run
//   node scripts/recover-shares.mjs --apply    # write

import fs from "node:fs"
import path from "node:path"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const OUT = path.join(process.cwd(), "reports")
// BQDC is flagged NOPL (not listed) by the Thndr snapshot and the public price
// sources disagree by >3x, so its share count cannot be corroborated yet.
const DEFER = new Set(["BQDC"])

const tv = JSON.parse(fs.readFileSync(path.join(OUT, "tradingview-egx-scan.json"), "utf8")).rows
const thndr = JSON.parse(
  fs.readFileSync("C:/Users/tomas/Downloads/EGX-Scanner-backup/egx-data/data/thndr-marketwatch.json", "utf8"),
)

function isinFromTicker(ticker) {
  const m = String(ticker || "").match(/^(EGS[0-9A-Z]{9})(?:-EGP)?$/i)
  return m ? m[1].toUpperCase() : null
}

const tvByTicker = new Map()
const tvByIsin = new Map()
for (const r of tv) {
  const t = String(r.ticker || "").toUpperCase()
  const isin = isinFromTicker(r.ticker)
  if (isin) tvByIsin.set(isin, r)
  else tvByTicker.set(t, r)
}
const thByTicker = new Map(thndr.map((r) => [String(r.t).toUpperCase(), r]))
const thByIsin = new Map(thndr.filter((r) => r.isin).map((r) => [String(r.isin).toUpperCase(), r]))

const companies = await db.company.findMany({
  where: { isActive: true, OR: [{ sharesOutstanding: null }, { sharesOutstanding: 0 }] },
  select: { id: true, ticker: true, isin: true, nameEn: true, sharesOutstanding: true },
  orderBy: { ticker: "asc" },
})

const rows = []
for (const c of companies) {
  const isin = c.isin ? String(c.isin).toUpperCase() : null
  const tvRow = tvByTicker.get(c.ticker.toUpperCase()) || (isin ? tvByIsin.get(isin) : null)
  const thRow = thByTicker.get(c.ticker.toUpperCase()) || (isin ? thByIsin.get(isin) : null)
  const tvShares = Number(tvRow?.shares)
  const thShares = Number(thRow?.shares)
  const tvOk = Number.isFinite(tvShares) && tvShares > 0
  const thOk = Number.isFinite(thShares) && thShares > 0
  let status = "no_source"
  let shares = null
  let source = null
  if (tvOk && thOk) {
    const diff = Math.abs(tvShares - thShares) / Math.max(tvShares, thShares)
    if (diff > 0.01) {
      status = "conflict"
    } else {
      status = "both_agree"
      shares = tvShares
      source = "TRADINGVIEW_SCANNER+THNDR_MARKETWATCH"
    }
  } else if (tvOk) {
    status = "tradingview_only"
    shares = tvShares
    source = "TRADINGVIEW_SCANNER"
  } else if (thOk) {
    status = "thndr_only"
    shares = thShares
    source = "THNDR_MARKETWATCH"
  }
  if (DEFER.has(c.ticker)) {
    status = "deferred"
    shares = null
    source = null
  }
  rows.push({
    ticker: c.ticker,
    nameEn: c.nameEn,
    isin,
    tvShares: tvOk ? tvShares : null,
    thShares: thOk ? thShares : null,
    status,
    shares,
    source,
  })
}

const fillable = rows.filter(
  (r) => r.status !== "conflict" && r.status !== "no_source" && r.status !== "deferred" && r.shares > 0,
)
const rollback = { generatedAt: new Date().toISOString(), fills: [] }
for (const r of fillable) {
  const c = companies.find((x) => x.ticker === r.ticker)
  rollback.fills.push({ companyId: c.id, ticker: c.ticker, oldShares: c.sharesOutstanding, newShares: r.shares, source: r.source })
  if (APPLY) {
    await db.company.update({ where: { id: c.id }, data: { sharesOutstanding: r.shares } })
  }
}

const summary = {
  applied: APPLY,
  missingBefore: companies.length,
  fillable: fillable.length,
  filledByStatus: Object.fromEntries(
    ["both_agree", "tradingview_only", "thndr_only"].map((s) => [s, fillable.filter((r) => r.status === s).length]),
  ),
  conflicts: rows.filter((r) => r.status === "conflict"),
  deferred: rows.filter((r) => r.status === "deferred").map((r) => r.ticker),
  noSource: rows.filter((r) => r.status === "no_source").map((r) => r.ticker),
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, "shares-recovery.json"), JSON.stringify({ summary, rows }, null, 2))
if (APPLY) fs.writeFileSync(path.join(OUT, "shares-recovery-rollback.json"), JSON.stringify(rollback, null, 2))

console.log(JSON.stringify(summary, null, 1))
if (!APPLY) console.log("Dry run only. Re-run with --apply to write.")
await db.$disconnect()
