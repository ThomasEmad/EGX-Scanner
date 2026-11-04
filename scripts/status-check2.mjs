// Check the ACTUAL validationStatus of annual NET_PROFIT/REVENUE values for failing companies.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const probes = [
  { ticker: 'GSSC', years: [2023, 2024, 2025] },
  { ticker: 'EXPA', years: [2024, 2025] },
  { ticker: 'MAAL', years: [2023, 2025] },
  { ticker: 'CCAP', years: [2022, 2024] },
  { ticker: 'HDBK', years: [2024, 2025] },
]
for (const p of probes) {
  const c = await db.company.findUnique({ where: { ticker: p.ticker }, select: { id: true } })
  const reps = await db.financialReport.findMany({
    where: { companyId: c.id, deletedAt: null, periodType: 'ANNUAL', fiscalYear: { in: p.years } },
    select: { fiscalYear: true, sourceName: true, values: { where: { metricCode: { in: ['NET_PROFIT', 'NET_PROFIT_PARENT', 'REVENUE'] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true, validationNotes: true } } },
    orderBy: [{ fiscalYear: 'asc' }],
  })
  console.log(`\n=== ${p.ticker}`)
  for (const r of reps) for (const v of r.values) {
    console.log(`  FY${r.fiscalYear} ${r.sourceName.slice(0, 30).padEnd(30)} ${v.metricCode.padEnd(18)} = ${v.normalizedValue === null ? 'null' : Number(v.normalizedValue).toLocaleString()} status=${v.validationStatus} notes="${(v.validationNotes ?? '').slice(0, 80)}"`)
  }
}
await db.$disconnect()
