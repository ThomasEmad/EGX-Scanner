import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const up = await db.company.findUnique({ where: { ticker: 'UPMS' }, select: { id: true } })
const rows = await db.financialValue.findMany({
  where: { metricCode: { in: ['NET_PROFIT', 'GROSS_PROFIT'] }, report: { companyId: up.id, deletedAt: null } },
  select: { metricCode: true, normalizedValue: true, validationStatus: true, validationNotes: true, report: { select: { fiscalYear: true, periodLabel: true, sourceName: true } } },
})
for (const r of rows) console.log(`FY${r.report.fiscalYear} ${r.report.periodLabel} ${r.report.sourceName.slice(0, 24)} ${r.metricCode} = ${r.normalizedValue === null ? 'null' : Number(r.normalizedValue).toLocaleString()} [${r.validationStatus}] "${(r.validationNotes ?? '').slice(0, 60)}"`)
await db.$disconnect()
