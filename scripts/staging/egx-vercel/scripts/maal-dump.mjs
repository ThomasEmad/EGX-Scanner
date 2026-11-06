// Dump MAAL FY2022 report values to catch remaining x1000 family rows vs AskBorsa truth
// (truth: GP 90.57M, OCF 51.05M, INV_CF -1.41M, FIN_CF 49.57M, net change 99.21M, assets 2.57B, equity 131M, NI -163K)
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const c = await db.company.findUnique({ where: { ticker: 'MAAL' }, select: { id: true } })
const reps = await db.financialReport.findMany({
  where: { companyId: c.id, deletedAt: null, fiscalYear: { in: [2021, 2022] } },
  select: { fiscalYear: true, periodLabel: true, periodType: true, sourceName: true, values: { select: { metricCode: true, normalizedValue: true, validationStatus: true, validationNotes: true } } },
  orderBy: [{ fiscalYear: 'asc' }, { periodLabel: 'asc' }],
})
for (const r of reps) {
  console.log(`\n# MAAL FY${r.fiscalYear} ${r.periodLabel} [${r.periodType}] ${r.sourceName}`)
  for (const v of r.values) {
    if (v.normalizedValue === null) continue
    const q = (v.validationNotes ?? '').startsWith('AUDIT_QUARANTINE') ? ' [Q]' : (v.validationNotes ?? '').startsWith('AUDIT_UNIT_FIX') ? ' [F]' : ''
    console.log(`    ${v.metricCode.padEnd(30)} = ${Number(v.normalizedValue).toLocaleString()} [${v.validationStatus}]${q}`)
  }
}
await db.$disconnect()
