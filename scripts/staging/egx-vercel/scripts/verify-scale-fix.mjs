// Post-fix verification: key metrics for the scale-family companies.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const TICKERS = ['UBEE', 'HDBK', 'NBKE', 'EXPA', 'GSSC', 'MAAL', 'VLMRA', 'CCAP', 'UPMS', 'ROTO']
const companies = await db.company.findMany({ where: { ticker: { in: TICKERS } }, select: { id: true, ticker: true, nameEn: true } })
for (const c of companies) {
  const metrics = await db.calculatedMetric.findMany({
    where: { companyId: c.id, code: { in: ['net_profit', 'roe', 'p_e', 'revenue', 'net_margin'] }, periodLabel: { in: ['FY 2024', 'FY 2025', 'FY 2023'] } },
    orderBy: [{ code: 'asc' }, { fiscalYear: 'desc' }],
    select: { code: true, value: true, valueStatus: true, periodLabel: true, fiscalYear: true },
  })
  console.log(`\n=== ${c.ticker} (${c.nameEn})`)
  const seen = new Set()
  for (const m of metrics) {
    const key = `${m.code}|${m.fiscalYear}`
    if (seen.has(key)) continue
    seen.add(key)
    console.log(`  ${m.code.padEnd(11)} FY${m.fiscalYear} = ${m.value === null ? 'null' : Number(m.value).toLocaleString()} (${m.valueStatus})`)
  }
}
await db.$disconnect()
