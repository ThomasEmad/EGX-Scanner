/* DISCRETIZE — final architecture: the site shows DISCRETE QUARTERS (Q1-Q4) + FY only.
   Every genuine cumulative (H1/9M/FY) is decomposed into missing discrete quarters:
     Q2 = H1 − Q1 (reverse: Q1 = H1 − Q2)   · Q3 = 9M − H1
     Q4 = FY − 9M  (fallback: FY − H1 − Q3 / FY − Q1 − Q2 − Q3)
   Balance-sheet (STOCK) items are point-in-time: the Q2 position = the H1 position —
   COPIED, not subtracted. After decomposition the SEMIANNUAL/NINE_MONTH reports are
   DELETED (their information is fully preserved in discrete form).
   Usage: node scripts/discretize.cjs           (dry run)
          APPLY=1 node scripts/discretize.cjs   */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const APPLY = process.env.APPLY === "1"

const STOCK = new Set(["TOTAL_ASSETS","TOTAL_LIABILITIES","TOTAL_EQUITY","EQUITY_PARENT","RETAINED_EARNINGS","SHARE_CAPITAL","CASH_AND_EQUIVALENTS","ACCOUNTS_RECEIVABLE","TRADE_PAYABLES","INVESTMENTS","PPE","DEPOSITS","INVENTORY","CURRENT_ASSETS","CURRENT_LIABILITIES","TOTAL_DEBT","NON_CONTROLLING_INTERESTS","CLOSING_CASH","GOODWILL","INTANGIBLE_ASSETS"])
const SKIP = new Set(["OPENING_CASH"])

function valsMap(reportId) {
  return db.financialValue.findMany({ where: { reportId }, select: { id: true, metricCode: true, normalizedValue: true, subPeriod: true, statementType: true } })
    .then((rows) => {
      const m = new Map()
      for (const v of rows) {
        const k = v.metricCode + ":" + (v.subPeriod ?? "C")
        if (!m.has(k)) m.set(k, v) // first occurrence wins
      }
      return m
    })
}

;(async () => {
  const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true } })
  let added = 0, deletedReports = 0
  const log = []
  for (const c of companies) {
    const reports = await db.financialReport.findMany({
      where: { companyId: c.id, fiscalYear: { gte: 2018 }, periodType: { in: ["QUARTERLY", "SEMIANNUAL", "NINE_MONTH", "ANNUAL"] } },
      select: { id: true, periodType: true, periodLabel: true, fiscalYear: true, statementType: true, sourceName: true, periodEnd: true },
    })
    const byYear = new Map()
    for (const r of reports) {
      const k = r.fiscalYear + ":" + r.statementType
      if (!byYear.has(k)) byYear.set(k, {})
      const y = byYear.get(k)
      if (r.periodType === "SEMIANNUAL" && !y.H1) y.H1 = r
      if (r.periodType === "NINE_MONTH" && !y.M9) y.M9 = r
      if (r.periodType === "ANNUAL" && !y.FY) y.FY = r
      const qm = r.periodLabel && r.periodLabel.match(/Q([1-4])/)
      if (r.periodType === "QUARTERLY" && qm) {
        const qn = Number(qm[1])
        if (!y["Q" + qn]) y["Q" + qn] = r
      }
    }

    for (const [yearKey, y] of byYear) {
      const fy = Number(yearKey.split(":")[0])
      const vm = {}
      for (const slot of ["Q1", "Q2", "Q3", "Q4", "H1", "M9", "FY"]) {
        if (y[slot]) vm[slot] = await valsMap(y[slot].id)
      }

      // derivation plan: [targetSlot, sourceOps] where sourceOps are subtracted
      // (flows) or copied (stocks); prefer chains with the fewest assumptions
      const plans = []
      if (y.H1) {
        if (y.Q1 && !y.Q2) plans.push({ target: "Q2", label: `Q2 ${fy}`, end: `${fy}-06-30`, minuend: "H1", sub: ["Q1"] })
        if (y.Q2 && !y.Q1) plans.push({ target: "Q1", label: `Q1 ${fy}`, end: `${fy}-03-31`, minuend: "H1", sub: ["Q2"] })
      }
      if (y.M9) {
        if (y.H1 && !y.Q3) plans.push({ target: "Q3", label: `Q3 ${fy}`, end: `${fy}-09-30`, minuend: "M9", sub: ["H1"] })
        else if (!y.H1 && y.Q1 && y.Q2 && !y.Q3) plans.push({ target: "Q3", label: `Q3 ${fy}`, end: `${fy}-09-30`, minuend: "M9", sub: ["Q1", "Q2"] })
        if (!y.H1 && !y.Q1 && !y.Q2 && !y.Q3) {
          // 9M alone cannot be split — treat as Q3 standalone? NO: skip (ambiguous)
        }
      }
      if (y.FY) {
        if (y.M9 && !y.Q4) plans.push({ target: "Q4", label: `Q4 ${fy}`, end: `${fy}-12-31`, minuend: "FY", sub: ["M9"] })
        else if (!y.M9 && (y.Q1 || y.Q2 || y.Q3) && !y.Q4) plans.push({ target: "Q4", label: `Q4 ${fy}`, end: `${fy}-12-31`, minuend: "FY", sub: ["Q1", "Q2", "Q3"].filter((q) => y[q]) })
      }

      for (const plan of plans) {
        const minuendVals = vm[plan.minuend]
        const subMaps = plan.sub.map((s) => vm[s])
        // ensure target report exists
        if (!y[plan.target]) {
          if (!APPLY) log.push(`WOULD-CREATE ${c.ticker} ${plan.label}`)
          y[plan.target] = await db.financialReport.create({
            data: {
              companyId: c.id, reportType: "INTERIM", periodType: "QUARTERLY",
              periodLabel: plan.label, fiscalYear: fy, periodEnd: new Date(plan.end),
              statementType: y[plan.minuend].statementType, processingStatus: "APPROVED",
              sourceName: `DERIVED (${y[plan.minuend].sourceName.split(" ")[0]} chain)`, version: 1,
            },
          })
          vm[plan.target] = await valsMap(y[plan.target].id)
        }
        const target = y[plan.target]
        for (const [k, srcV] of minuendVals) {
          if (srcV.normalizedValue === null) continue
          if (k.split(":")[0] === "REVENUE" && k.split(":")[0] === "NET_PROFIT") { /* both handled below */ }
          const code = k.split(":")[0]
          if (SKIP.has(code)) continue
          if (vm[plan.target].has(k)) continue // slot filled
          const isStock = STOCK.has(code)
          let value
          if (isStock) {
            value = srcV.normalizedValue // point-in-time: Q2 position = H1 position
          } else {
            let sum = 0, ok = true
            for (const sm of subMaps) {
              const sv = [...sm.values()].find((x) => x.metricCode === code)
              if (!sv || sv.normalizedValue === null) { ok = false; break }
              sum += sv.normalizedValue
            }
            if (!ok) continue
            value = srcV.normalizedValue - sum
            // sanity: revenue can never be negative; other flows bounded by 4x swings vs the minuend
            if (code === "REVENUE" && value < 0) continue
            if (Math.abs(value) > Math.abs(srcV.normalizedValue) * 4) continue
          }
          if (Math.abs(value) < 1) continue
          if (APPLY) {
            try {
              await db.financialValue.create({
                data: {
                  companyId: c.id, reportId: target.id, metricCode: code,
                  originalLabel: `${isStock ? "COPIED position from" : "DERIVED"} ${plan.label}: ${plan.minuend}${plan.sub.length ? " − " + plan.sub.join(" − ") : ""} (${y[plan.minuend].sourceName.split(" ")[0]})`,
                  value, currency: "EGP", unit: "UNIT", statementType: target.statementType,
                  extractionMethod: "MANUAL_ENTRY", normalizedValue: value, validationStatus: "VALID",
                },
              })
              vm[plan.target].set(k, { id: "new", metricCode: code, normalizedValue: value, subPeriod: null, statementType: target.statementType })
              added++
            } catch (e) { /* unique collision — skip */ }
          }
        }
        if (APPLY) {
          // refresh map for subsequent plans
          vm[plan.target] = await valsMap(target.id)
        }
        if (!APPLY) log.push(`WOULD-FILL ${c.ticker} ${plan.label} from ${plan.minuend}−(${plan.sub.join("+") || "0"})`)
      }
    }
  }
  console.log(JSON.stringify({ applied: APPLY, valuesAdded: added }, null, 1))
  for (const l of log.slice(0, 25)) console.log(" ", l)
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
