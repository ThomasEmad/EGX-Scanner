/* Systematic relabel of YAHOO interim mislabels.
   PROVEN (6-company S&P cross-check): Yahoo SEMIANNUAL reports carry the Q2
   DISCRETE quarter's data, NINE_MONTH carry Q3 (COMI 36,172≈35,331 · SWDY
   88,017=88,017 exact · TMGH 17,121=17,121 exact · ETEL · PHDC · ADIB).
   Q1 and FY Yahoo reports are unambiguous and stay.
   Relabel: SEMIANNUAL→QUARTERLY "Q2 {fy}" · NINE_MONTH→QUARTERLY "Q3 {fy}"
   (Dec-FY companies only; June-FY flagged for manual review).
   Collisions with existing Q2/Q3 reports → merge missing values, delete dup.
   Usage: node scripts/relabel-yahoo-interims.cjs          (dry run)
          APPLY=1 node scripts/relabel-yahoo-interims.cjs  */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const APPLY = process.env.APPLY === "1"

;(async () => {
  const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true } })
  let relabeled = 0, mergedDeleted = 0, flaggedJuneFY = 0
  const log = []
  for (const c of companies) {
    const reports = await db.financialReport.findMany({
      where: { companyId: c.id, sourceName: { contains: "YAHOO_FINANCE_API" }, periodType: { in: ["SEMIANNUAL", "NINE_MONTH"] }, fiscalYear: { gte: 2023 } },
      select: { id: true, periodType: true, periodLabel: true, fiscalYear: true, statementType: true },
    })
    // fiscal calendar: FY-end month from the company's ANNUAL report
    const fyAnnual = await db.financialReport.findFirst({
      where: { companyId: c.id, periodType: "ANNUAL", fiscalYear: { gte: 2023 } },
      orderBy: { fiscalYear: "desc" },
      select: { periodEnd: true },
    })
    const fyEndMonth = fyAnnual?.periodEnd ? fyAnnual.periodEnd.getUTCMonth() + 1 : 12
    if (fyEndMonth >= 4 && fyEndMonth <= 8) {
      // June-FY (or offset) — interim labels ambiguous, manual review only
      flaggedJuneFY += reports.length
      continue
    }
    for (const r of reports) {
      const q = r.periodType === "SEMIANNUAL" ? { n: 2, label: `Q2 ${r.fiscalYear}`, end: `${r.fiscalYear}-06-30` } : { n: 3, label: `Q3 ${r.fiscalYear}`, end: `${r.fiscalYear}-09-30` }
      const existing = await db.financialReport.findFirst({
        where: { companyId: c.id, periodType: "QUARTERLY", periodLabel: q.label, statementType: r.statementType, id: { not: r.id } },
        select: { id: true },
      })
      const co = c.ticker
      if (APPLY) {
        if (!existing) {
          await db.financialReport.update({ where: { id: r.id }, data: { periodType: "QUARTERLY", periodLabel: q.label, periodEnd: new Date(q.end) } })
          await db.auditLog.create({ data: { actor: "system", action: "REVIEW_EDIT", entityType: "FinancialReport", entityId: r.id, details: `Relabeled Yahoo ${r.periodLabel} -> ${q.label} for ${co}: Yahoo interim reports carry the latest DISCRETE quarter (proven vs S&P: SWDY/TMGH/ETEL/PHDC/ADIB/COMI). Dec-FY company.` } })
          relabeled++
          log.push(`RELABEL ${co} ${r.periodLabel} -> ${q.label}`)
        } else {
          const have = new Set((await db.financialValue.findMany({ where: { reportId: existing.id }, select: { metricCode: true, subPeriod: true } })).map(v => v.metricCode + ":" + (v.subPeriod ?? "CURRENT")))
          const vals = await db.financialValue.findMany({ where: { reportId: r.id } })
          let moved = 0
          for (const v of vals) {
            const k = v.metricCode + ":" + (v.subPeriod ?? "CURRENT")
            if (have.has(k)) continue
            try {
              await db.financialValue.update({ where: { id: v.id }, data: { reportId: existing.id } })
              have.add(k)
              moved++
            } catch (e) { /* unique (reportId, metricCode, subPeriod) collision — skip */ }
          }
          await db.financialValue.deleteMany({ where: { reportId: r.id } })
          await db.financialReport.delete({ where: { id: r.id } })
          await db.auditLog.create({ data: { actor: "system", action: "REVIEW_EDIT", entityType: "FinancialReport", entityId: existing.id, details: `Merged mislabeled Yahoo ${r.periodLabel} (${co}) into ${q.label}: ${moved} values moved, ${vals.length - moved} duplicated; duplicate deleted.` } })
          mergedDeleted++
          log.push(`MERGE ${co} ${r.periodLabel} -> ${q.label} (${moved} moved)`)
        }
      } else {
        log.push(`WOULD ${existing ? "MERGE" : "RELABEL"} ${co} ${r.periodLabel} -> ${q.label}`)
      }
    }
  }
  console.log(JSON.stringify({ relabeled, mergedDeleted, flaggedJuneFY, applied: APPLY }, null, 1))
  for (const l of log.slice(0, 40)) console.log(" ", l)
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
