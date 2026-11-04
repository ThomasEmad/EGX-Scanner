// Ground-truth checks for the suspected catastrophic ranking inputs:
// COMI/ETEL/TMGH market cap & P/E rows, MFPC revenue vs NI, latest-period mixing.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function show(ticker, codes) {
  const c = await db.company.findUnique({ where: { ticker }, select: { id: true, sharesOutstanding: true } })
  if (!c) return console.log(ticker, 'NOT FOUND')
  const rows = await db.calculatedMetric.findMany({
    where: { companyId: c.id, code: { in: codes }, fiscalYear: { gte: 2024 } },
    orderBy: [{ fiscalYear: 'desc' }, { periodLabel: 'desc' }],
    take: 14,
    select: { code: true, value: true, valueStatus: true, periodType: true, periodLabel: true, fiscalYear: true },
  })
  console.log(`\n=== ${ticker} (sharesOutstanding field: ${c.sharesOutstanding ?? 'null'}) ===`)
  for (const r of rows) console.log(`  ${r.code} [${r.periodType} ${r.periodLabel} ${r.fiscalYear}] = ${r.value === null ? 'null' : Number(r.value).toLocaleString(undefined, { maximumFractionDigits: 3 })} (${r.valueStatus})`)
}

await show('COMI', ['market_cap', 'p_e', 'eps', 'net_margin', 'roe', 'shares_outstanding'])
await show('ETEL', ['market_cap', 'p_e', 'eps', 'roe'])
await show('TMGH', ['market_cap', 'p_e', 'roe'])
await show('MFPC', ['net_margin', 'revenue', 'net_profit', 'roe'])

// what market prices exist for COMI?
const comi = await db.company.findUnique({ where: { ticker: 'COMI' }, select: { id: true } })
const prices = await db.marketPrice.findMany({ where: { companyId: comi.id }, orderBy: { date: 'desc' }, take: 4, select: { date: true, close: true } })
console.log('\nCOMI recent prices:', prices.map(p => `${p.date.toISOString().slice(0, 10)}=${p.close}`).join(', '))

// market price table stats
const priceCount = await db.marketPrice.count()
const priceCompanies = await db.$queryRawUnsafe(`SELECT COUNT(DISTINCT "companyId") as n FROM MarketPrice`)
console.log('market prices:', priceCount, 'companies with prices:', Number(priceCompanies[0].n))
await db.$disconnect()
