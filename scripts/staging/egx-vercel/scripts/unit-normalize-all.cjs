/* COMPREHENSIVE UNIT SCALE NORMALIZER
   For each (company, metricCode): collect all values, compute median of log10(|values|),
   then flag/fix any value whose log10 deviates by >2.5 from the median (≈300x error).
   Only fixes when dividing/multiplying by 1000 brings the value within tolerance.
   
   Usage: node scripts/unit-normalize-all.cjs            (audit only)
          APPLY=1 node scripts/unit-normalize-all.cjs    (fix)
*/
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const APPLY = process.env.APPLY === "1"

// Only audit these flow/stock codes (the ones used in scanners/filters)
const AUDIT_CODES = new Set([
  "REVENUE","NET_PROFIT","TOTAL_ASSETS","TOTAL_LIABILITIES","TOTAL_EQUITY",
  "OPERATING_CASH_FLOW","INVESTING_CASH_FLOW","FINANCING_CASH_FLOW",
  "COGS","GROSS_PROFIT","NET_CHANGE_IN_CASH","TOTAL_DEBT",
  "SHORT_TERM_DEBT","LONG_TERM_DEBT","INVENTORY","EBITDA",
  "RETAINED_EARNINGS","NON_CURRENT_ASSETS","CURRENT_ASSETS","CURRENT_LIABILITIES",
  "PROFIT_BEFORE_TAX","INCOME_TAX","CAPEX","NET_PROFIT_PARENT",
])

function median(arr) {
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

;(async () => {
  const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true, sector: true } })
  let totalFixed = 0, totalFlagged = 0
  const fixLog = []

  for (const c of companies) {
    const isBank = c.sector === "Banks"
    const rawVals = await db.financialValue.findMany({
      where: { companyId: c.id, metricCode: { in: [...AUDIT_CODES] } },
      select: { id: true, metricCode: true, normalizedValue: true, reportId: true, report: { select: { periodEnd: true, periodLabel: true, fiscalYear: true, sourceName: true } } },
    })
    const allVals = rawVals.filter(v => v.normalizedValue !== null && v.normalizedValue !== undefined && v.normalizedValue !== 0)

    // Group by metricCode
    const byMetric = new Map()
    for (const v of allVals) {
      if (!byMetric.has(v.metricCode)) byMetric.set(v.metricCode, [])
      byMetric.get(v.metricCode).push(v)
    }

    for (const [code, vals] of byMetric) {
      if (vals.length < 3) continue

      // Compute median of log10(|values|) — this is scale-independent
      const logVals = vals.map(v => ({ ...v, log10: Math.log10(Math.abs(v.normalizedValue)) }))
      const medianLog = median(logVals.map(v => v.log10))

      for (const v of logVals) {
        const deviation = Math.abs(v.log10 - medianLog)
        if (deviation < 2.0) continue // within 100x of median — probably fine

        // Try to fix: if dividing by 1000 brings log10 closer to median → apply
        const logFixedDown = v.log10 - 3
        const logFixedUp = v.log10 + 3

        if (Math.abs(logFixedDown - medianLog) < Math.abs(v.log10 - medianLog) && Math.abs(logFixedDown - medianLog) < 1.0) {
          // Divide by 1000
          const corrected = v.normalizedValue / 1000
          if (APPLY && Math.abs(corrected) > 0) {
            await db.financialValue.update({ where: { id: v.id }, data: { normalizedValue: corrected, value: corrected } })
          }
          totalFixed++
          fixLog.push(`DIV1000 ${c.ticker} ${code} ${v.report.periodLabel}: ${Math.round(v.normalizedValue/1e6)}M → ${Math.round(corrected/1e6)}M (was ${deviation.toFixed(1)} from median)`)
        } else if (Math.abs(logFixedUp - medianLog) < Math.abs(v.log10 - medianLog) && Math.abs(logFixedUp - medianLog) < 1.0) {
          // Multiply by 1000
          const corrected = v.normalizedValue * 1000
          if (APPLY && Math.abs(corrected) > 0) {
            await db.financialValue.update({ where: { id: v.id }, data: { normalizedValue: corrected, value: corrected } })
          }
          totalFixed++
          fixLog.push(`MUL1000 ${c.ticker} ${code} ${v.report.periodLabel}: ${Math.round(v.normalizedValue/1e6)}M → ${Math.round(corrected/1e6)}M (was ${deviation.toFixed(1)} from median)`)
        } else {
          // Can't fix with 1000x — flag for manual review
          totalFlagged++
          if (totalFlagged <= 10) fixLog.push(`FLAG ${c.ticker} ${code} ${v.report.periodLabel}: ${Math.round(v.normalizedValue/1e6)}M (deviation ${deviation.toFixed(1)} — can't auto-fix)`)
        }
      }
    }
  }

  console.log(JSON.stringify({ applied: APPLY, totalFixed, totalFlagged, fixLogCount: fixLog.length }, null, 1))
  for (const l of fixLog.slice(0, 80)) console.log(" ", l)
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
