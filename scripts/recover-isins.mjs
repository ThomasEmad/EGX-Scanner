// Recover missing ISINs from public TradingView symbol pages.
//
//   node scripts/recover-isins.mjs                 # dry run, writes candidates
//   node scripts/recover-isins.mjs --limit=20      # small dry run
//   node scripts/recover-isins.mjs --apply         # write verified candidates
//   node scripts/recover-isins.mjs --rollback      # restore previous ISINs
//
// Safety rules:
//   - only fills a NULL ISIN; never overwrites an existing value
//   - validates the ISO 6166 check digit before proposing a value
//   - rejects duplicates (existing or within the candidate set)
//   - requires a plausible English-name overlap with the page description
//   - dry-run by default; every applied change is recorded for rollback
//   - public pages only; no authentication, paywall, or access-control bypass
import { PrismaClient } from "@prisma/client"
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"

const db = new PrismaClient()
const CANDIDATES_PATH = "reports/isin-recovery-candidates.json"
const ROLLBACK_PATH = "reports/isin-recovery-rollback.json"
const CONCURRENCY = 4
const TIMEOUT_MS = 20_000
const USER_AGENT = "EGX-Scanner-data-audit/1.0 (+public metadata verification)"

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const rollback = args.includes("--rollback")
const limitArg = args.find((a) => a.startsWith("--limit="))
const limit = limitArg ? Number(limitArg.split("=")[1]) : null
const tickersArg = args.find((a) => a.startsWith("--tickers="))
const onlyTickers = tickersArg ? tickersArg.split("=")[1].split(",").map((t) => t.trim().toUpperCase()).filter(Boolean) : null

function isValidIsin(isin) {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return false
  const digits = isin
    .slice(0, 11)
    .replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))
  const expanded = digits + isin[11]
  let sum = 0
  let double = false
  for (let i = expanded.length - 1; i >= 0; i--) {
    let n = Number(expanded[i])
    if (double) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    double = !double
  }
  return sum % 10 === 0
}

function normalizeName(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(company|co|sae|s a e|the|for|and|of|egypt|egyptian|group|holding|investments?|industries|industrial)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function nameOverlap(companyName, pageDescription) {
  const a = new Set(normalizeName(companyName).split(" ").filter((w) => w.length >= 3))
  const b = new Set(normalizeName(pageDescription).split(" ").filter((w) => w.length >= 3))
  if (a.size === 0 || b.size === 0) return false
  let shared = 0
  for (const w of a) if (b.has(w)) shared++
  return shared >= 1 && shared / Math.min(a.size, b.size) >= 0.34
}

async function fetchText(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.8",
      },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

function extractFromHtml(html) {
  let isin = html.match(/"isin_displayed"\s*:\s*"([A-Z0-9]{12})"/)?.[1] ?? null
  if (!isin) {
    const block = html.match(/"propertyID"\s*:\s*"ISIN"[\s\S]{0,200}?"value"\s*:\s*"([A-Z0-9]{12})"/)
    isin = block?.[1] ?? null
  }
  // The first "description" on some pages is the exchange name ("Egyptian
  // Exchange"), so prefer TradingView's short_description / JSON-LD name.
  const shortDescription = html.match(/"short_description"\s*:\s*"([^"]{1,160})"/)?.[1] ?? null
  const genericDescription = html.match(/"description"\s*:\s*"([^"]{1,160})"/)?.[1] ?? null
  const jsonLdName = html.match(/"@type"\s*:\s*"Corporation"[\s\S]{0,400}?"name"\s*:\s*"([^"]{1,160})"/)?.[1] ?? null
  const title = html.match(/<title>([^<]{1,160})<\/title>/)?.[1] ?? null
  const description =
    shortDescription ??
    (genericDescription && genericDescription !== "Egyptian Exchange" ? genericDescription : null) ??
    jsonLdName ??
    title
  return { isin, description }
}

async function fetchOne(ticker) {
  const url = `https://www.tradingview.com/symbols/EGX-${encodeURIComponent(ticker)}/`
  let lastError = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const html = await fetchText(url)
      return { url, ...extractFromHtml(html) }
    } catch (e) {
      lastError = e
      await new Promise((r) => setTimeout(r, 500 + attempt * 1000))
    }
  }
  throw lastError ?? new Error("fetch failed")
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  async function worker() {
    while (true) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
      await new Promise((r) => setTimeout(r, 150))
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

async function runRollback() {
  if (!existsSync(ROLLBACK_PATH)) {
    console.error(`No rollback file at ${ROLLBACK_PATH}`)
    process.exit(1)
  }
  const data = JSON.parse(readFileSync(ROLLBACK_PATH, "utf8"))
  let restored = 0
  let skipped = 0
  for (const row of data.applied ?? []) {
    const company = await db.company.findUnique({ where: { ticker: row.ticker }, select: { id: true, isin: true } })
    if (!company) { skipped++; continue }
    if (company.isin !== row.appliedIsin) {
      console.log(`SKIP ${row.ticker}: current ISIN ${company.isin ?? "NULL"} changed since apply`)
      skipped++
      continue
    }
    await db.company.update({ where: { id: company.id }, data: { isin: row.previousIsin ?? null } })
    restored++
  }
  console.log(`rollback complete: restored=${restored}, skipped=${skipped}`)
}

async function main() {
  if (rollback) return runRollback()

  const companies = await db.company.findMany({
    where: {
      isActive: true,
      ...(onlyTickers ? { ticker: { in: onlyTickers } } : {}),
      OR: [{ isin: null }, { isin: "" }],
    },
    select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true },
    orderBy: { ticker: "asc" },
  })
  const existing = await db.company.findMany({ where: { isin: { not: null } }, select: { ticker: true, isin: true } })
  const existingByIsin = new Map(existing.map((c) => [c.isin, c.ticker]))
  const work = limit ? companies.slice(0, limit) : companies

  console.log(`missing ISIN companies: ${companies.length}; fetching: ${work.length}; mode=${apply ? "APPLY" : "DRY RUN"}`)
  const fetchedAt = new Date().toISOString()
  const results = await mapLimit(work, CONCURRENCY, async (c) => {
    try {
      const page = await fetchOne(c.ticker)
      const checksumValid = page.isin ? isValidIsin(page.isin) : false
      const plausibleName = page.isin ? nameOverlap(c.nameEn, page.description ?? "") : false
      let status = "candidate"
      if (!page.isin) status = "not_found"
      else if (!checksumValid) status = "invalid_checksum"
      else if (existingByIsin.has(page.isin)) status = "duplicate_existing"
      else if (!plausibleName) status = "needs_review_name"
      return {
        ticker: c.ticker,
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        sector: c.sector,
        isin: page.isin,
        sourceUrl: page.url,
        retrievedAt: fetchedAt,
        pageDescription: page.description,
        checksumValid,
        nameOverlap: plausibleName,
        status,
      }
    } catch (e) {
      return {
        ticker: c.ticker,
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        sector: c.sector,
        isin: null,
        sourceUrl: `https://www.tradingview.com/symbols/EGX-${encodeURIComponent(c.ticker)}/`,
        retrievedAt: fetchedAt,
        pageDescription: null,
        checksumValid: false,
        nameOverlap: false,
        status: "fetch_failed",
        error: e instanceof Error ? e.message : String(e),
      }
    }
  })

  // Reject duplicates inside this candidate batch. Keep the first ticker
  // alphabetically and flag the rest for manual review.
  const seen = new Map()
  for (const r of results) {
    if (r.status !== "candidate" || !r.isin) continue
    if (seen.has(r.isin)) {
      r.status = "duplicate_candidate"
      r.duplicateOf = seen.get(r.isin)
    } else {
      seen.set(r.isin, r.ticker)
    }
  }

  const summary = {}
  for (const r of results) summary[r.status] = (summary[r.status] ?? 0) + 1
  const payload = {
    generatedAt: fetchedAt,
    source: "TradingView public EGX symbol page",
    method: "ISIN displayed in public page metadata; ISO 6166 check digit; English-name overlap guard",
    totalMissing: companies.length,
    fetched: work.length,
    summary,
    results,
  }
  mkdirSync("reports", { recursive: true })
  writeFileSync(CANDIDATES_PATH, JSON.stringify(payload, null, 2), "utf8")

  const candidates = results.filter((r) => r.status === "candidate")
  console.log(`status: ${JSON.stringify(summary)}`)
  console.log(`verified candidates: ${candidates.length}`)
  console.log(`wrote ${CANDIDATES_PATH}`)

  if (!apply) {
    console.log("DRY RUN: no database changes. Re-run with --apply to write candidates.")
    return
  }

  if (candidates.length === 0) {
    console.log("No candidates to apply.")
    return
  }

  const applied = []
  for (const r of candidates) {
    const company = await db.company.findUnique({ where: { ticker: r.ticker }, select: { id: true, isin: true } })
    if (!company || company.isin) continue
    await db.company.update({ where: { id: company.id }, data: { isin: r.isin } })
    applied.push({
      ticker: r.ticker,
      previousIsin: company.isin ?? null,
      appliedIsin: r.isin,
      sourceUrl: r.sourceUrl,
      retrievedAt: r.retrievedAt,
    })
  }
  const rollbackPayload = {
    generatedAt: fetchedAt,
    note: "Restores ISIN only when the current value still equals appliedIsin.",
    applied,
  }
  writeFileSync(ROLLBACK_PATH, JSON.stringify(rollbackPayload, null, 2), "utf8")
  console.log(`applied: ${applied.length}; rollback: ${ROLLBACK_PATH}`)
}

main()
  .catch((e) => { console.error("ISIN RECOVERY FAILED:", e); process.exitCode = 1 })
  .finally(async () => { await db.$disconnect() })
