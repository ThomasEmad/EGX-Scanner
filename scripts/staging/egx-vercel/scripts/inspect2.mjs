import { PrismaClient } from '@prisma/client'
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:C:/Users/tomas/Downloads/Meza-backup/Meza/prisma/dev.db'
const db = new PrismaClient({ log: [] })
async function main() {
  try {
    console.log('=== COMPANIES ===')
    const totalCompanies = await db.company.count()
    const demoCompanies = await db.company.count({ where: { isDemoData: true } })
    const realCompanies = await db.company.count({ where: { isDemoData: false } })
    const active = await db.company.count({ where: { isActive: true } })
    console.log('total:', totalCompanies, 'demo:', demoCompanies, 'real:', realCompanies, 'active:', active)
    const sectors = await db.company.groupBy({ by: ['sector'], _count: { sector: true }, orderBy: { _count: { sector: 'desc' } } })
    console.log('sectors:', JSON.stringify(sectors))

    console.log('\n=== METRIC DEFINITIONS ===')
    const totalMetrics = await db.metricDefinition.count()
    const inputMetrics = await db.metricDefinition.count({ where: { calcRole: 'INPUT' } })
    const calcMetrics = await db.metricDefinition.count({ where: { calcRole: 'CALCULATED' } })
    console.log('total:', totalMetrics, 'input:', inputMetrics, 'calculated:', calcMetrics)

    console.log('\n=== FINANCIAL REPORTS ===')
    const totalReports = await db.financialReport.count()
    console.log('total reports:', totalReports)

    console.log('\n=== FINANCIAL VALUES ===')
    const totalValues = await db.financialValue.count()
    console.log('total values:', totalValues)

    console.log('\n=== CALCULATED METRICS ===')
    const totalCalc = await db.calculatedMetric.count()
    console.log('total calc:', totalCalc)

    console.log('\n=== MARKET PRICES ===')
    const totalPrices = await db.marketPrice.count()
    console.log('total prices:', totalPrices)

    console.log('\n=== DATA SOURCES ===')
    const sources = await db.dataSource.findMany()
    console.log('sources:', JSON.stringify(sources.map(s => ({ name: s.name, kind: s.kind }))))

    console.log('\n=== SCANNER RULES ===')
    const rules = await db.scannerRule.count()
    const activeRules = await db.scannerRule.count({ where: { isActive: true } })
    console.log('rules:', rules, 'active:', activeRules)

    console.log('\n=== SAMPLE COMPANIES ===')
    const cos = await db.company.findMany({ take: 15, orderBy: { ticker: 'asc' } })
    console.table(cos.map(c => ({ ticker: c.ticker, nameEn: c.nameEn, sector: c.sector, isin: c.isin })))

  } catch (e) { console.error('ERROR:', e) } finally { await db['$disconnect']() }
}
main()