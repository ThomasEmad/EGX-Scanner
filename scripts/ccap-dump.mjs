// Full dump of CCAP reports (all values) to plan the CCAP remediation vs AskBorsa ground truth.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const c = await db.company.findUnique({ where: { ticker: 'CCAP' }, select: { id: true } })
const reps = await db.financialReport.findMany({
  where: { companyId: c.id, deletedAt: null },
  select: { fiscalYear: true, periodLabel: true, periodType: true, sourceName: true, statementType: true, values: { select: { metricCode: true, normalizedValue: true, validationStatus: true, validationNotes: true, correctedBy: true } } },
  orderBy: [{ fiscalYear: 'asc' }, { periodLabel: 'asc' }],
})
for (const r of reps) {
  console.log(`\n# CCAP FY${r.fiscalYear} ${r.periodLabel} [${r.periodType}] ${r.sourceName} [${r.statementType}]`)
  for (const v of r.values) {
    if (v.normalizedValue === null) continue
    const q = (v.validationNotes ?? '').startsWith('AUDIT_QUARANTINE') ? ' [Q]' : (v.correctedBy ? ` [${v.correctedBy}]` : '')
    console.log(`    ${v.metricCode.padEnd(30)} = ${Number(v.normalizedValue).toLocaleString()} [${v.validationStatus}]${q}`)
  }
}
await db.$disconnect()
