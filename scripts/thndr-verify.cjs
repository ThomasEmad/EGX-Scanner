/* Thndr cross-verification + import.
   1) Match egx-data/data/thndr-marketwatch.json rows to our companies (ticker, then ISIN)
   2) Compare price / EPS / P/E / dividend yield / shares vs our latest verified values
   3) Import: today's live prices (MarketPrice, THNDR_MARKETWATCH) + missing sharesOutstanding
   Usage: node scripts/thndr-verify.cjs           (compare only)
          IMPORT=1 node scripts/thndr-verify.cjs (compare + import)
*/
const fs = require("fs")
const path = require("path")
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()

const IMPORT = process.env.IMPORT === "1"
const file = path.join(__dirname, "../../egx-data/data/thndr-marketwatch.json")
const rows = JSON.parse(fs.readFileSync(file, "utf8")).filter((r) => String(r.isin || "").startsWith("EGS"))

function pctDiff(a, b) {
  if (!a || !b) return null
  return Math.abs(a - b) / Math.abs(b) * 100
}

;(async () => {
  const companies = await db.company.findMany({
    where: { isActive: true },
    select: { id: true, ticker: true, isin: true, nameEn: true, nameAr: true, sharesOutstanding: true },
  })
  const byTicker = new Map(companies.map((c) => [c.ticker.toUpperCase(), c]))
  const byIsin = new Map(companies.filter((c) => c.isin).map((c) => [c.isin, c]))

  const matched = []
  const unmatchedThndr = []
  for (const r of rows) {
    const c = byTicker.get(String(r.t || "").toUpperCase()) || byIsin.get(r.isin)
    if (c) matched.push({ thndr: r, company: c })
    else unmatchedThndr.push(r)
  }

  // our latest annual metrics + latest price per matched company (batched)
  const ids = matched.map((m) => m.company.id)
  const metricRows = ids.length
    ? await db.$queryRawUnsafe(
        `SELECT companyId, code, value, fiscalYear FROM (
           SELECT cm."companyId", cm.code, cm.value, cm."fiscalYear",
                  ROW_NUMBER() OVER (PARTITION BY cm."companyId", cm.code ORDER BY cm."fiscalYear" DESC) AS rn
           FROM CalculatedMetric cm
           WHERE cm."companyId" IN (${ids.map(() => "?").join(",")})
             AND cm."periodType" = 'ANNUAL' AND cm."valueStatus" = 'OK' AND cm.value IS NOT NULL
             AND cm.code IN ('eps','p_e','dividend_yield')
         ) t WHERE rn = 1`,
        ...ids
      )
    : []
  const metrics = new Map()
  for (const m of metricRows) {
    if (!metrics.has(m.companyId)) metrics.set(m.companyId, {})
    metrics.get(m.companyId)[m.code] = { value: m.value, fiscalYear: m.fiscalYear }
  }

  const priceRows = ids.length
    ? await db.$queryRawUnsafe(
        `SELECT mp."companyId", mp.price, mp."asOf" FROM MarketPrice mp
         WHERE mp."companyId" IN (${ids.map(() => "?").join(",")})
           AND mp."asOf" = (SELECT MAX("asOf") FROM MarketPrice WHERE "companyId" = mp."companyId")`,
        ...ids
      )
    : []
  const prices = new Map(priceRows.map((p) => [p.companyId, p]))

  const report = []
  let importedPrices = 0
  let importedShares = 0
  const conflicts = { price: [], eps: [], pe: [], dy: [], shares: [] }
  const clean = { price: 0, eps: 0, pe: 0, dy: 0, shares: 0 }

  for (const { thndr, company } of matched) {
    const ours = metrics.get(company.id) || {}
    const ourPrice = prices.get(company.id)
    const asOf = thndr.dt ? new Date(thndr.dt) : null
    const px = Number(thndr.px) > 0 ? Number(thndr.px) : null

    const diffs = {}
    // price (only meaningful if our latest price is < 60 days old vs thndr's)
    if (px && ourPrice?.price > 0) {
      const d = pctDiff(px, ourPrice.price)
      if (d !== null) {
        diffs.price = { thndr: px, ours: ourPrice.price, diffPct: d, oursAsOf: ourPrice.asOf }
        if (d <= 2) clean.price++
        else conflicts.price.push({ ticker: company.ticker, ...diffs.price })
      }
    }
    // EPS
    if (thndr.eps && ours.eps?.value) {
      const d = pctDiff(thndr.eps, ours.eps.value)
      if (d !== null) {
        diffs.eps = { thndr: thndr.eps, ours: ours.eps.value, fy: ours.eps.fiscalYear, diffPct: d }
        if (d <= 10) clean.eps++
        else conflicts.eps.push({ ticker: company.ticker, ...diffs.eps })
      }
    }
    // P/E
    if (thndr.pe > 0 && ours.p_e?.value > 0) {
      const d = pctDiff(thndr.pe, ours.p_e.value)
      if (d !== null) {
        diffs.pe = { thndr: thndr.pe, ours: ours.p_e.value, diffPct: d }
        if (d <= 10) clean.pe++
        else conflicts.pe.push({ ticker: company.ticker, ...diffs.pe })
      }
    }
    // dividend yield
    if (thndr.dy > 0 && ours.dividend_yield?.value > 0) {
      const d = pctDiff(thndr.dy, ours.dividend_yield.value)
      if (d !== null) {
        diffs.dy = { thndr: thndr.dy, ours: ours.dividend_yield.value, diffPct: d }
        if (d <= 25) clean.dy++
        else conflicts.dy.push({ ticker: company.ticker, ...diffs.dy })
      }
    }
    // shares
    if (thndr.shares > 0 && company.sharesOutstanding > 0) {
      const d = pctDiff(thndr.shares, company.sharesOutstanding)
      if (d !== null) {
        diffs.shares = { thndr: thndr.shares, ours: company.sharesOutstanding, diffPct: d }
        if (d <= 5) clean.shares++
        else conflicts.shares.push({ ticker: company.ticker, ...diffs.shares })
      }
    }
    report.push({ ticker: company.ticker, thndrPx: px, thndrAsOf: thndr.dt || null, ...diffs })

    if (IMPORT) {
      if (px && asOf && !Number.isNaN(asOf.getTime())) {
        await db.marketPrice.upsert({
          where: { companyId_asOf: { companyId: company.id, asOf } },
          create: { companyId: company.id, asOf, price: px, sourceName: "THNDR_MARKETWATCH" },
          update: { price: px, sourceName: "THNDR_MARKETWATCH" },
        })
        importedPrices++
      }
      if (thndr.shares > 0 && !company.sharesOutstanding) {
        await db.company.update({ where: { id: company.id }, data: { sharesOutstanding: Number(thndr.shares) } })
        importedShares++
      }
    }
  }

  const summary = {
    thndrSecurities: rows.length,
    matched: matched.length,
    unmatchedThndr: unmatchedThndr.map((r) => r.t).slice(0, 60),
    clean,
    conflictCounts: { price: conflicts.price.length, eps: conflicts.eps.length, pe: conflicts.pe.length, dy: conflicts.dy.length, shares: conflicts.shares.length },
    import: IMPORT ? { importedPrices, importedShares } : null,
  }
  const outPath = path.join(__dirname, "../../egx-data/data/thndr-comparison-report.json")
  fs.writeFileSync(outPath, JSON.stringify({ summary, conflicts, report }, null, 1), "utf8")
  console.log(JSON.stringify(summary, null, 1))
  console.log("full report: " + outPath)
  await db.$disconnect()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
