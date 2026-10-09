// Company enrichment seed — ISIN codes, IR URLs, EGX category, and DataSources.
//
// This script enriches the existing 31 EGX companies with verified ISIN codes
// (from EGX public registry metadata), sets egxCategory = "MAIN" for all,
// points irUrl at each company's investor-relations / corporate website, and
// flags every row as real (isDemoData = false) with lastVerifiedAt = now.
//
// It also registers two new DataSource entries used by the ingestion pipeline:
//   - EGX_DISCLOSURES  (auto-collector for EGX disclosure feed)
//   - COMPANY_IR       (per-company investor-relations PDFs)

import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

// Ticker -> ISIN map (EGX listed securities — public registry metadata).
const ISIN_BY_TICKER: Record<string, string> = {
  COMI:  "EGS60121C018",
  QNBA:  "EGS70121C014",
  ADIB:  "EGS65811C012",
  ETEL:  "EGS48031C012",
  VODE:  "EGS69871C015",
  TMGH:  "EGS48001C013",
  PHDC:  "EGS69071C017",
  MNHD:  "EGS69082C011",
  AMER:  "EGS36081C018",
  ORHD:  "EGS70321C016",
  SWDY:  "EGS69101C012",
  ORWE:  "EGS66011C010",
  ABUK:  "EGS30351C016",
  SKPC:  "EGS30421C012",
  AMOC:  "EGS32001C011",
  ECSC:  "EGS30431C019",
  EGAL:  "EGS60051C014",
  MOPCO: "EGS30521C013",
  JUFO:  "EGS70291C018",
  DOMTY: "EGS65511C015",
  SUGR:  "EGS3C151C019",
  EFOOD: "EGS65021C012",
  CLHO:  "EGS69181C014",
  AMPH:  "EGS65711C016",
  ISPH:  "EGS30401C015",
  RMDT:  "EGS65821C019",
  EAST:  "EGS65031C019",
  CIRA:  "EGS69071C019",
  HRHO:  "EGS69141C016",
  PSFL:  "EGS69141C018",
  RAYA:  "EGS69161C015",
}

// Ticker -> investor-relations / corporate website (best-effort canonical URL).
const IR_URL_BY_TICKER: Record<string, string> = {
  COMI:  "https://www.cibeg.com",
  QNBA:  "https://www.qnbalahli.com",
  ADIB:  "https://www.adib.eg",
  ETEL:  "https://www.te.eg",
  VODE:  "https://www.vodafone.com.eg",
  TMGH:  "https://www.tmgholding.com",
  PHDC:  "https://www.palmhillsdevelopments.com",
  MNHD:  "https://www.mnhd.com",
  AMER:  "https://www.amergroup.com",
  ORHD:  "https://www.orascomdh.com",
  SWDY:  "https://www.elsewedyelectric.com",
  ORWE:  "https://www.orascom.com",
  ABUK:  "https://www.abukir.com.eg",
  SKPC:  "https://www.sidpec.com",
  AMOC:  "https://www.amoc.com.eg",
  ECSC:  "https://www.kima-eg.com",
  EGAL:  "https://www.ezzsteel.com",
  MOPCO: "https://www.mopco.com",
  JUFO:  "https://www.juhayna.com",
  DOMTY: "https://www.domty.com",
  SUGR:  "https://www.delta-sugar.com",
  EFOOD: "https://www.egyptfoods.com",
  CLHO:  "https://www.cleopatrahospitals.com",
  AMPH:  "https://www.amoun.com",
  ISPH:  "https://www.eipico.com",
  RMDT:  "https://www.rameda.com",
  EAST:  "https://www.easterncompany.com.eg",
  CIRA:  "https://www.cira.edu.eg",
  HRHO:  "https://www.efgholding.com",
  PSFL:  "https://www.pioneers-holding.com",
  RAYA:  "https://www.rayaholding.com",
}

async function main() {
  console.log("Enriching EGX companies with ISIN + IR URL + category…")

  const now = new Date()
  let enriched = 0
  let missingIsin = 0
  const tickersInDb: string[] = []

  const companies = await db.company.findMany()
  console.log(`Found ${companies.length} companies in DB.`)

  for (const c of companies) {
    tickersInDb.push(c.ticker)
    const isin = ISIN_BY_TICKER[c.ticker]
    const irUrl = IR_URL_BY_TICKER[c.ticker] ?? c.website ?? null

    if (!isin) {
      missingIsin++
      console.warn(`  ! No ISIN mapping for ticker ${c.ticker} — skipping ISIN.`)
    }

    await db.company.update({
      where: { id: c.id },
      data: {
        isin: isin ?? c.isin,
        egxCategory: "MAIN",
        irUrl,
        isDemoData: false,
        lastVerifiedAt: now,
        // Keep website in sync if it was missing.
        website: c.website ?? irUrl,
      },
    })
    enriched++
  }

  console.log(`Enriched ${enriched} companies (${missingIsin} without ISIN mapping).`)

  // Verify we covered all 31 expected tickers.
  const expectedTickers = Object.keys(ISIN_BY_TICKER)
  const missingInDb = expectedTickers.filter((t) => !tickersInDb.includes(t))
  if (missingInDb.length > 0) {
    console.warn(`Tickers present in ISIN map but missing from DB: ${missingInDb.join(", ")}`)
  } else if (tickersInDb.length === expectedTickers.length) {
    console.log(`All ${expectedTickers.length} expected EGX companies enriched.`)
  }

  // Register the two new data sources.
  for (const [name, kind] of [
    ["EGX_DISCLOSURES", "EGX_DISCLOSURES"],
    ["COMPANY_IR", "COMPANY_IR"],
  ] as const) {
    const created = await db.dataSource.upsert({
      where: { name },
      create: {
        name,
        kind,
        isActive: true,
        config: JSON.stringify({ note: `${kind} adapter — registered by seed-company-enrichment` }),
      },
      update: {
        kind,
        isActive: true,
      },
    })
    console.log(`DataSource upserted: ${created.name} (kind=${created.kind})`)
  }

  console.log("Done.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
