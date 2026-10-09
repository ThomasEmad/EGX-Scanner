const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const APPLY = process.env.APPLY === "1"
;(async () => {
  const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true } })
  let fixed = 0, zeroDeleted = 0
  const log = []
  for (const c of companies) {
    const rows = await db.$queryRawUnsafe(`SELECT fv.id, fv.metricCode, fv.normalizedValue, fr.fiscalYear, fr.periodLabel, fr.sourceName FROM FinancialValue fv JOIN FinancialReport fr ON fr.id = fv.reportId WHERE fv.companyId = ? AND fv.normalizedValue IS NOT NULL AND fv.metricCode IN ('REVENUE','NET_PROFIT','TOTAL_ASSETS','TOTAL_LIABILITIES','TOTAL_EQUITY','OPERATING_CASH_FLOW','GROSS_PROFIT','TOTAL_DEBT','COGS') ORDER BY fv.metricCode, fr.fiscalYear`, c.id)
    const byMetric = {}
    for (const r of rows) { if (!byMetric[r.metricCode]) byMetric[r.metricCode] = []; byMetric[r.metricCode].push(r) }
    for (const [code, vals] of Object.entries(byMetric)) {
      vals.sort((a, b) => a.fiscalYear - b.fiscalYear)
      for (let i = 0; i < vals.length; i++) {
        if (vals[i].normalizedValue === 0) {
          const prev = vals[i-1], next = vals[i+1]
          if ((prev && prev.normalizedValue !== 0) || (next && next.normalizedValue !== 0)) {
            if (APPLY) await db.financialValue.delete({ where: { id: vals[i].id } })
            zeroDeleted++
            if (log.length < 15) log.push(`DEL-ZERO ${c.ticker} ${code} ${vals[i].periodLabel}`)
          }
        }
      }
      for (let i = 0; i < vals.length - 1; i++) {
        const a = Math.abs(vals[i].normalizedValue)
        const b = Math.abs(vals[i+1].normalizedValue)
        if (a === 0 || b === 0) continue
        const ratio = Math.max(a,b) / Math.min(a,b)
        if (ratio < 200) continue
        const smallerIdx = a < b ? i : i + 1
        const smaller = vals[smallerIdx]
        const corrected = smaller.normalizedValue * 1000
        if (Math.abs(corrected) / Math.max(a,b) > 10) continue
        if (APPLY) { await db.financialValue.update({ where: { id: smaller.id }, data: { normalizedValue: corrected, value: corrected } }); vals[smallerIdx].normalizedValue = corrected }
        fixed++
        if (log.length < 40) log.push(`FIX ${c.ticker} ${code} ${smaller.periodLabel}: ${Math.round(smaller.normalizedValue/1e6)}M → ${Math.round(corrected/1e6)}M (${ratio.toFixed(0)}x)`)
      }
    }
  }
  if (APPLY) await db.auditLog.create({ data: { actor: "system", action: "REVIEW_EDIT", entityType: "FinancialValue", details: `Unit jump fix: ${fixed} values multiplied by 1000, ${zeroDeleted} zero values deleted.` } })
  console.log(JSON.stringify({ applied: APPLY, fixed, zeroDeleted }))
  for (const l of log) console.log(" ", l)
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
