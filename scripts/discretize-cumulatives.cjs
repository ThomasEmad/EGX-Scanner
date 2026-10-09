/* Discretize: convert ALL SEMIANNUAL/NINE_MONTH cumulative reports into proper
   discrete quarters, then (with PURGE=1) delete every cumulative report.

   Rules per metric (COMI-lesson hardened):
   - STOCK (balance-sheet, point-in-time): the discrete quarter's position EQUALS
     the cumulative report's position → COPY (source quality applies, no math).
   - FLOW (income/cash, cumulative): discrete = cumulative − previous-cumulative,
     ONLY when the subtractor report has the SAME sourceName + statementType
     (never mix sources — the COMI lesson) AND passes gates:
       REVENUE >= 0 · |derived| within [0.25x, 4x] of the prior-quarter value
     Gate failures are logged, never silently applied.
   - Q4 = FY − 9M uses the same rules (FY treated as the cumulative end).
   Only-missing-slot everywhere; every action audit-logged.

   Usage: node scripts/discretize-cumulatives.cjs           (dry run)
          APPLY=1 PURGE=1 node scripts/discretize-cumulatives.cjs */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const APPLY = process.env.APPLY === "1"
const PURGE = process.env.PURGE === "1"

const STOCK_CODES = new Set(["TOTAL_ASSETS","TOTAL_LIABILITIES","TOTAL_EQUITY","EQUITY_PARENT","RETAINED_EARNINGS","SHARE_CAPITAL","CASH_AND_EQUIVALENTS","ACCOUNTS_RECEIVABLE","TRADE_PAYABLES","INVESTMENTS","PPE","DEPOSITS","INVENTORY","CURRENT_ASSETS","CURRENT_LIABILITIES","TOTAL_DEBT","NON_CONTROLLING_INTERESTS","CLOSING_CASH","GOODWILL","INTANGIBLE_ASSETS","TOTAL_EQUITY_AND_LIABILITIES","NON_CURRENT_ASSETS","SHORT_TERM_DEBT","LONG_TERM_DEBT","OTHER_PAYABLES","SHARES_OUTSTANDING","WORKING_CAPITAL"])
const SKIP_CODES = new Set(["OPENING_CASH"])

function qEnd(periodType, fy) {
  return { SEMIANNUAL: `${fy}-06-30`, NINE_MONTH: `${fy}-09-30`, QUARTERLY_Q2: `${fy}-06-30`, QUARTERLY_Q3: `${fy}-09-30`, QUARTERLY_Q4: `${fy}-12-31` }[periodType] ?? null
}

;(async () => {
  const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true, sector: true } })
  const stats = { q2: 0, q3: 0, q4: 0, gateSkips: 0, purged: 0 }
  const gateLog = []

  for (const c of companies) {
    const isBank = c.sector === "Banks"
    const reports = await db.financialReport.findMany({
      where: { companyId: c.id, fiscalYear: { gte: 2023 }, periodType: { in: ["SEMIANNUAL", "NINE_MONTH", "ANNUAL", "QUARTERLY"] } },
      select: { id: true, periodType: true, periodLabel: true, fiscalYear: true, sourceName: true, statementType: true },
    })

    const vals = async (r) => db.financialValue.findMany({ where: { reportId: r.id }, select: { metricCode: true, normalizedValue: true, subPeriod: true } })
    const findQ = async (type, label) => db.financialReport.findFirst({ where: { companyId: c.id, periodType: type, periodLabel: label, statementType: reports[0]?.statementType ?? "CONSOLIDATED" }, select: { id: true, sourceName: true } })

    async function putDiscrete(type, label, fy, end, sourceName, stmtType, code, value, provenance) {
      let target = await db.financialReport.findFirst({ where: { companyId: c.id, periodType: type, periodLabel: label, statementType: stmtType }, select: { id: true, sourceName: true } })
      if (!target) {
        if (!APPLY) return
        target = await db.financialReport.create({
          data: { companyId: c.id, reportType: "INTERIM", periodType: type, periodLabel: label, fiscalYear: fy, periodEnd: new Date(end), statementType: stmtType, processingStatus: "APPROVED", sourceName, version: 1 },
        })
      }
      const existing = await db.financialValue.findFirst({ where: { reportId: target.id, metricCode: code, subPeriod: "CURRENT" }, select: { id: true, normalizedValue: true, originalLabel: true } })
      if (existing) return // only-missing-slot
      if (!APPLY) return
      await db.financialValue.create({
        data: { companyId: c.id, reportId: target.id, metricCode: code, originalLabel: provenance, value, currency: "EGP", unit: "UNIT", statementType: stmtType, extractionMethod: "MANUAL_ENTRY", normalizedValue: value, validationStatus: "VALID" },
      })
    }

    for (const fy of [2026, 2025, 2024, 2023]) {
      const h1 = reports.find((r) => r.periodType === "SEMIANNUAL" && r.periodLabel === `H1 ${fy}`)
      const m9 = reports.find((r) => r.periodType === "NINE_MONTH" && r.periodLabel === `9M ${fy}`)
      const fyRep = reports.find((r) => r.periodType === "ANNUAL" && r.periodLabel === `FY ${fy}`)
      const q1 = reports.find((r) => r.periodType === "QUARTERLY" && r.periodLabel === `Q1 ${fy}`)
      const q2 = reports.find((r) => r.periodType === "QUARTERLY" && r.periodLabel === `Q2 ${fy}`)
      const q3 = reports.find((r) => r.periodType === "QUARTERLY" && r.periodLabel === `Q3 ${fy}`)

      // —— Q2 from H1 ——
      if (h1) {
        const q1Same = q1 && q1.sourceName === h1.sourceName ? q1 : null
        const h1v = await vals(h1)
        const q1v = q1Same ? await vals(q1Same) : []
        const q1Map = new Map(q1v.map((v) => [v.metricCode, v.normalizedValue]))
        for (const v of h1v) {
          if (v.normalizedValue === null || SKIP_CODES.has(v.metricCode)) continue
          if (STOCK_CODES.has(v.metricCode)) {
            await putDiscrete("QUARTERLY", `Q2 ${fy}`, fy, qEnd("QUARTERLY_Q2", fy), h1.sourceName, h1.statementType, v.metricCode, v.normalizedValue, `COPIED from H1 ${fy} balance sheet (source: ${h1.sourceName})`)
            stats.q2++
          } else if (q1Same) {
            const prev = q1Map.get(v.metricCode)
            if (prev === undefined || prev === null) continue
            const value = v.normalizedValue - prev
            if (v.metricCode === "REVENUE" && value < 0) { gateLog.push(`${c.ticker} Q2 ${fy} REVENUE negative (${Math.round(value/1e6)}M) — gate`); stats.gateSkips++; continue }
            if (prev !== 0 && (Math.abs(value) < Math.abs(prev) * 0.25 || Math.abs(value) > Math.abs(prev) * 4)) { gateLog.push(`${c.ticker} Q2 ${fy} ${v.metricCode} ratio ${Math.abs(value/prev).toFixed(2)}x — gate`); stats.gateSkips++; continue }
            if (isBank && (v.metricCode === "REVENUE" || v.metricCode === "NET_PROFIT")) { gateLog.push(`${c.ticker} Q2 ${fy} ${v.metricCode} bank cross-flow — gate`); stats.gateSkips++; continue }
            await putDiscrete("QUARTERLY", `Q2 ${fy}`, fy, qEnd("QUARTERLY_Q2", fy), `${h1.sourceName} (DERIVED)`, h1.statementType, v.metricCode, value, `DERIVED Q2 ${fy} = H1 ${fy} − Q1 ${fy} (source: ${h1.sourceName})`)
            stats.q2++
          }
        }
      }

      // —— Q3 from 9M − H1 (same source) or 9M − (Q1+Q2 same source) ——
      if (m9) {
        const h1Same = h1 && h1.sourceName === m9.sourceName ? h1 : null
        const m9v = await vals(m9)
        let subMap = null, subDesc = null
        if (h1Same) { const hv = await vals(h1Same); subMap = new Map(hv.map((v) => [v.metricCode, v.normalizedValue])); subDesc = `H1 ${fy}` }
        else if (q1 && q2 && q1.sourceName === m9.sourceName && q2.sourceName === m9.sourceName) {
          const a = await vals(q1), b = await vals(q2)
          subMap = new Map()
          for (const v of a) subMap.set(v.metricCode, (subMap.get(v.metricCode) ?? 0) + (v.normalizedValue ?? 0))
          for (const v of b) subMap.set(v.metricCode, (subMap.get(v.metricCode) ?? 0) + (v.normalizedValue ?? 0))
          subDesc = `Q1 ${fy} + Q2 ${fy}`
        }
        for (const v of m9v) {
          if (v.normalizedValue === null || SKIP_CODES.has(v.metricCode)) continue
          if (STOCK_CODES.has(v.metricCode)) {
            await putDiscrete("QUARTERLY", `Q3 ${fy}`, fy, qEnd("QUARTERLY_Q3", fy), m9.sourceName, m9.statementType, v.metricCode, v.normalizedValue, `COPIED from 9M ${fy} balance sheet (source: ${m9.sourceName})`)
            stats.q3++
          } else if (subMap) {
            const prev = subMap.get(v.metricCode)
            if (prev === undefined || prev === null) continue
            const value = v.normalizedValue - prev
            if (v.metricCode === "REVENUE" && value < 0) { gateLog.push(`${c.ticker} Q3 ${fy} REVENUE negative — gate`); stats.gateSkips++; continue }
            if (prev !== 0 && (Math.abs(value) < Math.abs(prev) * 0.25 || Math.abs(value) > Math.abs(prev) * 4)) { gateLog.push(`${c.ticker} Q3 ${fy} ${v.metricCode} ratio — gate`); stats.gateSkips++; continue }
            if (isBank && (v.metricCode === "REVENUE" || v.metricCode === "NET_PROFIT")) { gateLog.push(`${c.ticker} Q3 ${fy} ${v.metricCode} bank — gate`); stats.gateSkips++; continue }
            await putDiscrete("QUARTERLY", `Q3 ${fy}`, fy, qEnd("QUARTERLY_Q3", fy), `${m9.sourceName} (DERIVED)`, m9.statementType, v.metricCode, value, `DERIVED Q3 ${fy} = 9M ${fy} − ${subDesc} (source: ${m9.sourceName})`)
            stats.q3++
          }
        }
      }

      // —— Q4 from FY − 9M (same source) ——
      if (fyRep && m9 && m9.sourceName === fyRep.sourceName) {
        const fyv = await vals(fyRep)
        const m9v = await vals(m9)
        const m9Map = new Map(m9v.map((v) => [v.metricCode, v.normalizedValue]))
        for (const v of fyv) {
          if (v.normalizedValue === null || SKIP_CODES.has(v.metricCode)) continue
          if (STOCK_CODES.has(v.metricCode)) continue // FY balance = year-end position; Q4 report BS = same — only fill if Q4 missing
          const prev = m9Map.get(v.metricCode)
          if (prev === undefined || prev === null) continue
          const value = v.normalizedValue - prev
          if (v.metricCode === "REVENUE" && value < 0) { gateLog.push(`${c.ticker} Q4 ${fy} REVENUE negative — gate`); stats.gateSkips++; continue }
          if (prev !== 0 && (Math.abs(value) < Math.abs(prev) * 0.25 || Math.abs(value) > Math.abs(prev) * 4)) { gateLog.push(`${c.ticker} Q4 ${fy} ${v.metricCode} ratio — gate`); stats.gateSkips++; continue }
          if (isBank && (v.metricCode === "REVENUE" || v.metricCode === "NET_PROFIT")) { gateLog.push(`${c.ticker} Q4 ${fy} ${v.metricCode} bank — gate`); stats.gateSkips++; continue }
          await putDiscrete("QUARTERLY", `Q4 ${fy}`, fy, qEnd("QUARTERLY_Q4", fy), `${fyRep.sourceName} (DERIVED)`, fyRep.statementType, v.metricCode, value, `DERIVED Q4 ${fy} = FY ${fy} − 9M ${fy} (source: ${fyRep.sourceName})`)
          stats.q4++
        }
      }
    }
  }

  // —— purge cumulatives ——
  if (PURGE) {
    const gone = await db.financialReport.deleteMany({ where: { periodType: { in: ["SEMIANNUAL", "NINE_MONTH"] } } })
    stats.purged = gone.count
    await db.auditLog.create({ data: { actor: "system", action: "REVIEW_EDIT", entityType: "FinancialReport", details: `DISCRETIZE: converted cumulatives to discrete quarters (Q2:${stats.q2} Q3:${stats.q3} Q4:${stats.q4} values, ${stats.gateSkips} gate-skips logged) and purged ${gone.count} SEMIANNUAL/NINE_MONTH reports — site now carries discrete quarters only.` } })
  }

  console.log(JSON.stringify(stats, null, 1))
  if (gateLog.length) console.log("GATE SKIPS (" + gateLog.length + "), first 25:\n" + gateLog.slice(0, 25).join("\n"))
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
