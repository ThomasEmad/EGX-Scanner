/* SOURCE-AUTHORITY UNIT NORMALIZER — SAFE VERSION
   For each (company, metricCode):
   1. Identify the PRIMARY source (the one with the most values)
   2. Use the primary source's median as the reference scale
   3. Values from OTHER sources that deviate >100x from the primary source's scale
      are DELETED (safer than trying to fix them)
   
   This NEVER touches the primary source's values.
   
   Usage: node scripts/source-authority-normalize.cjs           (dry run)
          APPLY=1 node scripts/source-authority-normalize.cjs   */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const APPLY = process.env.APPLY === "1"

const AUDIT_CODES = new Set([
  "REVENUE","NET_PROFIT","TOTAL_ASSETS","TOTAL_LIABILITIES","TOTAL_EQUITY",
  "OPERATING_CASH_FLOW","INVESTING_CASH_FLOW","FINANCING_CASH_FLOW",
  "COGS","GROSS_PROFIT","NET_CHANGE_IN_CASH","TOTAL_DEBT",
  "SHORT_TERM_DEBT","LONG_TERM_DEBT","INVENTORY","EBITDA",
  "RETAINED_EARNINGS","NON_CURRENT_ASSETS","CURRENT_ASSETS","CURRENT_LIABILITIES",
])

function median(arr) {
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

;(async () => {
  const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true } })
  let totalDeleted = 0
  const delLog = []

  for (const c of companies) {
    const rawVals = await db.financialValue.findMany({
      where: { companyId: c.id, metricCode: { in: [...AUDIT_CODES] } },
      select: { id: true, metricCode: true, normalizedValue: true, reportId: true, report: { select: { periodLabel: true, sourceName: true } } },
    })
    const allVals = rawVals.filter(v => v.normalizedValue !== null && v.normalizedValue !== undefined)

    // Group by metricCode
    const byMetric = new Map()
    for (const v of allVals) {
      if (!byMetric.has(v.metricCode)) byMetric.set(v.metricCode, [])
      byMetric.get(v.metricCode).push(v)
    }

    for (const [code, vals] of byMetric) {
      if (vals.length < 2) continue

      // 1) Identify primary source (most values)
      const bySource = new Map()
      for (const v of vals) {
        const src = v.report.sourceName.split(/[+(]/)[0].trim()
        if (!bySource.has(src)) bySource.set(src, [])
        bySource.get(src).push(v)
      }
      let primarySrc = null, primaryCount = 0
      for (const [src, sVals] of bySource) {
        if (sVals.length > primaryCount) { primarySrc = src; primaryCount = sVals.length }
      }
      if (!primarySrc || primaryCount < 2) continue // need at least 2 values from primary source

      // 2) Compute primary source's median
      const primaryVals = bySource.get(primarySrc).map(v => Math.abs(v.normalizedValue)).filter(v => v > 0)
      if (primaryVals.length === 0) continue
      const primaryMedian = median(primaryVals)
      if (primaryMedian === 0) continue

      // 3) Check OTHER sources' values against primary source's scale
      for (const v of vals) {
        const src = v.report.sourceName.split(/[+(]/)[0].trim()
        if (src === primarySrc) continue // primary source values are trusted
        if (v.normalizedValue === 0) continue

        const ratio = Math.abs(v.normalizedValue) / primaryMedian
        // If the value is >100x or <0.01x the primary source's median scale → DELETE
        if (ratio > 100 || ratio < 0.01) {
          if (APPLY) {
            await db.financialValue.delete({ where: { id: v.id } })
          }
          totalDeleted++
          delLog.push(`DEL ${c.ticker} ${code} ${v.report.periodLabel}: ${Math.round(v.normalizedValue/1e6)}M from ${src.slice(0,20)} — conflicts with ${primarySrc} median ${Math.round(primaryMedian/1e6)}M (${ratio.toFixed(0)}x)`)
        }
      }
    }
  }

  console.log(JSON.stringify({ applied: APPLY, totalDeleted }, null, 1))
  for (const l of delLog.slice(0, 80)) console.log(" ", l)
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
