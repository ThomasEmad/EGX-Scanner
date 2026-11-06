// Find duplicate financial reports: same company + statementType + periodType
// + periodLabel (+fiscalYear). For each group, show sources & value counts.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const companies = await db.company.findMany({ select: { id: true, ticker: true } })
let dupGroups = 0
const out = []
for (const { id, ticker } of companies) {
  const reports = await db.financialReport.findMany({
    where: { companyId: id, deletedAt: null },
    include: { values: { select: { id: true, metricCode: true } } },
    orderBy: [{ fiscalYear: 'asc' }, { periodLabel: 'asc' }],
  })
  const groups = new Map()
  for (const r of reports) {
    const key = `${r.statementType}|${r.periodType}|${r.periodLabel}|${r.fiscalYear}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }
  for (const [key, rs] of groups) {
    if (rs.length < 2) continue
    dupGroups++
    out.push(`${ticker} ${key} => ${rs.map(r => `${r.sourceName}(${r.values.length}v,${r.processingStatus})`).join(' + ')}`)
  }
}
console.log(`duplicate groups: ${dupGroups}`)
console.log(out.slice(0, 60).join('\n'))
await db.$disconnect()
