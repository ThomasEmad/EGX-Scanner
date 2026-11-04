// Fix company-identity mismatches found while auditing the AskBorsa/Mubasher
// names against the stored data. These four tickers were carrying the WRONG
// company name (the financial values themselves match the real issuer):
//
//   NDRL  stored "Grand Capital for Financial Investments (GRCA.CA)"
//         actual National Drilling (AskBorsa: 2025 net profit 9.95m, assets
//         80.31m, equity 56.7m — exactly the stored values)
//   EGSA  stored "Egyptian Steel"
//         actual Egyptian Satellites (Nilesat) — stored assets/equity match
//   HBCO  stored "Heliopolis Brewing Company"
//         actual Heibco/Hepco for commercial investment & real-estate
//         development — stored FY2025 38.25m profit / 310m assets / 127m equity
//   KORA  stored "Korra Steel"
//         actual Korra for Energy and Investment Projects
//
// Reversible: reports/company-identity-rollback.json stores the old names.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ROLLBACK = process.argv.includes("--rollback")
const PATH = "reports/company-identity-rollback.json"

const FIXES = [
  { ticker: "NDRL", nameEn: "National Drilling", nameAr: "الحفر الوطنية" },
  { ticker: "EGSA", nameEn: "Egyptian Satellites Co SAE (Nilesat)", nameAr: "نايل سات" },
  { ticker: "HBCO", nameEn: "Heibco for Commercial Investments & Real Estate Development (Hepco)", nameAr: "هيبكو" },
  { ticker: "KORA", nameEn: "Korra for Energy and Investment Projects", nameAr: "قرة لمشروعات الطاقة والاستثمار" },
]

async function main() {
  if (ROLLBACK) {
    if (!existsSync(PATH)) throw new Error(`No rollback file at ${PATH}`)
    const rows = JSON.parse(readFileSync(PATH, "utf8"))
    let n = 0
    for (const r of rows) {
      const c = await db.company.findUnique({ where: { ticker: r.ticker }, select: { id: true } })
      if (!c) continue
      await db.company.update({ where: { ticker: r.ticker }, data: { nameEn: r.nameEn, nameAr: r.nameAr } })
      n++
    }
    console.log(`Rolled back ${n} company name(s)`)
    return
  }

  const changes = []
  for (const f of FIXES) {
    const c = await db.company.findUnique({ where: { ticker: f.ticker }, select: { ticker: true, nameEn: true, nameAr: true } })
    if (!c) { console.log(`missing ${f.ticker}`); continue }
    console.log(`${c.ticker}: "${c.nameEn}" -> "${f.nameEn}"`)
    changes.push({ ticker: c.ticker, nameEn: c.nameEn, nameAr: c.nameAr })
    if (APPLY) await db.company.update({ where: { ticker: c.ticker }, data: { nameEn: f.nameEn, nameAr: f.nameAr } })
  }

  if (APPLY) {
    mkdirSync("reports", { recursive: true })
    writeFileSync(PATH, JSON.stringify(changes, null, 2), "utf8")
    console.log(`Applied ${changes.length} name fix(es). Rollback: ${PATH}`)
  } else {
    console.log("Dry run — re-run with --apply to write.")
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
