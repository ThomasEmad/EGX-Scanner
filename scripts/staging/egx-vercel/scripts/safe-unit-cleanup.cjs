/* SAFE UNIT CLEANUP — deletes only IMPOSSIBLE values:
   - Values > 100B EGP for non-bank companies (impossible for EGX non-banks)
   - Values < 10K EGP for REVENUE, TOTAL_ASSETS (too small to be real)
   NEVER touches banks (they legitimately have large values).
   NEVER touches values within plausible ranges.
   Usage: node scripts/safe-unit-cleanup.cjs           (dry run)
          APPLY=1 node scripts/safe-unit-cleanup.cjs   */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const APPLY = process.env.APPLY === "1"

const AUDIT_CODES = new Set([
  "REVENUE","NET_PROFIT","TOTAL_ASSETS","TOTAL_LIABILITIES","TOTAL_EQUITY",
  "OPERATING_CASH_FLOW","INVESTING_CASH_FLOW","FINANCING_CASH_FLOW",
  "COGS","GROSS_PROFIT","TOTAL_DEBT","EBITDA",
  "SHORT_TERM_DEBT","LONG_TERM_DEBT","NON_CURRENT_ASSETS",
  "CURRENT_ASSETS","CURRENT_LIABILITIES","PROFIT_BEFORE_TAX",
])

;(async () => {
  const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true, sector: true } })
  let deleted = 0
  const delLog = []

  for (const c of companies) {
    const isBank = c.sector === "Banks"
    if (isBank) continue // banks have large values legitimately

    const vals = await db.financialValue.findMany({
      where: { companyId: c.id, metricCode: { in: [...AUDIT_CODES] } },
      select: { id: true, metricCode: true, normalizedValue: true, report: { select: { periodLabel: true, sourceName: true } } },
    })

    for (const v of vals) {
      if (v.normalizedValue === null || v.normalizedValue === undefined) continue
      const abs = Math.abs(v.normalizedValue)
      let reason = null

      // Impossible values for non-bank EGX companies
      if (abs > 100e9) reason = `>100B — impossible for ${c.sector}`
      else if (v.metricCode === "REVENUE" && abs > 0 && abs < 10e3) reason = `<10K revenue — too small`

      if (!reason) continue
      if (APPLY) {
        await db.financialValue.delete({ where: { id: v.id } })
      }
      deleted++
      delLog.push(`${APPLY ? "DEL" : "WOULD-DEL"} ${c.ticker} ${v.metricCode} ${v.report.periodLabel}: ${Math.round(abs/1e6)}M (${reason}) [${v.report.sourceName.slice(0,15)}]`)
    }
  }

  console.log(JSON.stringify({ applied: APPLY, deleted }, null, 1))
  for (const l of delLog.slice(0, 60)) console.log(" ", l)
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
