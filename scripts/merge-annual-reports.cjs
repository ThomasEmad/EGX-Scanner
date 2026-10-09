/* MERGE ANNUAL REPORTS: for each (company, fiscalYear), if there are multiple
   ANNUAL reports from different sources, consolidate all values into the
   RICHEST report (most metricCodes) and delete the thin ones. This fills
   metric gaps without any new data — just better organization.
   Usage: node scripts/merge-annual-reports.cjs           (dry run)
          APPLY=1 node scripts/merge-annual-reports.cjs   */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const APPLY = process.env.APPLY === "1"

;(async () => {
  // Group all ANNUAL reports by (companyId, fiscalYear)
  const allAnnual = await db.financialReport.findMany({
    where: { periodType: "ANNUAL", fiscalYear: { gte: 2020 } },
    select: { id: true, companyId: true, fiscalYear: true, sourceName: true, statementType: true, processingStatus: true },
    orderBy: { fiscalYear: "desc" },
  })

  const groups = new Map()
  for (const r of allAnnual) {
    const key = `${r.companyId}|${r.fiscalYear}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }

  let merged = 0, valuesMoved = 0, valuesDropped = 0, reportsDeleted = 0
  const log = []

  for (const [key, group] of groups) {
    if (group.length < 2) continue
    const company = await db.company.findUnique({ where: { id: group[0].companyId }, select: { ticker: true } })
    if (!company) continue

    // Count metricCodes per report
    const enriched = []
    for (const r of group) {
      const vals = await db.financialValue.findMany({ where: { reportId: r.id }, select: { id: true, metricCode: true, normalizedValue: true, value: true, currency: true, unit: true, statementType: true, subPeriod: true } })
      enriched.push({ report: r, vals, count: vals.length })
    }
    enriched.sort((a, b) => b.count - a.count)
    const richest = enriched[0]
    const thinReports = enriched.slice(1)

    // Check if merging would actually add value (thin report has metrics missing from richest)
    const richCodes = new Set(richest.vals.map(v => v.metricCode))
    const newMetrics = new Set()
    for (const thin of thinReports) {
      for (const v of thin.vals) {
        if (!richCodes.has(v.metricCode)) newMetrics.add(v.metricCode)
      }
    }
    if (newMetrics.size === 0) continue // merging adds nothing

    if (APPLY) {
      const targetId = richest.report.id
      for (const thin of thinReports) {
        for (const v of thin.vals) {
          if (richCodes.has(v.metricCode)) { valuesDropped++; continue }
          try {
            await db.financialValue.update({ where: { id: v.id }, data: { reportId: targetId } })
            richCodes.add(v.metricCode)
            valuesMoved++
          } catch (e) { valuesDropped++ }
        }
        const remaining = await db.financialValue.count({ where: { reportId: thin.report.id } })
        if (remaining === 0) {
          await db.financialReport.delete({ where: { id: thin.report.id } })
          reportsDeleted++
        }
      }
      await db.auditLog.create({ data: { actor: "system", action: "REVIEW_EDIT", entityType: "FinancialReport", entityId: targetId, details: `Merged ${thinReports.length} thin annual reports into richest (${richest.report.sourceName}) for ${company.ticker} FY${richest.report.fiscalYear || group[0].fiscalYear}: ${valuesMoved} values moved, ${valuesDropped} duplicates dropped.` } })
    }
    merged++
    log.push(`${company.ticker} FY${group[0].fiscalYear}: ${group.length} reports, richest=${richest.count} values, new metrics from merge=${newMetrics.size}`)
  }

  console.log(JSON.stringify({ applied: APPLY, groupsMerged: merged, valuesMoved, valuesDropped, reportsDeleted }, null, 1))
  for (const l of log.slice(0, 50)) console.log(" ", l)
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
