/* Fleet ×1000 scale-disease detector/fixer, v2.
   Gate 1 (suspect): same-report ratio to NET_PROFIT/TOTAL_ASSETS exceeds the company's own
   historical median ratio by >50x (abs floor 100x), |value| > 1e9.
   Gate 2 (confirm): period continuity — stored value must be >=100x off from the median of the
   same code in the nearest non-suspect periods of the same company, and the ÷1000-fixed value
   must land within [neighbor/10, neighbor*10]. Rows with no neighbor data keep Gate-1 evidence
   but are tagged. This rejects whole-correct reports (e.g. EGAL FY2021) while catching
   mixed-scale reports (e.g. FWRY FY2024).
   Usage: node fix-x1000-fleet.cjs           (dry run) | APPLY=1 node fix-x1000-fleet.cjs  */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const CODES = ["REVENUE","COGS","GROSS_PROFIT","OPERATING_EXPENSES_TOTAL","PROFIT_BEFORE_TAX","INCOME_TAX","NET_PROFIT","NET_PROFIT_PARENT","EBIT","EBITDA","INTEREST_EXPENSE","TOTAL_ASSETS","TOTAL_LIABILITIES","TOTAL_EQUITY","TOTAL_EQUITY_AND_LIABILITIES","CURRENT_ASSETS","CURRENT_LIABILITIES","NON_CURRENT_ASSETS","CASH_AND_EQUIVALENTS","INVENTORY","SHORT_TERM_DEBT","LONG_TERM_DEBT","TOTAL_DEBT","RETAINED_EARNINGS","OPERATING_CASH_FLOW","INVESTING_CASH_FLOW","FINANCING_CASH_FLOW","NET_CHANGE_IN_CASH","FREE_CASH_FLOW","DEPRECIATION_AMORTIZATION","EXTRAORDINARY_ITEMS"]
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null }
;(async () => {
  const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true } })
  const vals = await db.financialValue.findMany({
    where: { companyId: { in: companies.map(c => c.id) }, metricCode: { in: CODES } },
    select: { id: true, companyId: true, metricCode: true, normalizedValue: true, reportId: true, report: { select: { periodLabel: true, periodEnd: true } } },
  })
  const byCompany = new Map()
  for (const v of vals) {
    if (v.normalizedValue == null) continue
    if (!byCompany.has(v.companyId)) byCompany.set(v.companyId, { reports: new Map(), byCode: new Map() })
    const cc = byCompany.get(v.companyId)
    if (!cc.reports.has(v.reportId)) cc.reports.set(v.reportId, { pe: new Date(v.report.periodEnd), label: v.report.periodLabel, row: {} })
    cc.reports.get(v.reportId).row[v.metricCode] = v
    if (!cc.byCode.has(v.metricCode)) cc.byCode.set(v.metricCode, [])
    cc.byCode.get(v.metricCode).push(v)
  }
  const tickerOf = new Map(companies.map(c => [c.id, c.ticker]))
  const plan = []
  for (const [companyId, cc] of byCompany) {
    for (const code of CODES) {
      for (const anchor of ["NET_PROFIT", "TOTAL_ASSETS"]) {
        if (code === anchor) continue
        const ratios = []
        for (const [, rep] of cc.reports) {
          const v = rep.row[code], a = rep.row[anchor]
          if (!v || !a || !v.normalizedValue || !a.normalizedValue) continue
          if (Math.abs(v.normalizedValue) < 1e6) continue
          ratios.push({ v, a: a.normalizedValue, ratio: Math.abs(v.normalizedValue) / Math.abs(a.normalizedValue) })
        }
        if (ratios.length < 2) continue
        let hist = median(ratios.map(r => r.ratio))
        if (!hist || hist < 1e-4) continue
        const isSus = (r) => r.ratio > hist * 50 && r.ratio > 100 && Math.abs(r.v.normalizedValue) > 1e9
        let sus = ratios.filter(isSus)
        if (sus.length) {
          const clean = ratios.filter(r => !isSus(r))
          if (clean.length >= 1) { const h2 = median(clean.map(r => r.ratio)); if (h2 && h2 >= 1e-4) { hist = h2; sus = ratios.filter(isSus) } }
        }
        if (!sus.length) continue
        // Gate 2: period continuity using nearest non-planned periods of same company+code
        const plannedIds = new Set(sus.map(s => s.v.id))
        const timeline = (cc.byCode.get(code) || []).filter(x => !plannedIds.has(x.id) && x.normalizedValue).map(x => ({ t: new Date(x.report.periodEnd), a: Math.abs(x.normalizedValue) })).sort((p, q) => p.t - q.t)
        for (const s of sus) {
          const t = new Date(s.v.report.periodEnd)
          const near = timeline.map(x => ({ x, d: Math.abs(x.t - t) })).sort((p, q) => p.d - q.d).slice(0, 4).map(z => z.x.a)
          const nb = median(near)
          const fixedVal = s.v.normalizedValue / 1000
          let confirm = "no-neighbor", ok = true
          if (nb) {
            const storedOff = Math.abs(s.v.normalizedValue) / nb
            const fixedNear = Math.abs(fixedVal) / nb
            if (storedOff < 100 || fixedNear > 10 || fixedNear < 0.1) { ok = false; confirm = `rejected (stored x${storedOff.toExponential(1)} nb, fixed x${fixedNear.toExponential(1)} nb)` }
            else confirm = `nb x${storedOff.toExponential(1)}`
          }
          plan.push({ id: s.v.id, ticker: tickerOf.get(companyId), code, label: s.v.report.periodLabel, stored: s.v.normalizedValue, fixedVal, hist, ratio: s.ratio, confirm, ok })
        }
        break
      }
    }
  }
  const seen = new Set()
  const unique = plan.filter(p => (seen.has(p.id) ? false : (seen.add(p.id), true)))
  const good = unique.filter(p => p.ok), bad = unique.filter(p => !p.ok)
  console.log(`suspects: ${unique.length} | fixable: ${good.length} | rejected by continuity: ${bad.length}`)
  const byT = {}
  for (const p of good) byT[p.ticker] = (byT[p.ticker] || 0) + 1
  console.log("fixable by company:", JSON.stringify(byT))
  for (const p of good) console.log(`FIX ${p.ticker.padEnd(6)} ${p.code.padEnd(24)} ${p.label.padEnd(9)} ${String(p.stored).padStart(18)} -> ${p.fixedVal.toPrecision(12)}  [${p.confirm}]`)
  for (const p of bad) console.log(`REJECT ${p.ticker.padEnd(6)} ${p.code.padEnd(22)} ${p.label.padEnd(9)} ${p.confirm}`)
  if (process.env.APPLY === "1") {
    let n = 0
    for (const p of good) {
      const v = await db.financialValue.findUnique({ where: { id: p.id }, select: { normalizedValue: true } })
      if (!v || Math.abs(v.normalizedValue - p.stored) > Math.abs(p.stored) * 0.001) { console.log(`GUARD-SKIP ${p.id}`); continue }
      await db.financialValue.update({ where: { id: p.id }, data: { normalizedValue: p.fixedVal, value: p.fixedVal } })
      n++
    }
    console.log(`APPLIED: ${n}`)
  }
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
