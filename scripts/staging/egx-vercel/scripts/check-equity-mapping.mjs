// For high-P/B names: inspect the equity-related lines in their latest annual
// report — is TOTAL_EQUITY mis-mapped (e.g., minority slice instead of total)?
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

for (const ticker of ['ORAS', 'MOIL', 'TYCN', 'VLMRA', 'COMI', 'ETEL']) {
  const c = await db.company.findUnique({ where: { ticker }, select: { id: true, sharesOutstanding: true } })
  if (!c) continue
  const rep = await db.financialReport.findFirst({
    where: { companyId: c.id, deletedAt: null, periodType: 'ANNUAL' },
    orderBy: [{ fiscalYear: 'desc' }],
    select: { fiscalYear: true, sourceName: true, values: { where: { metricCode: { in: ['TOTAL_EQUITY_AND_LIABILITIES', 'TOTAL_EQUITY', 'EQUITY_PARENT', 'NON_CONTROLLING_INTERESTS', 'TOTAL_LIABILITIES'] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true, validationNotes: true } } },
  })
  if (!rep) { console.log(`${ticker}: no annual report`); continue }
  console.log(`\n=== ${ticker} FY${rep.fiscalYear} src=${(rep.sourceName ?? '').slice(0, 45)}`)
  for (const v of rep.values) {
    const q = (v.validationNotes ?? '').startsWith('AUDIT_QUARANTINE') ? ' [QUARANTINED]' : ''
    console.log(`  ${v.metricCode} = ${v.normalizedValue === null ? 'null' : Number(v.normalizedValue).toLocaleString()} (${v.validationStatus})${q}`)
  }
}
await db.$disconnect()
