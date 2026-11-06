/* V-shape stock-row detector: BS stock codes are cumulative balances. A single-period drop of
   >80% vs the previous period followed by a >5x rebound has no accounting mechanism (losses do
   not reverse next quarter) => the bottom row is garbage (misparsed source cell) -> delete.
   Guard: neighbor values >= 1e7 (skip micro/shell noise), stock codes only. */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
// structural balances only — cash/debt legitimately swing (repayment+reborrow) so V-shape proves nothing there
const STOCK = ["TOTAL_ASSETS","TOTAL_LIABILITIES","TOTAL_EQUITY","TOTAL_EQUITY_AND_LIABILITIES","CURRENT_ASSETS","CURRENT_LIABILITIES","NON_CURRENT_ASSETS","INVENTORY","RETAINED_EARNINGS","SHARE_CAPITAL","EQUITY_PARENT"]
;(async () => {
  const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true } })
  const rows = await db.financialValue.findMany({ where: { metricCode: { in: STOCK } }, select: { id: true, companyId: true, metricCode: true, normalizedValue: true, report: { select: { periodLabel: true, periodEnd: true } } } })
  const byCC = new Map()
  for (const r of rows) {
    if (!r.normalizedValue) continue
    const k = r.companyId + "|" + r.metricCode
    if (!byCC.has(k)) byCC.set(k, [])
    byCC.get(k).push(r)
  }
  const tk = new Map(companies.map(c => [c.id, c.ticker]))
  const dels = []
  for (const [k, list] of byCC) {
    if (list.length < 3) continue
    const sorted = [...list].sort((a, b) => new Date(a.report.periodEnd) - new Date(b.report.periodEnd))
    for (let i = 1; i < sorted.length - 1; i++) {
      const prev = sorted[i - 1].normalizedValue, cur = sorted[i].normalizedValue, next = sorted[i + 1].normalizedValue
      if (!prev || !cur || !next || prev < 0 || cur < 0 || next < 0) continue
      if (prev < 1e7 || next < 1e7) continue
      if (cur < 0.2 * prev && next > 5 * cur) dels.push({ id: sorted[i].id, ticker: tk.get(sorted[i].companyId), code: sorted[i].metricCode, label: sorted[i].report.periodLabel, stored: cur, prev, next })
    }
  }
  console.log(`V-shape deletes: ${dels.length}`)
  for (const d of dels) console.log(`DEL ${d.ticker.padEnd(6)} ${d.code.padEnd(26)} ${d.label.padEnd(9)} ${String(d.stored).padStart(14)}  (prev ${d.prev.toPrecision(8)}, next ${d.next.toPrecision(8)})`)
  if (process.env.APPLY === "1") {
    for (const d of dels) { try { await db.financialValue.delete({ where: { id: d.id } }) } catch (e) { console.log("skip", d.id) } }
    console.log("deleted:", dels.length)
  }
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
