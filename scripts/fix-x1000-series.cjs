/* Whole-series ×1000 detector — for codes whose ENTIRE series for a company sits at 1000x reality.
   Anchor: market cap = sharesOutstanding × latest MarketPrice.price.
   Fires when EVERY stored |value| of (company, code) is within [500x, 2000x] mcap — i.e. the fixed
   series lands in the sane TA/mcap ∈ [0.5, 2] band (real companies: TA/mcap 1-10, banks ~5-10;
   nothing real sits at 500x mcap). Mixed-scale series (min already sane) are left to fix-x1000-fleet.
   Usage: node fix-x1000-series.cjs | APPLY=1 node fix-x1000-series.cjs */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const CODES = ["REVENUE","COGS","GROSS_PROFIT","OPERATING_EXPENSES_TOTAL","PROFIT_BEFORE_TAX","INCOME_TAX","NET_PROFIT","NET_PROFIT_PARENT","EBIT","EBITDA","INTEREST_EXPENSE","TOTAL_ASSETS","TOTAL_LIABILITIES","TOTAL_EQUITY","TOTAL_EQUITY_AND_LIABILITIES","CURRENT_ASSETS","CURRENT_LIABILITIES","NON_CURRENT_ASSETS","CASH_AND_EQUIVALENTS","INVENTORY","SHORT_TERM_DEBT","LONG_TERM_DEBT","TOTAL_DEBT","RETAINED_EARNINGS","OPERATING_CASH_FLOW","INVESTING_CASH_FLOW","FINANCING_CASH_FLOW","NET_CHANGE_IN_CASH","FREE_CASH_FLOW"]
;(async () => {
  const companies = await db.company.findMany({ where: { isActive: true, sharesOutstanding: { gte: 1e6 } }, select: { id: true, ticker: true, sharesOutstanding: true } })
  const tick = new Date()
  const rows = await db.financialValue.findMany({ where: { metricCode: { in: CODES }, normalizedValue: { not: undefined } }, select: { id: true, companyId: true, metricCode: true, normalizedValue: true, report: { select: { periodLabel: true } } } })
  const prices = await db.marketPrice.groupBy({ by: ["companyId"], where: { asOf: { gte: new Date(tick.getFullYear() - 2, 0, 1) } }, _max: { price: true } })
  const pxOf = new Map(prices.map(p => [p.companyId, p._max.price]))
  const byCC = new Map()
  for (const r of rows) {
    if (r.normalizedValue == null) continue
    const k = r.companyId + "|" + r.metricCode
    if (!byCC.has(k)) byCC.set(k, [])
    byCC.get(k).push(r)
  }
  const plan = []
  for (const [k, list] of byCC) {
    const [companyId, code] = k.split("|")
    const c = companies.find(x => x.id === companyId)
    if (!c) continue
    const px = pxOf.get(companyId)
    if (!px || px < 0.5) continue
    const mc = c.sharesOutstanding * px
    if (mc < 1e8) continue
    const abs = list.map(r => Math.abs(r.normalizedValue)).filter(v => v >= 1e6)
    if (abs.length < 2) continue
    const mn = Math.min(...abs), mx = Math.max(...abs)
    const lo = mn / mc, hi = mx / mc
    if (lo >= 500 && hi <= 2000) {
      for (const r of list) plan.push({ id: r.id, ticker: c.ticker, code, label: r.report.periodLabel, stored: r.normalizedValue, fixedVal: r.normalizedValue / 1000, mc, lo, hi })
    }
  }
  console.log(`whole-series suspects: ${plan.length} rows`)
  const byT = {}
  for (const p of plan) { byT[p.ticker] = byT[p.ticker] || {}; byT[p.ticker][p.code] = (byT[p.ticker][p.code] || 0) + 1 }
  for (const [t, codes] of Object.entries(byT)) console.log("  " + t + ": " + Object.entries(codes).map(([c, n]) => c + "x" + n).join(", "))
  for (const p of plan.slice(0, 40)) console.log(`FIX ${p.ticker.padEnd(6)} ${p.code.padEnd(22)} ${p.label.padEnd(9)} ${String(p.stored).padStart(18)} -> ${(p.fixedVal).toPrecision(12)}`)
  if (plan.length > 40) console.log(`... and ${plan.length - 40} more`)
  if (process.env.APPLY === "1") {
    let n = 0
    for (const p of plan) {
      const v = await db.financialValue.findUnique({ where: { id: p.id }, select: { normalizedValue: true } })
      if (!v || Math.abs(v.normalizedValue - p.stored) > Math.abs(p.stored) * 0.001) { console.log(`GUARD-SKIP ${p.id}`); continue }
      await db.financialValue.update({ where: { id: p.id }, data: { normalizedValue: p.fixedVal, value: p.fixedVal } })
      n++
    }
    console.log(`APPLIED: ${n}`)
  }
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
