// Comprehensive AskBorsa harvest (annual + quarterly pivots + page metadata).
//
//   node scripts/harvest-askborsa.mjs                        # all active DB companies
//   node scripts/harvest-askborsa.mjs --include-directory    # union with AskBorsa's public directory
//   node scripts/harvest-askborsa.mjs --english              # also fetch the English page name
//   node scripts/harvest-askborsa.mjs --limit=20             # smoke test
//   node scripts/harvest-askborsa.mjs --tickers=COMI,EAST
//
// AskBorsa embeds the five-year pivot table (FY + Q1..Q4) in the public company
// page. This script extracts that JSON, validates its shape, captures the page
// metadata that proves currency and fiscal-year start, and writes a
// reproducible snapshot. It does not write to the database.
//
// Fix (2026-10-30): the first pivot on some pages is Q1/Q2, not FY. The old
// extractor searched for '[{"period":"FY"' and silently returned no_pivots for
// those pages. It now locates the first pivot object and accepts any order.
//
// Public pages only. No authentication, paywall, or access-control bypass.
import { PrismaClient } from "@prisma/client"
import { mkdirSync, writeFileSync } from "node:fs"

const db = new PrismaClient()
const OUT = "reports/askborsa-harvest.json"
const CONCURRENCY = 5
const TIMEOUT_MS = 25_000
const USER_AGENT = "EGX-Scanner-data-audit/1.0 (+public disclosure verification)"

const args = process.argv.slice(2)
const limitArg = args.find((a) => a.startsWith("--limit="))
const limit = limitArg ? Number(limitArg.split("=")[1]) : null
const tickersArg = args.find((a) => a.startsWith("--tickers="))
const onlyTickers = tickersArg
  ? tickersArg.split("=")[1].split(",").map((t) => t.trim().toUpperCase()).filter(Boolean)
  : null
const includeDirectory = args.includes("--include-directory")
const fetchEnglish = args.includes("--english")

const AR_MONTHS = {
  "يناير": 1, "فبراير": 2, "مارس": 3, "أبريل": 4, "مايو": 5, "يونيو": 6,
  "يوليو": 7, "أغسطس": 8, "سبتمبر": 9, "أكتوبر": 10, "نوفمبر": 11, "ديسمبر": 12,
}

function unescapeNextFlight(html) {
  // Next.js flight payload escapes quotes and backslashes inside a JS string.
  return html.replace(/\\"/g, '"').replace(/\\\\/g, "\\")
}

function extractPivots(html) {
  const text = unescapeNextFlight(html)
  const start = text.indexOf('[{"period":"')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  let end = -1
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
    } else {
      if (ch === '"') inString = true
      else if (ch === "[") depth++
      else if (ch === "]") {
        depth--
        if (depth === 0) { end = i + 1; break }
      }
    }
  }
  if (end < 0) return null
  try {
    const pivots = JSON.parse(text.slice(start, end))
    if (!Array.isArray(pivots)) return null
    return pivots.filter((p) => p && typeof p.period === "string" && Array.isArray(p.rows))
  } catch {
    return null
  }
}

function visibleText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ")
}

function extractMetadata(html) {
  const text = visibleText(html)
  const currency = /العملة\s+(EGP|USD)/.exec(text)?.[1]
    ?? (/\bUSD\b|بالدولار/.test(text) ? "USD" : /العملة\s+جنيه|\bEGP\b/.test(text) ? "EGP" : null)
  const fiscalMonthAr = /السنة المالية تبدأ في\s+([^\s·]+)/.exec(text)?.[1] ?? null
  const fiscalYearStartMonth = fiscalMonthAr ? (AR_MONTHS[fiscalMonthAr] ?? null) : null
  const sectorSlug = /\/sector\/([a-z-]+)/.exec(html)?.[1] ?? null
  const nameAr = /<h1[^>]*>([^<]+)<\/h1>/.exec(html)?.[1]?.trim() ?? null
  const latestPeriod = /آخر قوائم:\s*([^·]+?)(?:\s+النتائج القادمة|\s+[0-9]|$)/.exec(text)?.[1]?.trim() ?? null
  const noStatements = /No summarised financial statements are available|لا توجد قوائم مالية ملخصة/.test(text)
  return { currency, fiscalYearStartMonth, fiscalMonthAr, sectorSlug, nameAr, latestPeriod, noStatements }
}

function englishName(html, ticker) {
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ""
  const cleaned = title.replace(/\s*\|\s*AskBorsa\s*$/, "").trim()
  const m = new RegExp(`^(.*?)\\s*\\(${ticker}\\)`, "i").exec(cleaned)
  if (m && m[1].trim() && !/[\u0600-\u06FF]/.test(m[1])) return m[1].trim()
  return null
}

async function fetchText(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  async function worker() {
    while (true) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i])
      await new Promise((r) => setTimeout(r, 120))
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

async function directoryTickers() {
  const html = await fetchText("https://askborsa.com/companies")
  const found = [...new Set((html.match(/\/company\/([A-Z0-9]+)/g) ?? []).map((x) => x.split("/")[2]))]
  return found.sort()
}

async function main() {
  const dbCompanies = await db.company.findMany({
    where: { isActive: true, ...(onlyTickers ? { ticker: { in: onlyTickers } } : {}) },
    select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true },
    orderBy: { ticker: "asc" },
  })
  const byTicker = new Map(dbCompanies.map((c) => [c.ticker, c]))
  let tickers = dbCompanies.map((c) => c.ticker)
  let directory = []
  if (includeDirectory && !onlyTickers) {
    directory = await directoryTickers()
    tickers = [...new Set([...tickers, ...directory])].sort()
  }
  const work = limit ? tickers.slice(0, limit) : tickers
  console.log(`db companies: ${dbCompanies.length}; directory: ${directory.length}; fetching: ${work.length}`)

  const fetchedAt = new Date().toISOString()
  const results = await mapLimit(work, CONCURRENCY, async (ticker) => {
    const c = byTicker.get(ticker)
    const url = `https://askborsa.com/company/${encodeURIComponent(ticker)}`
    try {
      const html = await fetchText(url)
      const meta = extractMetadata(html)
      const pivots = extractPivots(html)
      const base = {
        ticker,
        inDatabase: Boolean(c),
        nameEn: c?.nameEn ?? null,
        nameAr: c?.nameAr ?? meta.nameAr,
        sector: c?.sector ?? null,
        sourceUrl: url,
        fetchedAt,
        currency: meta.currency,
        fiscalYearStartMonth: meta.fiscalYearStartMonth,
        fiscalMonthAr: meta.fiscalMonthAr,
        sectorSlug: meta.sectorSlug,
        latestPeriod: meta.latestPeriod,
      }
      if (!pivots) {
        return { ...base, status: meta.noStatements ? "no_statements" : "no_pivots", pivots: [] }
      }
      const byPeriod = {}
      for (const p of pivots) byPeriod[p.period] = p
      const fy = byPeriod.FY
      const quarters = ["Q1", "Q2", "Q3", "Q4"].filter((q) => byPeriod[q])
      let nameEn = c?.nameEn ?? null
      if (fetchEnglish && !nameEn) {
        try {
          nameEn = englishName(await fetchText(`https://askborsa.com/en/company/${encodeURIComponent(ticker)}`), ticker)
        } catch {
          nameEn = null
        }
      }
      return {
        ...base,
        nameEn,
        status: "ok",
        annualYears: fy?.years ?? [],
        quarterYears: Object.fromEntries(quarters.map((q) => [q, byPeriod[q].years])),
        pivots,
      }
    } catch (e) {
      return {
        ticker,
        inDatabase: Boolean(c),
        nameEn: c?.nameEn ?? null,
        nameAr: c?.nameAr ?? null,
        sector: c?.sector ?? null,
        sourceUrl: url,
        fetchedAt,
        status: "fetch_failed",
        error: e instanceof Error ? e.message : String(e),
        pivots: [],
      }
    }
  })

  const summary = {}
  for (const r of results) summary[r.status] = (summary[r.status] ?? 0) + 1
  const payload = {
    generatedAt: fetchedAt,
    source: "AskBorsa public company pages (embedded five-year pivot JSON)",
    note: "Read-only snapshot. Values are as published by AskBorsa; unit/period validation happens in the recovery pipeline.",
    totalCompanies: tickers.length,
    fetched: work.length,
    includeDirectory,
    fetchEnglish,
    summary,
    results,
  }
  mkdirSync("reports", { recursive: true })
  writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf8")
  console.log(`status: ${JSON.stringify(summary)}`)
  console.log(`wrote ${OUT}`)
  await db.$disconnect()
}

main().catch((e) => { console.error("ASK BORSA HARVEST FAILED:", e); process.exitCode = 1 })
