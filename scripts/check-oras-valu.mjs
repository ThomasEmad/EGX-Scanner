import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
for (const t of ['ORAS', 'VALU']) {
  const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true } })
  const rows = await db.calculatedMetric.findMany({
    where: { companyId: c.id, code: { in: ['p_e', 'p_b', 'roe', 'revenue', 'net_profit', 'market_cap'] }, valueStatus: 'OK', value: { not: null }, fiscalYear: { gte: 2024 } },
    orderBy: [{ fiscalYear: 'desc' }, { periodLabel: 'desc' }], take: 8,
    select: { code: true, value: true, periodLabel: true, periodType: true },
  })
  console.log(`--- ${t}`)
  for (const r of rows) console.log(`  ${r.code.padEnd(10)} [${r.periodType} ${r.periodLabel}] = ${Number(r.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
}
await db.$disconnect()
