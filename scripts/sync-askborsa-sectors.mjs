// Sync Company.sector to AskBorsa's EGX sector taxonomy.
//
//   node scripts/sync-askborsa-sectors.mjs            # dry run (default)
//   node scripts/sync-askborsa-sectors.mjs --apply    # write changes
//   node scripts/sync-askborsa-sectors.mjs --rollback # restore the last apply
//
// Source: https://askborsa.com/companies — 305 listed companies grouped into
// the official EGX sectors. The page is public; no login required.
//
// Why: the original sectors came from TradingView's coarse taxonomy and
// mis-classified companies (e.g. UNIT = United Housing & Development was
// "Financial Services" instead of Real Estate; FWRY was "Financial Services"
// instead of Telecom/IT). Peer comparison is only meaningful inside the real
// sector, so this mapping is the foundation of the peer fix.
//
// The script is deterministic and reversible: every changed ticker's previous
// sector is written to reports/sector-sync-rollback.json before applying.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ROLLBACK = process.argv.includes("--rollback")
const ROLLBACK_PATH = "reports/sector-sync-rollback.json"

const AR_TO_EN = {
  "العقارات": "Real Estate",
  "الخدمات المالية غير المصرفية": "Financial Services",
  "الأغذية والمشروبات والتبغ": "Food",
  "الرعاية الصحية والأدوية": "Healthcare",
  "المقاولات والإنشاءات الهندسية": "Construction",
  "الموارد الأساسية": "Basic Materials",
  "مواد البناء": "Building Materials",
  "البنوك": "Banks",
  "السياحة والترفيه": "Travel & Leisure",
  "أخرى": "Other",
  "الخدمات والمنتجات الصناعية والسيارات": "Industrial",
  "المنسوجات والسلع المعمرة": "Textiles",
  "الاتصالات والإعلام وتكنولوجيا المعلومات": "Telecom",
  "خدمات النقل والشحن": "Transport",
  "التجارة والموزعون": "Trade",
  "الطاقة والخدمات المساندة": "Energy",
  "الخدمات التعليمية": "Education",
  "الورق ومواد التعبئة والتغليف": "Paper",
  "الكيماويات": "Chemicals",
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()
}

async function fetchAskBorsa() {
  const res = await fetch("https://askborsa.com/companies", {
    headers: { "user-agent": "Mozilla/5.0 Meza data audit" },
  })
  if (!res.ok) throw new Error(`AskBorsa HTTP ${res.status}`)
  const html = await res.text()
  const out = []
  const sectionRe = /<section\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g
  let m
  while ((m = sectionRe.exec(html))) {
    const id = m[1]
    const body = m[2]
    const h2 = body.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)
    if (!h2) continue
    const sectorAr = stripTags(h2[1])
    const sector = AR_TO_EN[sectorAr]
    if (!sector) continue
    const tickers = [...body.matchAll(/href="\/company\/([A-Z0-9_]+)"/g)].map((x) => x[1])
    for (const ticker of new Set(tickers)) {
      if (ticker.endsWith("_r1")) continue // rights issue, not the listed share
      if (/ETF/i.test(ticker)) continue
      out.push({ ticker, sector, sectorAr, sectionId: id })
    }
  }
  return out
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

  const ask = await fetchAskBorsa()
  const byTicker = new Map()
  const duplicates = []
  for (const r of ask) {
    if (byTicker.has(r.ticker) && byTicker.get(r.ticker).sector !== r.sector) duplicates.push(r)
    byTicker.set(r.ticker, r)
  }

  const companies = await db.company.findMany({
    select: { ticker: true, nameEn: true, sector: true },
    orderBy: { ticker: "asc" },
  })

  const changes = []
  const unmatchedApp = []
  for (const c of companies) {
    const a = byTicker.get(c.ticker)
    if (!a) { unmatchedApp.push(c); continue }
    if (c.sector !== a.sector) changes.push({ ticker: c.ticker, nameEn: c.nameEn, from: c.sector, to: a.sector, askSector: a.sectorAr })
  }

  const appTickers = new Set(companies.map((c) => c.ticker))
  const unmatchedAsk = [...byTicker.values()].filter((r) => !appTickers.has(r.ticker))

  console.log(`\n=== AskBorsa sector sync ${APPLY ? "APPLY" : "DRY RUN"} ===\n`)
  console.log(`AskBorsa listed tickers parsed: ${byTicker.size}`)
  console.log(`App companies: ${companies.length} | matched: ${companies.length - unmatchedApp.length} | unmatched: ${unmatchedApp.length}`)
  console.log(`Sector changes: ${changes.length}\n`)
  for (const c of changes) console.log(`  ${c.ticker.padEnd(9)} ${String(c.from).padEnd(22)} -> ${String(c.to).padEnd(20)} (${c.askSector})`)
  if (unmatchedApp.length) {
    console.log(`\nApp tickers not in AskBorsa (${unmatchedApp.length}):`)
    for (const c of unmatchedApp) console.log(`  ${c.ticker.padEnd(9)} ${String(c.sector).padEnd(22)} ${c.nameEn}`)
  }
  if (duplicates.length) {
    console.log(`\nAmbiguous AskBorsa duplicates (ignored, last wins): ${duplicates.length}`)
    for (const d of duplicates.slice(0, 10)) console.log(`  ${d.ticker} ${d.sector}`)
  }
  if (unmatchedAsk.length) {
    console.log(`\nAskBorsa tickers not in app (${unmatchedAsk.length}, informational):`)
    console.log("  " + unmatchedAsk.map((r) => `${r.ticker}:${r.sector}`).join(", "))
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
