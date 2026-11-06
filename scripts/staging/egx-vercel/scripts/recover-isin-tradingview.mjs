// Recover missing ISINs from each company's public TradingView symbol page.
//
// The scanner endpoint does not expose ISINs, but the public symbol page embeds
// `"isin_displayed"`. We only fill NULL/empty ISINs, validate the ISO 6166
// checksum, reject duplicates, and record every change for rollback. The page
// must be for the exact EGX ticker; the embedded description is stored as
// evidence and, when the current name is a placeholder, used to improve it.
//
// Usage:
//   node scripts/recover-isin-tradingview.mjs            # dry run
//   node scripts/recover-isin-tradingview.mjs --apply    # write

import fs from "node:fs"
import path from "node:path"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const OUT = path.join(process.cwd(), "reports")

function isValidIsin(isin) {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return false
  let digits = ""
  for (const ch of isin.slice(0, 11)) {
    if (/[0-9]/.test(ch)) digits += ch
    else if (/[A-Z]/.test(ch)) digits += String(ch.charCodeAt(0) - 55)
    else return false
  }
  digits += isin[11]
  let sum = 0
  let dbl = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i])
    if (dbl) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    dbl = !dbl
  }
  return sum % 10 === 0
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .trim()
}

const PLACEHOLDER = /^(?:[A-Z]{2,8}\d?|GROV|MISR|PSCCHC|SUCE|VLMR|WATP|DIFCO2)$/i
// The local name on the VLMR page points at a different holding company and the
// database row has no Arabic name to compare against. Keep it unresolved until
// a second source confirms the identity.
const DEFER = new Set(["VLMR"])
// Words that appear in almost every issuer name and therefore cannot prove that
// a TradingView description belongs to the same company.
const EN_STOPWORDS = new Set([
  "investment", "investments", "development", "company", "group", "holding",
  "industries", "industry", "egypt", "egyptian", "international", "financial",
  "food", "foods", "touristic", "tourism", "real", "estate", "bank", "banks",
  "sae", "the", "and", "for", "of", "co",
])
// Bitumode is the brand of Modern Co. for Water Proofing; the TradingView
// description is a translation rather than a token match.
const TICKER_ONLY_OK = new Set(["WATP"])

const companies = await db.company.findMany({
  where: { isActive: true, OR: [{ isin: null }, { isin: "" }] },
  select: { id: true, ticker: true, nameEn: true, nameAr: true, isin: true },
  orderBy: { ticker: "asc" },
})
const used = new Set(
  (await db.company.findMany({ where: { isin: { not: null } }, select: { isin: true, ticker: true } })).map((c) =>
    String(c.isin).toUpperCase(),
  ),
)

const results = []
for (const c of companies) {
  const url = `https://www.tradingview.com/symbols/EGX-${c.ticker}/`
  let status = 0
  let isin = null
  let description = null
  let localDescription = null
  try {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } })
    status = res.status
    const html = await res.text()
    isin = html.match(/"isin_displayed":"([^"]+)"/)?.[1] ?? null
    description = html.match(/"description":"([^"]+)"/)?.[1] ?? null
    localDescription = html.match(/"local_description":"([^"]+)"/)?.[1] ?? null
  } catch (e) {
    results.push({ ticker: c.ticker, status, error: e.message })
    continue
  }

  const normalized = isin ? String(isin).toUpperCase() : null
  const checksum = normalized ? isValidIsin(normalized) : false
  const duplicate = normalized ? used.has(normalized) : false
  const genericDescription = /^egyptian exchange$/i.test(description || "")
  const nameTokens = norm(c.nameEn)
    .split(" ")
    .filter((t) => t.length >= 4 && !EN_STOPWORDS.has(t))
  const arabicTokens = norm(c.nameAr).split(" ").filter((t) => t.length >= 3)
  const descNorm = norm(description)
  const descCompact = descNorm.replace(/\s+/g, "")
  const localNorm = norm(localDescription)
  const englishOverlap = nameTokens.some((t) => descNorm.includes(t) || descCompact.includes(t))
  const arabicOverlap = arabicTokens.some((t) => localNorm.includes(t) || descNorm.includes(t))
  // A generic exchange description carries no identity signal; the exact EGX
  // ticker in the URL is then the only evidence. A conflicting local name is a
  // reason to stop, not to guess.
  const conflictingLocal = Boolean(localNorm && arabicTokens.length > 0 && !arabicOverlap)
  const nameOverlap = genericDescription || englishOverlap || arabicOverlap
  const placeholderName = PLACEHOLDER.test(c.nameEn)
  // When the exchange page carries no local name, an exact ticker plus a valid
  // checksum is enough to fill a missing ISIN for a placeholder / Arabic-named
  // row. A non-generic English description still has to match a real English
  // name (MMAT is the counter-example: the ticker page is a different company).
  const tickerOnlyAcceptable = !localNorm && (placeholderName || genericDescription)
  const deferred = DEFER.has(c.ticker)
  const acceptable = Boolean(
    normalized &&
      checksum &&
      !duplicate &&
      !conflictingLocal &&
      !deferred &&
      (nameOverlap || tickerOnlyAcceptable || TICKER_ONLY_OK.has(c.ticker)),
  )

  if (acceptable) used.add(normalized)

  results.push({
    ticker: c.ticker,
    companyId: c.id,
    currentIsin: c.isin,
    currentName: c.nameEn,
    status,
    isin: normalized,
    checksum,
    duplicate,
    nameOverlap,
    conflictingLocal,
    deferred,
    genericDescription,
    description,
    localDescription,
    acceptable,
  })

  await new Promise((r) => setTimeout(r, 1200))
}

const rollback = { generatedAt: new Date().toISOString(), source: "TRADINGVIEW_SYMBOL_PAGE", fills: [] }
let filled = 0
let nameFilled = 0

for (const r of results) {
  if (!r.acceptable) continue
  filled++
  rollback.fills.push({ companyId: r.companyId, ticker: r.ticker, oldIsin: r.currentIsin, newIsin: r.isin })
  if (APPLY) {
    const data = { isin: r.isin }
    // Only replace obvious placeholders, never a real existing name.
    if (PLACEHOLDER.test(r.currentName) && r.description && !r.genericDescription && r.description.length > 3) {
      data.nameEn = r.description
      nameFilled++
    }
    await db.company.update({ where: { id: r.companyId }, data })
  }
}

const summary = {
  applied: APPLY,
  missing: companies.length,
  fetched: results.filter((r) => r.status === 200).length,
  acceptable: results.filter((r) => r.acceptable).length,
  filled,
  nameFilled,
  rejected: results.filter((r) => !r.acceptable).map((r) => ({
    ticker: r.ticker,
    status: r.status,
    isin: r.isin,
    checksum: r.checksum,
    duplicate: r.duplicate,
    nameOverlap: r.nameOverlap,
    description: r.description,
  })),
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, "isin-recovery-tradingview.json"), JSON.stringify({ summary, results }, null, 2))
if (APPLY) fs.writeFileSync(path.join(OUT, "isin-recovery-tradingview-rollback.json"), JSON.stringify(rollback, null, 2))

console.log(JSON.stringify(summary, null, 1))
if (!APPLY) console.log("Dry run only. Re-run with --apply to write.")
await db.$disconnect()
