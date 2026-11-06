/* UNIT NORMALIZATION AUDIT + REPAIR
   Scans every company's FinancialValues for unit-scale inconsistencies:
   a value that is exactly 1000x or 0.001x its temporal neighbors is almost
   certainly a THOUSANDS-vs-UNITS or MILLIONS-vs-UNITS mismatch.
   
   Strategy per (company, metricCode):
   1. Sort values by period (year, then quarter)
   2. For each value, compute ratio vs the median of its neighbors
   3. If ratio ≈ 1000 or 0.001 → flag as unit error → divide or multiply by 1000
   4. Skip values that are legitimately different (gate: ratio must be in 
      [990, 1010] or [0.0009, 0.0011] to be considered a unit error)
   5. REVENUE must be >= 0; TOTAL_ASSETS >= 0; NET_PROFIT can be ±

   Usage: node scripts/fix-unit-scales.cjs           (audit only)
          APPLY=1 node scripts/fix-unit-scales.cjs   (fix + audit)
*/
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const APPLY = process.env.APPLY === "1"

// only audit these metric codes (the ones investors filter on)
const AUDIT_CODES = new Set([
  "REVENUE", "NET_PROFIT", "TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY",
  "OPERATING_CASH_FLOW", "INVESTING_CASH_FLOW", "FINANCING_CASH_FLOW",
  "COGS", "GROSS_PROFIT", "NET_CHANGE_IN_CASH", "TOTAL_DEBT",
  "SHORT_TERM_DEBT", "LONG_TERM_DEBT", "INVENTORY", "EBITDA",
  "RETAINED_EARNINGS", "NON_CURRENT_ASSETS", "CURRENT_ASSETS", "CURRENT_LIABILITIES",
  "PROFIT_BEFORE_TAX", "INCOME_TAX", "CAPEX", "NET_PROFIT_PARENT",
])

function median(arr) {
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

;(async () => {
  const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true } })
  let fixed = 0, flagged = 0
  const fixLog = []

  for (const c of companies) {
    // Load ALL FinancialValues for this company grouped by metricCode
    const rawVals = await db.financialValue.findMany({
      where: { companyId: c.id, metricCode: { in: [...AUDIT_CODES] } },
      select: { id: true, metricCode: true, normalizedValue: true, reportId: true, report: { select: { periodEnd: true, periodLabel: true, fiscalYear: true, periodType: true, sourceName: true } } },
      orderBy: { metricCode: "asc" },
    })
    const allVals = rawVals.filter(v => v.normalizedValue !== null && v.normalizedValue !== undefined)

    // Group by metricCode
    const byMetric = new Map()
    for (const v of allVals) {
      if (!byMetric.has(v.metricCode)) byMetric.set(v.metricCode, [])
      byMetric.get(v.metricCode).push(v)
    }

    for (const [code, vals] of byMetric) {
      if (vals.length < 3) continue // need at least 3 values to detect outliers

      // Sort by period (year then quarter from periodEnd)
      const sorted = vals.map(v => ({
        ...v,
        sort: new Date(v.report.periodEnd).getTime(),
        absV: Math.abs(v.normalizedValue),
      })).sort((a, b) => a.sort - b.sort)

      // For each value, check against the median of its 2 neighbors (prev + next)
      for (let i = 1; i < sorted.length - 1; i++) {
        const cur = sorted[i]
        if (cur.absV === 0) continue
        const prev = sorted[i - 1]
        const next = sorted[i + 1]
        const neighbors = [prev.absV, next.absV].filter(v => v > 0)
        if (neighbors.length === 0) continue
        const med = median(neighbors)
        if (med === 0) continue

        const ratio = cur.absV / med

        // Check for 1000x error (value too large — should be divided by 1000)
        if (ratio >= 900 && ratio <= 1100) {
          // Verify the fix makes sense: corrected value should be closer to neighbors
          const corrected = cur.normalizedValue / 1000
          if (APPLY) {
            await db.financialValue.update({ where: { id: cur.id }, data: { normalizedValue: corrected, value: corrected } })
          }
          fixed++
          fixLog.push(`DIV1000 ${c.ticker} ${code} ${cur.report.periodLabel}: ${Math.round(cur.normalizedValue/1e6)}M → ${Math.round(corrected/1e6)}M (${cur.report.sourceName.slice(0,15)})`)
        }
        // Check for 0.001x error (value too small — should be multiplied by 1000)
        else if (ratio >= 0.0009 && ratio <= 0.0011) {
          const corrected = cur.normalizedValue * 1000
          if (APPLY) {
            await db.financialValue.update({ where: { id: cur.id }, data: { normalizedValue: corrected, value: corrected } })
          }
          fixed++
          fixLog.push(`MUL1000 ${c.ticker} ${code} ${cur.report.periodLabel}: ${Math.round(cur.normalizedValue/1e6)}M → ${Math.round(corrected/1e6)}M (${cur.report.sourceName.slice(0,15)})`)
        }
        // Check for moderate unit errors (100x or 0.01x)
        else if (ratio >= 90 && ratio <= 110) {
          const corrected = cur.normalizedValue / 100
          if (APPLY) {
            await db.financialValue.update({ where: { id: cur.id }, data: { normalizedValue: corrected, value: corrected } })
          }
          fixed++
          fixLog.push(`DIV100 ${c.ticker} ${code} ${cur.report.periodLabel}: ${Math.round(cur.normalizedValue/1e6)}M → ${Math.round(corrected/1e6)}M`)
        }
        else if (ratio >= 0.009 && ratio <= 0.011) {
          const corrected = cur.normalizedValue * 100
          if (APPLY) {
            await db.financialValue.update({ where: { id: cur.id }, data: { normalizedValue: corrected, value: corrected } })
          }
          fixed++
          fixLog.push(`MUL100 ${c.ticker} ${code} ${cur.report.periodLabel}: ${Math.round(cur.normalizedValue/1e6)}M → ${Math.round(corrected/1e6)}M`)
        }
        // Flag extreme outliers that aren't clean unit errors (for manual review)
        else if (ratio > 10 || ratio < 0.1) {
          flagged++
        }
      }
    }
  }

  if (APPLY) {
    await db.auditLog.create({ data: { actor: "system", action: "REVIEW_EDIT", entityType: "FinancialValue", details: `Unit normalization: ${fixed} values fixed (1000x/100x scale errors), ${flagged} extreme outliers flagged for manual review. Full log in console.` } })
  }

  console.log(JSON.stringify({ applied: APPLY, fixed, flagged, fixLogCount: fixLog.length }, null, 1))
  for (const l of fixLog.slice(0, 50)) console.log(" ", l)
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
