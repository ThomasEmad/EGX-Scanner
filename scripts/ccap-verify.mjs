// Verify CCAP after the remediation: annual CMs (net_profit via NPP fallback,
// equity, eps, roe, p_e) vs AskBorsa ground truth, and confirm garbage is gone.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const c = await db.company.findUnique({ where: { ticker: 'CCAP' }, select: { id: true } })
const cms = await db.calculatedMetric.findMany({
  where: { companyId: c.id, code: { in: ['net_profit', 'total_equity', 'roe', 'eps', 'p_e', 'revenue', 'gross_margin', 'retained_earnings', 'inventory'] } },
  orderBy: [{ fiscalYear: 'asc' }, { statementType: 'asc' }],
})
for (const m of cms) {
  const v = m.value === null ? `${m.valueStatus}` : Number(m.value).toLocaleString()
  console.log(`${m.code.padEnd(18)} [${m.statementType.slice(0, 4)} ${m.periodType} ${m.fiscalYear}] = ${v}`)
}
await db.$disconnect()
