// Dump HDBK 2021 reports + EXPA EXCEL_STATEMENTS (all years) fully.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const companies = await db.company.findMany({ where: { ticker: { in: ['HDBK', 'EXPA'] } }, select: { id: true, ticker: true } })
const byId = new Map(companies.map(c => [c.id, c.ticker]))
const reps = await db.financialReport.findMany({
  where: { companyId: { in: companies.map(c => c.id) }, deletedAt: null },
  select: { companyId: true, fiscalYear: true, periodLabel: true, periodType: true, sourceName: true, values: { select: { metricCode: true, normalizedValue: true, unit: true, originalLabel: true } } },
  orderBy: [{ companyId: 'asc' }, { fiscalYear: 'asc' }, { periodLabel: 'asc' }],
})
for (const r of reps) {
  const t = byId.get(r.companyId)
  if (t === 'HDBK' && r.fiscalYear !== 2021) continue
  if (t === 'EXPA' && r.sourceName !== 'EXCEL_STATEMENTS') continue
  console.log(`\n# ${t} FY${r.fiscalYear} ${r.periodLabel} [${r.periodType}] ${r.sourceName}`)
  for (const v of r.values) {
    if (v.normalizedValue === null) continue
    const q = (v.validationNotes ?? '').startsWith('AUDIT_QUARANTINE') ? ' [Q]' : ''
    console.log(`    ${v.metricCode.padEnd(30)} = ${Number(v.normalizedValue).toLocaleString()} unit=${v.unit} "${(v.originalLabel ?? '').slice(0, 42)}"${q}`)
  }
}
await db.$disconnect()
