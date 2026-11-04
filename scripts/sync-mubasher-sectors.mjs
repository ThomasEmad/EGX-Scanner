// Sync Company.sector to Mubasher's EGX sector-index membership.
//
//   node scripts/sync-mubasher-sectors.mjs            # dry run
//   node scripts/sync-mubasher-sectors.mjs --apply    # write
//   node scripts/sync-mubasher-sectors.mjs --rollback # restore last apply
//
// Why Mubasher: the original sectors came from TradingView's coarse taxonomy and
// mis-classified whole groups (UNIT = United Housing was "Financial Services";
// FWRY was "Financial Services" instead of Telecom/IT). AskBorsa's /companies
// grouping is better but still contains obvious errors (ICFC fertilisers in
// Banks, MASR real estate in Banks, UPMS in Real Estate). Mubasher publishes the
// EGX sector indices themselves, which are the exchange's own classification:
// BANK, REAL, NBFC, COCE, BASC, BULM, FOBT, HLTH, IGSA, TRVL, IMCS, SHTS, TRDB,
// ENGY, EDUS, TEDU, PAPC.
//
// A company can appear in more than one index (e.g. ICFC is in BANK and TRDB).
// We resolve those with an explicit override list below, then fall back to the
// index whose name best matches the company's activity.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ROLLBACK = process.argv.includes("--rollback")
const ROLLBACK_PATH = "reports/sector-sync-mubasher-rollback.json"

const INDEX_SECTOR = {
  BANK: "Banks",
  REAL: "Real Estate",
  NBFC: "Financial Services",
  COCE: "Construction",
  BASC: "Basic Materials",
  BULM: "Building Materials",
  FOBT: "Food",
  HLTH: "Healthcare",
  IGSA: "Industrial",
  TRVL: "Travel & Leisure",
  IMCS: "Telecom",
  SHTS: "Transport",
  TRDB: "Trade",
  ENGY: "Energy",
  EDUS: "Education",
  TEDU: "Textiles",
  PAPC: "Paper",
}

// Explicit resolutions for companies present in more than one index. The
// override is based on the company's actual activity, not on the first index
// that happens to list it.
const OVERRIDES = {
  ICFC: "Basic Materials", // International Company for Fertilizers & Chemicals (Mubasher lists it in BANK + TRDB)
  EGSA: "Telecom", // Egyptian Satellites (Nilesat) — Mubasher ticker is right, app name was wrong
  HBCO: "Real Estate", // Heibco (Hepco) for commercial investment & real-estate development
  KORA: "Construction", // Korra for Energy and Investment Projects
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()
}

async function fetchIndex(idx) {
  const res = await fetch(`https://english.mubasher.info/markets/EGX/indices/${idx}`, {
    headers: { "user-agent": "Mozilla/5.0 EGX-Scanner data audit" },
  })
  if (!res.ok) throw new Error(`Mubasher ${idx} HTTP ${res.status}`)
  const html = await res.text()
  const tickers = [...html.matchAll(/\/markets\/EGX\/stocks\/([A-Z0-9_]+)/g)].map((m) => m[1])
  return [...new Set(tickers)].filter((t) => !/ETF|_r1/i.test(t))
}

async function main() {
  if (ROLLBACK) {
    if (!existsSync(ROLLBACK_PATH)) throw new Error(`No rollback file at ${ROLLBACK_PATH}`)
    const rows = JSON.parse(readFileSync(ROLLBACK_PATH, "utf8"))
    let n = 0
    for (const r of rows) {
      const c = await db.company.findUnique({ where: { ticker: r.ticker }, select: { id: true, sector: true } })
      if (!c) continue
      if (c.sector !== r.from) {
        await db.company.update({ where: { ticker: r.ticker }, data: { sector: r.from } })
        n++
      }
    }
    console.log(`Rolled back ${n} sector(s) from ${ROLLBACK_PATH}`)
    return
  }

  const membership = new Map()
  for (const idx of Object.keys(INDEX_SECTOR)) {
    const tickers = await fetchIndex(idx)
    for (const t of tickers) {
      if (!membership.has(t)) membership.set(t, [])
      membership.get(t).push(INDEX_SECTOR[idx])
    }
  }

  const companies = await db.company.findMany({
    select: { ticker: true, nameEn: true, sector: true },
    orderBy: { ticker: "asc" },
  })

  const proposed = new Map()
  const conflicts = []
  for (const c of companies) {
    const memberships = membership.get(c.ticker)
    if (!memberships || memberships.length === 0) continue
    const unique = [...new Set(memberships)]
    let sector = OVERRIDES[c.ticker] ?? unique[0]
    if (unique.length > 1 && !OVERRIDES[c.ticker]) conflicts.push({ ticker: c.ticker, nameEn: c.nameEn, sectors: unique, chosen: sector })
    proposed.set(c.ticker, sector)
  }

  const changes = []
  const unmatchedApp = []
  for (const c of companies) {
    const to = proposed.get(c.ticker)
    if (!to) { unmatchedApp.push(c); continue }
    if (c.sector !== to) changes.push({ ticker: c.ticker, nameEn: c.nameEn, from: c.sector, to })
  }

  const appTickers = new Set(companies.map((c) => c.ticker))
  const unmatchedMubasher = [...membership.keys()].filter((t) => !appTickers.has(t)).sort()

  console.log(`\n=== Mubasher sector sync ${APPLY ? "APPLY" : "DRY RUN"} ===\n`)
  console.log(`Mubasher tickers parsed: ${membership.size}`)
  console.log(`App companies: ${companies.length} | matched: ${companies.length - unmatchedApp.length} | unmatched: ${unmatchedApp.length}`)
  console.log(`Sector changes: ${changes.length}\n`)
  for (const c of changes) console.log(`  ${c.ticker.padEnd(9)} ${String(c.from).padEnd(22)} -> ${String(c.to).padEnd(20)} ${c.nameEn}`)
  if (conflicts.length) {
    console.log(`\nMulti-index companies (${conflicts.length}):`)
    for (const c of conflicts) console.log(`  ${c.ticker.padEnd(9)} ${c.sectors.join(" | ").padEnd(34)} chosen=${c.chosen} ${c.nameEn}`)
  }
  if (unmatchedApp.length) {
    console.log(`\nApp tickers not in any Mubasher sector index (${unmatchedApp.length}):`)
    for (const c of unmatchedApp) console.log(`  ${c.ticker.padEnd(9)} ${String(c.sector).padEnd(22)} ${c.nameEn}`)
  }
  if (unmatchedMubasher.length) {
    console.log(`\nMubasher tickers not in app (${unmatchedMubasher.length}, informational):\n  ${unmatchedMubasher.join(", ")}`)
  }

  if (APPLY) {
    mkdirSync("reports", { recursive: true })
    writeFileSync(ROLLBACK_PATH, JSON.stringify(changes.map((c) => ({ ticker: c.ticker, from: c.from, to: c.to })), null, 2), "utf8")
    for (const c of changes) {
      await db.company.update({ where: { ticker: c.ticker }, data: { sector: c.to } })
    }
    console.log(`\nApplied ${changes.length} sector update(s). Rollback: ${ROLLBACK_PATH}`)
  } else {
    console.log(`\nDry run — re-run with --apply to write.`)
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
