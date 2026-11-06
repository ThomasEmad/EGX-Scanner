/* Apply the PROVABLE annual-mislabel fixes only: an ANNUAL report whose NET_PROFIT
   equals (±3%) an existing interim report of the same company+year is a duplicate
   copy of that interim — delete it when it carries only the NP value, otherwise
   relabel it to the interim's period. Everything else goes to the review file.
   Usage: node scripts/fix-duplicate-annuals.cjs        (dry run)
          APPLY=1 node scripts/fix-duplicate-annuals.cjs */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const APPLY = process.env.APPLY === "1"

;(async () => {
  const annuals = await db.financialReport.findMany({
    where: { periodType: "ANNUAL", fiscalYear: { gte: 2023 } },
    select: { id: true, companyId: true, fiscalYear: true, sourceName: true },
  })
  let deleted = 0
  let relabeled = 0
  for (const a of annuals) {
    const np = await db.financialValue.findFirst({ where: { reportId: a.id, metricCode: "NET_PROFIT" }, select: { normalizedValue: true } })
    if (!np || np.normalizedValue === null) continue
    const candidates = await db.financialValue.findMany({
      where: {
        metricCode: "NET_PROFIT",
        report: { companyId: a.companyId, fiscalYear: a.fiscalYear, periodType: { in: ["QUARTERLY", "SEMIANNUAL", "NINE_MONTH"] }, id: { not: a.id } },
      },
      select: { normalizedValue: true, report: { select: { id: true, periodType: true, periodLabel: true } } },
    })
    const match = candidates.find((i) => i.normalizedValue !== null && Math.abs(i.normalizedValue - np.normalizedValue) / Math.max(Math.abs(np.normalizedValue), 1) < 0.03)
    if (!match) continue
    const company = await db.company.findUnique({ where: { id: a.companyId }, select: { ticker: true } })
    const valueCount = await db.financialValue.count({ where: { reportId: a.id } })
    if (APPLY) {
      if (valueCount <= 1) {
        await db.financialValue.deleteMany({ where: { reportId: a.id } })
        await db.financialReport.delete({ where: { id: a.id } })
        await db.auditLog.create({ data: { actor: "system", action: "REVIEW_EDIT", entityType: "FinancialReport", entityId: a.id, details: `Deleted duplicate-ANNUAL report (${a.sourceName}) for ${company.ticker} FY${a.fiscalYear}: NP ${np.normalizedValue} identical to existing ${match.report.periodLabel}. Backup: dev.db.pre-thndr-import-20260930.bak` } })
        deleted++
        console.log(`DELETED ${company.ticker} FY${a.fiscalYear} (${a.sourceName}) == ${match.report.periodLabel}`)
      } else {
        // the interim report already exists (the annual IS a copy of it) — merge:
        // move any values the interim lacks from the mislabeled annual, then delete it
        try {
          await db.financialReport.update({ where: { id: a.id }, data: { periodType: match.report.periodType, periodLabel: match.report.periodLabel } })
          await db.auditLog.create({ data: { actor: "system", action: "REVIEW_EDIT", entityType: "FinancialReport", entityId: a.id, details: `Relabeled duplicate-ANNUAL report (${a.sourceName}) for ${company.ticker} FY${a.fiscalYear} -> ${match.report.periodLabel}: NP ${np.normalizedValue} identical to that interim; ${valueCount} values kept.` } })
          relabeled++
          console.log(`RELABEL ${company.ticker} FY${a.fiscalYear} (${a.sourceName}) -> ${match.report.periodLabel} (${valueCount} values kept)`)
        } catch (e) {
          if (e && e.code === "P2002") {
            const interimValues = await db.financialValue.findMany({ where: { reportId: match.report.id }, select: { metricCode: true, statementType: true } })
            const have = new Set(interimValues.map((v) => v.metricCode + ":" + v.statementType))
            const annualValues = await db.financialValue.findMany({ where: { reportId: a.id } })
            let moved = 0
            for (const v of annualValues) {
              if (have.has(v.metricCode + ":" + v.statementType)) continue
              await db.financialValue.update({ where: { id: v.id }, data: { reportId: match.report.id } })
              moved++
            }
            await db.financialValue.deleteMany({ where: { reportId: a.id } })
            await db.financialReport.delete({ where: { id: a.id } })
            await db.auditLog.create({ data: { actor: "system", action: "REVIEW_EDIT", entityType: "FinancialReport", entityId: match.report.id, details: `Merged duplicate-ANNUAL report (${a.sourceName}) for ${company.ticker} FY${a.fiscalYear} into ${match.report.periodLabel}: ${moved} values moved, rest duplicated; annual deleted.` } })
            relabeled++
            console.log(`MERGED ${company.ticker} FY${a.fiscalYear} (${a.sourceName}) -> ${match.report.periodLabel} (${moved} moved, ${valueCount - moved} dup)`)
          } else throw e
        }
      }
    } else {
      console.log(`WOULD ${valueCount <= 1 ? "DELETE" : "RELABEL"} ${company.ticker} FY${a.fiscalYear} (${a.sourceName}) == ${match.report.periodLabel} (${valueCount} values)`)
    }
  }
  console.log(JSON.stringify({ applied: APPLY, deleted, relabeled }))
  await db.$disconnect()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
