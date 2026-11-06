/* Consolidate duplicate QUARTERLY reports (same company+label+statementType)
   into the richest one, and delete empty QUARTERLY reports. */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
;(async () => {
  const groups = await db.financialReport.groupBy({ by: ["companyId", "periodType", "periodLabel", "statementType"], where: { periodType: "QUARTERLY" }, _count: { id: true }, having: { id: { _count: { gt: 1 } } } })
  console.log("duplicate quarterly groups:", groups.length)
  let consolidated = 0, emptied = 0
  for (const g of groups) {
    const reps = await db.financialReport.findMany({
      where: { companyId: g.companyId, periodType: "QUARTERLY", periodLabel: g.periodLabel, statementType: g.statementType },
      select: { id: true, sourceName: true, _count: { select: { values: true } } },
      orderBy: { id: "asc" },
    })
    // keep the report with the most values
    const keep = [...reps].sort((a, b) => b._count.values - a._count.values)[0]
    for (const r of reps) {
      if (r.id === keep.id) continue
      const vals = await db.financialValue.findMany({ where: { reportId: r.id } })
      const have = new Set((await db.financialValue.findMany({ where: { reportId: keep.id }, select: { metricCode: true, subPeriod: true } })).map(v => v.metricCode + ":" + (v.subPeriod ?? "C")))
      for (const v of vals) {
        const k = v.metricCode + ":" + (v.subPeriod ?? "C")
        if (have.has(k)) { await db.financialValue.delete({ where: { id: v.id } }); continue }
        try { await db.financialValue.update({ where: { id: v.id }, data: { reportId: keep.id } }); have.add(k) } catch (e) {}
      }
      const left = await db.financialValue.count({ where: { reportId: r.id } })
      if (left === 0) { await db.financialReport.delete({ where: { id: r.id } }); emptied++ }
      consolidated++
    }
  }
  // empty quarterly reports
  const empties = await db.financialReport.findMany({ where: { periodType: "QUARTERLY" }, select: { id: true, _count: { select: { values: true } } } })
  for (const e of empties) {
    if (e._count.values === 0) { await db.financialReport.delete({ where: { id: e.id } }); emptied++ }
  }
  console.log(JSON.stringify({ consolidated, emptied }))
  await db.auditLog.create({ data: { actor: "system", action: "REVIEW_EDIT", entityType: "FinancialReport", details: `Consolidated ${consolidated} duplicate quarterly reports (richest kept, values merged, dupes dropped) and removed ${emptied} empty quarterly reports after discretization.` } })
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
