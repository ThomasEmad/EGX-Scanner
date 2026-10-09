/* Fix sharesOutstanding where Thndr (exchange-sourced listed_shares) proves ours
   wrong by >20% — junk from scraped supplements (e.g. VALU 9.4M vs real 2.1B).
   Audit-logs every change. 5-20% diffs are only flagged (could be capital
   increases where ours is legitimately newer — kept for manual review).
   Usage: node scripts/thndr-fix-shares.cjs         (dry run)
          APPLY=1 node scripts/thndr-fix-shares.cjs */
const fs = require("fs")
const path = require("path")
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const APPLY = process.env.APPLY === "1"

const file = path.join(__dirname, "../../egx-data/data/thndr-marketwatch.json")
const rows = JSON.parse(fs.readFileSync(file, "utf8")).filter((r) => String(r.isin || "").startsWith("EGS") && Number(r.shares) > 0)

;(async () => {
  const companies = await db.company.findMany({
    where: { isActive: true, sharesOutstanding: { not: null } },
    select: { id: true, ticker: true, isin: true, sharesOutstanding: true },
  })
  const byTicker = new Map(companies.map((c) => [c.ticker.toUpperCase(), c]))
  const byIsin = new Map(companies.filter((c) => c.isin).map((c) => [c.isin, c]))

  let fixed = 0
  const flagged = []
  for (const r of rows) {
    const c = byTicker.get(String(r.t || "").toUpperCase()) || byIsin.get(r.isin)
    if (!c || !c.sharesOutstanding) continue
    const thndr = Number(r.shares)
    const diff = Math.abs(thndr - c.sharesOutstanding) / Math.max(c.sharesOutstanding, 1) * 100
    if (diff <= 5) continue
    if (diff > 20) {
      // ours is provably junk at this magnitude (scraped-supplement artifacts);
      // Thndr's listed_shares comes from the exchange
      if (APPLY) {
        await db.company.update({ where: { id: c.id }, data: { sharesOutstanding: thndr } })
        await db.auditLog.create({
          data: {
            actor: "system",
            action: "REVIEW_EDIT",
            entityType: "Company",
            entityId: c.id,
            details: `sharesOutstanding corrected ${c.sharesOutstanding} -> ${thndr} for ${c.ticker} via Thndr exchange-sourced listed_shares (diff ${diff.toFixed(0)}%). Backup: dev.db.pre-thndr-import-20260930.bak`,
          },
        })
      }
      fixed++
      console.log(`${APPLY ? "FIXED" : "WOULD-FIX"} ${c.ticker}: ${c.sharesOutstanding} -> ${thndr} (${diff.toFixed(0)}%)`)
    } else {
      flagged.push({ ticker: c.ticker, ours: c.sharesOutstanding, thndr, diffPct: diff })
    }
  }
  console.log(JSON.stringify({ applied: APPLY, fixed, flaggedForReview: flagged }, null, 1))
  await db.$disconnect()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
