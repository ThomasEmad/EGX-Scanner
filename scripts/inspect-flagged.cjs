/* READ-ONLY inspection: what are the ACTUAL stored normalizedValues for the
   flagged tickers? This is what the app displays (DB, not the JSON).
   Usage: node --env-file=.env scripts/inspect-flagged.cjs */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()

const TICKERS = ["EGAL", "ATQA", "EGAS", "OFH", "MAAL", "BTFH", "PHGC"]
const CODES = ["REVENUE", "NET_PROFIT", "TOTAL_ASSETS", "TOTAL_EQUITY", "GROSS_PROFIT", "OPERATING_INCOME"]

;(async () => {
  const companies = await db.company.findMany({
    where: { ticker: { in: TICKERS } },
    select: { id: true, ticker: true, nameEn: true },
  })
  for (const co of companies) {
    console.log(`\n=== ${co.ticker} (${co.nameEn}) ===`)
    const vals = await db.financialValue.findMany({
      where: { companyId: co.id, metricCode: { in: CODES } },
      select: {
        metricCode: true, normalizedValue: true, unit: true,
        report: { select: { fiscalYear: true, periodLabel: true, periodType: true, sourceName: true } },
      },
    })
    const byMetric = {}
    for (const v of vals) (byMetric[v.metricCode] ||= []).push(v)
    for (const code of CODES) {
      const rows = (byMetric[code] || [])
        .filter((v) => v.report.periodType === "ANNUAL")
        .sort((a, b) => a.report.fiscalYear - b.report.fiscalYear)
      if (!rows.length) continue
      console.log(`  ${code}:`)
      for (const r of rows) {
        const m = r.normalizedValue / 1e6
        console.log(`    ${r.report.fiscalYear} (${r.report.periodLabel}): ${r.normalizedValue.toExponential(4)} = ${m.toFixed(1)}M  [${(r.report.sourceName || "").slice(0, 30)}]`)
      }
    }
  }
  // also: count of ANNUAL REVENUE growth > 1000% across the WHOLE db, to size the problem
  console.log("\n\n=== GLOBAL SCAN: ANNUAL REVENUE YoY growth |g| > 1000% ===")
  const allRev = await db.financialValue.findMany({
    where: { metricCode: "REVENUE", report: { periodType: "ANNUAL" } },
    select: { normalizedValue: true, companyId: true, company: { select: { ticker: true } }, report: { select: { fiscalYear: true } } },
  })
  const byCo = {}
  for (const v of allRev) (byCo[v.companyId] ||= []).push(v)
  let n = 0
  for (const cid of Object.keys(byCo)) {
    const rows = byCo[cid].sort((a, b) => a.report.fiscalYear - b.report.fiscalYear)
    for (let i = 1; i < rows.length; i++) {
      const p = rows[i - 1].normalizedValue, c = rows[i].normalizedValue
      if (!p) continue
      const g = ((c - p) / Math.abs(p)) * 100
      if (Math.abs(g) > 1000) {
        n++
        console.log(`  ${rows[i].company.ticker} ${rows[i-1].report.fiscalYear}->${rows[i].report.fiscalYear}: ${(p/1e6).toFixed(1)}M -> ${(c/1e6).toFixed(1)}M = ${g.toFixed(0)}%`)
      }
    }
  }
  console.log(`TOTAL ANNUAL-REVENUE >1000% growth cases: ${n}`)
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })

