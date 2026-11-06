/* Profit-vs-assets scale repair: an earnings/flow line exceeding 90% of the SAME report's
   TOTAL_ASSETS (both > 1e6) is impossible (max real ROA ~30% for banks) -> the flow is x1000.
   After /1000 it must land <= 30% of TA to qualify. Deletes rows still impossible post-fix
   (quarterly profit > that year's annual). Usage: node fix-profit-vs-assets.cjs | APPLY=1 ... */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const FLOWS = ["NET_PROFIT","NET_PROFIT_PARENT","PROFIT_BEFORE_TAX","GROSS_PROFIT","EBIT","EBITDA","OPERATING_CASH_FLOW","INVESTING_CASH_FLOW","FINANCING_CASH_FLOW"]
;(async () => {
  const rows = await db.financialValue.findMany({ where: { metricCode: { in: [...FLOWS, "TOTAL_ASSETS"] } }, select: { id: true, companyId: true, metricCode: true, normalizedValue: true, reportId: true, report: { select: { periodLabel: true, periodType: true, fiscalYear: true, periodEnd: true } } } })
  const byReport = new Map()
  for (const r of rows) {
    if (r.normalizedValue == null) continue
    if (!byReport.has(r.reportId)) byReport.set(r.reportId, [])
    byReport.get(r.reportId).push(r)
  }
  // annual profits per company for quarter-vs-annual check
  const annualNP = new Map()
  for (const [, list] of byReport) for (const r of list) if (r.report.periodType === "ANNUAL" && r.metricCode === "NET_PROFIT") annualNP.set(r.companyId + "|" + r.report.fiscalYear, r.normalizedValue)
  const comps = await db.company.findMany({ select: { id: true, ticker: true } })
  const tk = new Map(comps.map(c => [c.id, c.ticker]))
  const fixes = [], dels = []
  for (const [reportId, list] of byReport) {
    const ta = list.find(r => r.metricCode === "TOTAL_ASSETS")
    if (!ta || ta.normalizedValue <= 1e6) continue
    for (const r of list) {
      if (!FLOWS.includes(r.metricCode)) continue
      const v = Math.abs(r.normalizedValue)
      if (v <= 1e6) continue
      if (v <= 0.9 * ta.normalizedValue) continue
      const fixed = r.normalizedValue / 1000
      if (Math.abs(fixed) > 0.3 * ta.normalizedValue) continue // doesn't land sane -> leave for manual
      if (r.report.periodType === "QUARTERLY") {
        const fy = r.report.fiscalYear
        const annual = annualNP.get(r.companyId + "|" + fy) ?? annualNP.get(r.companyId + "|" + (fy - 1))
        if (annual != null && annual > 1e6 && Math.abs(fixed) > annual) { dels.push({ ...r, ticker: tk.get(r.companyId), fixed, annual }); continue }
      }
      fixes.push({ ...r, ticker: tk.get(r.companyId), fixed })
    }
  }
  console.log(`fixes: ${fixes.length}, deletes: ${dels.length}`)
  for (const f of fixes) console.log(`FIX ${f.ticker.padEnd(6)} ${f.metricCode.padEnd(20)} ${f.report.periodLabel.padEnd(9)} ${String(f.normalizedValue).padStart(16)} -> ${f.fixed.toPrecision(10)}`)
  for (const d of dels) console.log(`DEL  ${d.ticker.padEnd(6)} ${d.metricCode.padEnd(20)} ${d.report.periodLabel.padEnd(9)} ${String(d.normalizedValue).padStart(16)} (fixed ${d.fixed.toExponential(2)} > annual ${d.annual.toExponential(2)})`)
  if (process.env.APPLY === "1") {
    for (const f of fixes) await db.financialValue.update({ where: { id: f.id }, data: { normalizedValue: f.fixed, value: f.fixed } })
    for (const d of dels) { try { await db.financialValue.delete({ where: { id: d.id } }) } catch {}
    }
    console.log(`APPLIED fixes=${fixes.length} dels=${dels.length}`)
  }
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
