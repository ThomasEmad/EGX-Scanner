// Currency-mismatch scan: REUTERS page extractions stored as EGP when the
// source reports USD (ORAS pattern). Check currency metadata + magnitude scan.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

// ORAS FY2025 report: what currency metadata do the values carry?
const oras = await db.company.findUnique({ where: { ticker: 'ORAS' }, select: { id: true } })
const rep = await db.financialReport.findFirst({
  where: { companyId: oras.id, deletedAt: null, periodType: 'ANNUAL' },
  orderBy: [{ fiscalYear: 'desc' }],
  select: { id: true, fiscalYear: true, sourceName: true, values: { select: { metricCode: true, normalizedValue: true, currency: true, unit: true, originalLabel: true, validationStatus: true } } },
})
console.log(`ORAS FY${rep.fiscalYear} src=${rep.sourceName}`)
for (const v of rep.values.slice(0, 12)) {
  console.log(`  ${v.metricCode} = ${v.normalizedValue === null ? 'null' : Number(v.normalizedValue).toLocaleString()} | currency=${v.currency} unit=${v.unit} | "${(v.originalLabel ?? '').slice(0, 45)}"`)
}

// How many values carry currency=USD but were normalized as EGP-scale? And how
// many USD-currency values exist at all (did normalization convert them)?
const curStats = await db.$queryRawUnsafe(`
  SELECT v.currency AS cur, COUNT(*) n, COUNT(v."normalizedValue") norm
  FROM FinancialValue v JOIN FinancialReport r ON r.id = v.reportId AND r."deletedAt" IS NULL
  WHERE v.currency IS NOT NULL AND v.currency NOT IN ('EGP')
  GROUP BY v.currency ORDER BY n DESC`)
console.log('\nnon-EGP currency metadata:', curStats.map(x => `${x.cur}=${Number(x.n)} (normalized:${Number(x.norm)})`).join(', '))

// Which companies have Reuters-page values whose currency says USD?
const usdByCompany = await db.$queryRawUnsafe(`
  SELECT c.ticker AS t, COUNT(*) n FROM FinancialValue v
  JOIN FinancialReport r ON r.id = v.reportId AND r."deletedAt" IS NULL
  JOIN Company c ON c.id = r.companyId
  WHERE v.currency = 'USD' GROUP BY c.ticker ORDER BY n DESC LIMIT 15`)
console.log('USD-currency values by company:', usdByCompany.map(x => `${x.t}=${Number(x.n)}`).join(', '))

// cross-check: ORAS equity from OTHER sources for the same FY
const orasRepAll = await db.financialReport.findMany({
  where: { companyId: oras.id, deletedAt: null, fiscalYear: 2025 },
  select: { id: true, periodLabel: true, statementType: true, sourceName: true, values: { where: { metricCode: 'TOTAL_EQUITY' }, select: { normalizedValue: true, currency: true, validationStatus: true, validationNotes: true } } },
})
console.log('\nORAS FY2025 TOTAL_EQUITY across all reports:')
for (const r of orasRepAll) for (const v of r.values) {
  const q = (v.validationNotes ?? '').startsWith('AUDIT_QUARANTINE') ? ' [Q]' : ''
  console.log(`  [${r.periodLabel} ${r.statementType}] ${r.sourceName.slice(0, 35)}: ${v.normalizedValue === null ? 'null' : Number(v.normalizedValue).toLocaleString()} cur=${v.currency}${q}`)
}
await db.$disconnect()
