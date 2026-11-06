// Backfill daily EGX close prices from the Yahoo Finance chart API into
// MarketPrice (source YAHOO_FINANCE_API).
//
// Why Yahoo: the public chart endpoint needs no auth, covers EGX (.CA) daily
// candles, and its closes match the project's verified ground truth (ABUK Nov 3
// = 77.71 confirmed against the TradingView-synced row). The meta block on the
// same response is stale for EGX and is intentionally ignored.
//
// Timestamps: every imported close is normalized to 12:29:59 UTC (= 14:29:59
// Cairo, EGX session close) so the daily series stays consistent with the
// egx-data pipeline rows and re-runs stay idempotent (upsert on companyId+asOf).
//
// Robustness rules:
//   * one HTTP call per company for the whole range (period1/period2, 1d);
//   * per-company error isolation — a bad symbol never aborts the run;
//   * null closes (Yahoo EOD lag) are logged as pending, never guessed;
//   * re-runs are safe: upsert keyed by (companyId, asOf);
//   * politeness: 350 ms between calls, one retry on failure.
//
// Usage:
//   node scripts/egx-quotes-backfill.mjs --from 2026-11-04 --to 2026-11-05           # dry run
//   node scripts/egx-quotes-backfill.mjs --from 2026-11-04 --to 2026-11-05 --apply   # write

import fs from "node:fs"
import path from "node:path"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")

function argValue(flag) {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : null
}

const FROM = argValue("--from") ?? "2026-11-04"
const TO = argValue("--to") ?? "2026-11-05"

const CAIRO_OFFSET_MIN = 120 // EET (UTC+2), winter; EGX close 14:29:59 local
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"

function closeUtcMs(dateStr) {
  // 14:29:59 Cairo == 12:29:59 UTC
  return Date.parse(`${dateStr}T12:29:59Z`)
}

function ymdCairo(ms) {
  const d = new Date(ms + CAIRO_OFFSET_MIN * 60_000)
  return d.toISOString().slice(0, 10)
}

async function fetchDaily(symbol, fromMs, toMs) {
  const p1 = Math.floor(fromMs / 1000) - 86400
  const p2 = Math.floor(toMs / 1000) + 86400
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${p2}&interval=1d`
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(12_000) })
      if (res.status === 429 || res.status === 503) throw new Error(`HTTP ${res.status} (rate limited)`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const result = json?.chart?.result?.[0]
      if (!result) throw new Error(json?.chart?.error?.description ?? "no result")
      const timestamps = result.timestamp ?? []
      const closes = result.indicators?.quote?.[0]?.close ?? []
      const out = new Map()
      for (let i = 0; i < timestamps.length; i++) {
        const close = closes[i]
        if (!Number.isFinite(close) || close <= 0) continue
        const day = ymdCairo(timestamps[i] * 1000)
        out.set(day, close) // one close per Cairo day (last wins)
      }
      return { ok: true, days: out }
    } catch (e) {
      if (attempt === 2) return { ok: false, error: String(e.message ?? e) }
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
}

const companies = await db.company.findMany({
  where: { isActive: true },
  select: { id: true, ticker: true, isin: true, nameEn: true },
  orderBy: { ticker: "asc" },
})

const fromMs = closeUtcMs(FROM)
const toMs = closeUtcMs(TO)
const report = {
  from: FROM,
  to: TO,
  apply: APPLY,
  startedAt: new Date().toISOString(),
  companies: companies.length,
  written: 0,
  wouldWrite: 0,
  pendingNull: [],
  failed: [],
  ok: [],
}

const wantedDays = []
for (let ms = fromMs; ms <= toMs; ms += 86400_000) wantedDays.push(ymdCairo(ms))

for (const c of companies) {
  if (!c.ticker) {
    report.failed.push({ ticker: null, id: c.id, error: "no ticker" })
    continue
  }
  const symbol = `${c.ticker.toUpperCase()}.CA`
  const res = await fetchDaily(symbol, fromMs, toMs)
  if (!res.ok) {
    report.failed.push({ ticker: c.ticker, symbol, error: res.error })
    await new Promise((r) => setTimeout(r, 350))
    continue
  }
  const missing = []
  let companyWrites = 0
  for (const day of wantedDays) {
    const price = res.days.get(day)
    if (!price) {
      missing.push(day)
      continue
    }
    const asOf = new Date(closeUtcMs(day))
    companyWrites++
    if (APPLY) {
      await db.marketPrice.upsert({
        where: { companyId_asOf: { companyId: c.id, asOf } },
        create: {
          companyId: c.id,
          asOf,
          price,
          currency: "EGP",
          sourceName: "YAHOO_FINANCE_API",
          notes: `Daily close backfill (Yahoo chart ${symbol}); fetched ${new Date().toISOString()}`,
        },
        update: {
          price,
          sourceName: "YAHOO_FINANCE_API",
          notes: `Daily close backfill (Yahoo chart ${symbol}); fetched ${new Date().toISOString()}`,
        },
      })
    }
  }
  report.written += APPLY ? companyWrites : 0
  report.wouldWrite += companyWrites
  if (companyWrites > 0) report.ok.push({ ticker: c.ticker, symbol, days: companyWrites })
  if (missing.length > 0) report.pendingNull.push({ ticker: c.ticker, symbol, days: missing })
  await new Promise((r) => setTimeout(r, 350))
}

report.finishedAt = new Date().toISOString()
const outDir = path.join(process.cwd(), "reports")
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, `quotes-backfill-${FROM}-${TO}${APPLY ? "-applied" : ""}.json`)
fs.writeFileSync(outFile, JSON.stringify(report, null, 1))

console.log(
  JSON.stringify(
    {
      from: FROM,
      to: TO,
      apply: APPLY,
      companies: report.companies,
      [APPLY ? "written" : "wouldWrite"]: APPLY ? report.written : report.wouldWrite,
      pendingNull: report.pendingNull.length,
      failed: report.failed.length,
      failedTickers: report.failed.slice(0, 15).map((f) => f.ticker ?? f.error),
      reportFile: path.basename(outFile),
    },
    null,
    1,
  ),
)
await db.$disconnect()
