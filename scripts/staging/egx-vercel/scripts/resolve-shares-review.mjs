// Resolve the six >20% share-count differences flagged by the TradingView
// import. Two sources are required before changing an existing value:
// Mubasher's "Current Total Shares" and the TradingView scanner row.
//
// Decisions (evidence in reports/shares-review-resolution.json):
//   DTPP  keep 5,600,000        (Mubasher agrees; scanner is wrong)
//   EXPA  keep 1,360,000,000    (Mubasher agrees; scanner is wrong)
//   FAIT  correct to 225,910,908 (Mubasher + scanner agree; current is wrong)
//   ORHD  keep 1,130,473,523    (Mubasher agrees; scanner is wrong)
//   SEIG  correct to 2,500,000  (Mubasher + scanner agree; current is wrong)
//   VLMRA unresolved            (three different values; scanner matches VLMR)
//   BQDC  unresolved            (Mubasher 10.25B; no second source)
//
// Usage:
//   node scripts/resolve-shares-review.mjs            # dry run
//   node scripts/resolve-shares-review.mjs --apply
//   node scripts/resolve-shares-review.mjs --rollback

import fs from "node:fs"
import path from "node:path"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ROLLBACK = process.argv.includes("--rollback")
const OUT = path.join(process.cwd(), "reports")
const ROLLBACK_FILE = path.join(OUT, "shares-review-resolution-rollback.json")
const REPORT_FILE = path.join(OUT, "shares-review-resolution.json")

const decisions = [
  {
    ticker: "DTPP",
    current: 5_600_000,
    scanner: 22_400_000,
    mubasher: 5_600_000,
    action: "keep",
    reason: "Mubasher and the current value agree; the scanner row is 4x too high.",
  },
  {
    ticker: "EXPA",
    current: 1_360_000_000,
    scanner: 1_800_000_000,
    mubasher: 1_360_000_000,
    action: "keep",
    reason: "Mubasher and the current value agree; the scanner row is 32% too high.",
  },
  {
    ticker: "FAIT",
    current: 637_845_023,
    scanner: 225_911_000,
    mubasher: 225_910_908,
    action: "correct",
    newValue: 225_910_908,
    reason: "Mubasher (225,910,908) and the scanner (225,911,000, rounded) agree; the current value is wrong.",
  },
  {
    ticker: "ORHD",
    current: 1_130_473_523,
    scanner: 3_650_130_000,
    mubasher: 1_130_473_523,
    action: "keep",
    reason: "Mubasher and the current value agree; the scanner row is 3.2x too high.",
  },
  {
    ticker: "SEIG",
    current: 5_000_000,
    scanner: 2_500_000,
    mubasher: 2_500_000,
    action: "correct",
    newValue: 2_500_000,
    reason: "Mubasher (2,500,000) and the scanner (2,500,000) agree; the current value is 2x too high.",
  },
  {
    ticker: "VLMRA",
    current: 1_183_229_551,
    scanner: 830_840_000,
    mubasher: 352_389_240,
    action: "unresolved",
    reason: "Three different values. The scanner value equals VLMR (the USD line), not VLMRA (EGP line). No safe correction without a second source.",
  },
  {
    ticker: "BQDC",
    current: null,
    scanner: null,
    mubasher: 10_250_000_000,
    action: "unresolved",
    reason: "Mubasher reports 10,250,000,000 shares / EGP 20.5B capital, but there is no second source and no usable price/market-cap corroboration (Thndr marks it NOPL; Mubasher shows 0.00).",
  },
]

async function runRollback() {
  if (!fs.existsSync(ROLLBACK_FILE)) throw new Error(`rollback file not found: ${ROLLBACK_FILE}`)
  const entries = JSON.parse(fs.readFileSync(ROLLBACK_FILE, "utf8"))
  let changed = 0
  for (const e of entries.values ?? []) {
    await db.company.update({ where: { id: e.companyId }, data: { sharesOutstanding: e.oldValue } })
    changed++
  }
  console.log(JSON.stringify({ mode: "rollback", restoredCompanies: changed }, null, 2))
}

if (ROLLBACK) {
  await runRollback()
  await db.$disconnect()
  process.exit(0)
}

const report = {
  generatedAt: new Date().toISOString(),
  sources: {
    mubasher: "https://english.mubasher.info/markets/EGX/stocks/<ticker> (Current Total Shares)",
    tradingview: "TradingView public EGX scanner (shares_outstanding)",
  },
  decisions: [],
}
const rollback = { generatedAt: new Date().toISOString(), values: [] }

for (const d of decisions) {
  const company = await db.company.findUnique({
    where: { ticker: d.ticker },
    select: { id: true, ticker: true, nameEn: true, sharesOutstanding: true },
  })
  if (!company) {
    report.decisions.push({ ...d, status: "company_not_found" })
    continue
  }
  const current = company.sharesOutstanding
  const currentMatches = current !== null && Math.abs(current - d.current) < 1

  if (d.action === "correct") {
    if (!currentMatches) {
      report.decisions.push({
        ...d,
        companyId: company.id,
        status: "skipped_current_changed",
        actualCurrent: current,
      })
      continue
    }
    rollback.values.push({
      companyId: company.id,
      ticker: d.ticker,
      oldValue: current,
      newValue: d.newValue,
      reason: d.reason,
    })
    if (APPLY) {
      await db.company.update({ where: { id: company.id }, data: { sharesOutstanding: d.newValue } })
    }
    report.decisions.push({
      ...d,
      companyId: company.id,
      actualCurrent: current,
      status: APPLY ? "corrected" : "would_correct",
    })
  } else {
    report.decisions.push({
      ...d,
      companyId: company.id,
      actualCurrent: current,
      status: d.action === "keep" ? "kept" : "unresolved",
    })
  }
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2))
if (APPLY) fs.writeFileSync(ROLLBACK_FILE, JSON.stringify(rollback, null, 2))
console.log(JSON.stringify({ applied: APPLY, report }, null, 2))
if (!APPLY) console.log("Dry run only. Re-run with --apply to write.")
await db.$disconnect()
