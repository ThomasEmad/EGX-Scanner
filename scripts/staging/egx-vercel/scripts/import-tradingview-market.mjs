// Import public TradingView Meza data (15-minute delayed) as the market
// snapshot, and fill only-missing shares outstanding.
//
// Why this source: TradingView's public scanner is an authorized provider in the
// project's source hierarchy and exposes EGX close, market cap, P/E, trailing
// dividend yield, EPS and listed shares without authentication. It does not
// bypass a paywall. The scanner marks rows as `delayed_streaming_900`, so every
// imported price is stored with that note and a fetch timestamp.
//
// Safety rules:
//   * prices are written as a new MarketPrice point (upsert on companyId+asOf);
//   * shares are filled ONLY when the company has no usable value;
//   * an existing shares value is never overwritten here — differences >20%
//     are written to reports/tradingview-shares-review.json;
//   * every write is recorded in reports/tradingview-market-rollback.json.
//
// Usage:
//   node scripts/import-tradingview-market.mjs            # dry run
//   node scripts/import-tradingview-market.mjs --apply    # write

import fs from "node:fs"
import path from "node:path"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const OUT_DIR = path.join(process.cwd(), "reports")

const COLUMNS = [
  "name",
  "description",
  "close",
  "change",
  "volume",
  "market_cap_basic",
  "price_earnings_ttm",
  "dividend_yield_recent",
  "earnings_per_share_basic_ttm",
  "total_shares_outstanding",
  "sector",
  "industry",
  "update_mode",
]

async function fetchScanner() {
  const body = {
    filter: [{ left: "exchange", operation: "equal", right: "EGX" }],
    options: { lang: "en" },
    markets: ["egypt"],
    symbols: { query: { types: [] }, tickers: [] },
    columns: COLUMNS,
    sort: { sortBy: "name", sortOrder: "asc" },
    range: [0, 1000],
  }
  const res = await fetch("https://scanner.tradingview.com/egypt/scan", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`TradingView scanner HTTP ${res.status}`)
  const json = await res.json()
  return (json.data ?? []).map((r) => {
    const d = r.d
    return {
      symbol: r.s,
      ticker: d[0],
      name: d[1],
      price: d[2],
      changePct: d[3],
      volume: d[4],
      marketCap: d[5],
      pe: d[6],
      dividendYield: d[7],
      eps: d[8],
      shares: d[9],
      sector: d[10],
      industry: d[11],
      updateMode: d[12],
    }
  })
}

function isinFromSymbol(symbol, ticker) {
  const raw = String(ticker || symbol || "")
  const m = raw.match(/^(EGS[0-9A-Z]{9})(?:-EGP)?$/i)
  return m ? m[1].toUpperCase() : null
}

const rows = await fetchScanner()
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.writeFileSync(
  path.join(OUT_DIR, "tradingview-egx-scan.json"),
  JSON.stringify({ fetchedAt: new Date().toISOString(), rows }, null, 2),
)

const companies = await db.company.findMany({
  where: { isActive: true },
  select: { id: true, ticker: true, isin: true, nameEn: true, sharesOutstanding: true },
})
const byTicker = new Map(companies.map((c) => [c.ticker.toUpperCase(), c]))
const byIsin = new Map(companies.filter((c) => c.isin).map((c) => [String(c.isin).toUpperCase(), c]))

const matched = []
const unmatched = []
for (const r of rows) {
  const isin = isinFromSymbol(r.symbol, r.ticker)
  const c = byTicker.get(String(r.ticker).toUpperCase()) || (isin ? byIsin.get(isin) : null)
  if (c) matched.push({ r, c })
  else unmatched.push(r)
}

const asOf = new Date()
asOf.setSeconds(0, 0)
const rollback = { fetchedAt: asOf.toISOString(), source: "TRADINGVIEW_SCANNER", prices: [], shares: [] }
const sharesReview = []
let pricesWritten = 0
let sharesFilled = 0
let skippedNoPrice = 0

for (const { r, c } of matched) {
  const price = Number(r.price)
  if (!Number.isFinite(price) || price <= 0) {
    skippedNoPrice++
    continue
  }

  const existing = await db.marketPrice.findUnique({
    where: { companyId_asOf: { companyId: c.id, asOf } },
    select: { id: true, price: true, sourceName: true },
  })
  rollback.prices.push({
    companyId: c.id,
    ticker: c.ticker,
    asOf: asOf.toISOString(),
    oldPrice: existing?.price ?? null,
    oldSource: existing?.sourceName ?? null,
    newPrice: price,
  })
  pricesWritten++
  if (APPLY) {
    await db.marketPrice.upsert({
      where: { companyId_asOf: { companyId: c.id, asOf } },
      create: {
        companyId: c.id,
        asOf,
        price,
        currency: "EGP",
        sourceName: "TRADINGVIEW_SCANNER",
        notes: `TradingView public Meza (${r.updateMode || "delayed"}); fetched ${asOf.toISOString()}`,
      },
      update: {
        price,
        sourceName: "TRADINGVIEW_SCANNER",
        notes: `TradingView public Meza (${r.updateMode || "delayed"}); fetched ${asOf.toISOString()}`,
      },
    })
  }

  const scannerShares = Number(r.shares)
  if (!Number.isFinite(scannerShares) || scannerShares <= 0) continue
  const currentShares = Number(c.sharesOutstanding)
  if (!c.sharesOutstanding || currentShares <= 0) {
    rollback.shares.push({ companyId: c.id, ticker: c.ticker, oldShares: c.sharesOutstanding, newShares: scannerShares })
    sharesFilled++
    if (APPLY) {
      await db.company.update({ where: { id: c.id }, data: { sharesOutstanding: scannerShares } })
    }
  } else {
    const diffPct = Math.abs(scannerShares - currentShares) / Math.max(currentShares, 1) * 100
    if (diffPct > 20) {
      sharesReview.push({ ticker: c.ticker, current: currentShares, scanner: scannerShares, diffPct: +diffPct.toFixed(1) })
    }
  }
}

const summary = {
  applied: APPLY,
  fetchedAt: asOf.toISOString(),
  scannerRows: rows.length,
  activeCompanies: companies.length,
  matched: matched.length,
  unmatchedScanner: unmatched.map((r) => r.ticker),
  pricesWritten,
  skippedNoPrice,
  sharesFilled,
  sharesReview: sharesReview.length,
}

if (APPLY) {
  fs.writeFileSync(path.join(OUT_DIR, "tradingview-market-rollback.json"), JSON.stringify(rollback, null, 2))
  fs.writeFileSync(path.join(OUT_DIR, "tradingview-shares-review.json"), JSON.stringify(sharesReview, null, 2))
}

console.log(JSON.stringify(summary, null, 1))
if (!APPLY) console.log("Dry run only. Re-run with --apply to write.")
await db.$disconnect()
