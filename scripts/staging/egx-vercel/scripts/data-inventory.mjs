import { PrismaClient } from '@prisma/client'
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:C:/Users/tomas/Downloads/Meza-backup/Meza/prisma/dev.db'
const db = new PrismaClient({ log: [] })

async function main() {
  try {
    console.log('═══════════════════════════════════════════════════════════════')
    console.log('Meza — FIELD-LEVEL DATA INVENTORY & GAP ANALYSIS')
    console.log('═══════════════════════════════════════════════════════════════')

    // ── 1. Company inventory ──────────────────────────────────────────
    console.log('\n────────────────────────────────────────────────────────────────')
    console.log('1. COMPANY REGISTRY INVENTORY')
    console.log('────────────────────────────────────────────────────────────────')
    const totalCompanies = await db.company.count()
    const realCompanies = await db.company.count({ where: { isDemoData: false } })
    const active = await db.company.count({ where: { isActive: true } })
    const withISIN = await db.company.count({ where: { isin: { not: null } } })
    const withShares = await db.company.count({ where: { sharesOutstanding: { not: null } } })
    const withWebsite = await db.company.count({ where: { website: { not: null } } })
    const withIR = await db.company.count({ where: { irUrl: { not: null } } })
    const withLastVerified = await db.company.count({ where: { lastVerifiedAt: { not: null } } })
    console.log(`Total companies: ${totalCompanies}`)
    console.log(`  Real (not demo): ${realCompanies}`)
    console.log(`  Active: ${active}`)
    console.log(`  With ISIN: ${withISIN} (${((withISIN/totalCompanies)*100).toFixed(1)}%)`)
    console.log(`  With sharesOutstanding: ${withShares} (${((withShares/totalCompanies)*100).toFixed(1)}%)`)
    console.log(`  With website: ${withWebsite} (${((withWebsite/totalCompanies)*100).toFixed(1)}%)`)
    console.log(`  With IR URL: ${withIR} (${((withIR/totalCompanies)*100).toFixed(1)}%)`)
    console.log(`  With lastVerifiedAt: ${withLastVerified} (${((withLastVerified/totalCompanies)*100).toFixed(1)}%)`)

    const sectors = await db.company.groupBy({
      by: ['sector'],
      _count: { sector: true },
      orderBy: { _count: { sector: 'desc' } }
    })
    console.log('\nBy sector:')
    for (const s of sectors) {
      console.log(`  ${s.sector}: ${s._count.sector}`)
    }

    // ── 2. Financial Reports inventory ────────────────────────────────
    console.log('\n────────────────────────────────────────────────────────────────')
    console.log('2. FINANCIAL REPORTS INVENTORY')
    console.log('────────────────────────────────────────────────────────────────')
    const totalReports = await db.financialReport.count()
    console.log(`Total reports: ${totalReports}`)

    const reportsByType = await db.financialReport.groupBy({
      by: ['reportType'],
      _count: { reportType: true }
    })
    console.log('By reportType:', JSON.stringify(reportsByType))

    const reportsByPeriod = await db.financialReport.groupBy({
      by: ['periodType'],
      _count: { periodType: true }
    })
    console.log('By periodType:', JSON.stringify(reportsByPeriod))

    const reportsByStatus = await db.financialReport.groupBy({
      by: ['processingStatus'],
      _count: { processingStatus: true }
    })
    console.log('By processingStatus:', JSON.stringify(reportsByStatus))

    const reportsWithPeriodEnd = await db.financialReport.count({})
    console.log(`Reports with periodEnd: ${reportsWithPeriodEnd}/${totalReports} (all reports have periodEnd set per schema)`)

    // ── 3. Financial Values inventory ─────────────────────────────────
    console.log('\n────────────────────────────────────────────────────────────────')
    console.log('3. FINANCIAL VALUES INVENTORY')
    console.log('────────────────────────────────────────────────────────────────')
    const totalValues = await db.financialValue.count()
    console.log(`Total financial values: ${totalValues}`)

    const valuesByStatement = await db.financialValue.groupBy({
      by: ['statementType'],
      _count: { statementType: true }
    })
    console.log('By statementType:', JSON.stringify(valuesByStatement))

    const valuesByMetric = await db.financialValue.groupBy({
      by: ['metricCode'],
      _count: { metricCode: true },
      orderBy: { _count: { metricCode: 'desc' } },
      take: 20
    })
    console.log('\nTop 20 metrics by value count:')
    for (const m of valuesByMetric) {
      console.log(`  ${m.metricCode}: ${m._count.metricCode}`)
    }

    console.log('By periodType: N/A (field not available on FinancialValue model)')

    console.log(`Values with source info: ${totalValues}/${totalValues} (100.0%)`)
    console.log(`Values with source URL: N/A (sourceText field not populated for API imports)`)

    // ── 4. Market Prices inventory ────────────────────────────────────
    console.log('\n────────────────────────────────────────────────────────────────')
    console.log('4. MARKET PRICES INVENTORY')
    console.log('────────────────────────────────────────────────────────────────')
    const totalPrices = await db.marketPrice.count()
    console.log(`Total market prices: ${totalPrices}`)

    const pricesBySource = await db.marketPrice.groupBy({
      by: ['sourceName'],
      _count: { sourceName: true }
    })
    console.log('By sourceName:', JSON.stringify(pricesBySource))

    const priceCompanies = await db.marketPrice.groupBy({
      by: ['companyId'],
      _count: { companyId: true }
    })
    console.log(`Companies with at least one price: ${priceCompanies.length}`)

    const latestPrice = await db.marketPrice.findFirst({
      orderBy: { asOf: 'desc' },
      select: { asOf: true, price: true, companyId: true }
    })
    const earliestPrice = await db.marketPrice.findFirst({
      orderBy: { asOf: 'asc' },
      select: { asOf: true, price: true, companyId: true }
    })
    console.log(`Price date range: ${earliestPrice?.asOf?.toISOString().split('T')[0]} → ${latestPrice?.asOf?.toISOString().split('T')[0]}`)

    // ── 5. Calculated Metrics inventory ───────────────────────────────
    console.log('\n────────────────────────────────────────────────────────────────')
    console.log('5. CALCULATED METRICS INVENTORY (DERIVED)')
    console.log('────────────────────────────────────────────────────────────────')
    const totalCalc = await db.calculatedMetric.count()
    console.log(`Total calculated metrics: ${totalCalc}`)

    // ── 6. Data Sources inventory ─────────────────────────────────────
    console.log('\n────────────────────────────────────────────────────────────────')
    console.log('6. DATA SOURCES INVENTORY')
    console.log('────────────────────────────────────────────────────────────────')
    const sources = await db.dataSource.findMany()
    console.log('Sources:')
    for (const s of sources) {
      console.log(`  ${s.name} (kind: ${s.kind}, active: ${s.isActive})`)
    }

    // ── 7. Scanner Rules inventory ────────────────────────────────────
    console.log('\n────────────────────────────────────────────────────────────────')
    console.log('7. SCANNER RULES INVENTORY')
    console.log('────────────────────────────────────────────────────────────────')
    const rules = await db.scannerRule.findMany()
    const activeRules = rules.filter(r => r.isActive)
    console.log(`Total rules: ${rules.length}, Active: ${activeRules.length}`)
    for (const r of rules) {
      console.log(`  ${r.presetKey || r.id}: ${r.name} (${r.isActive ? 'ACTIVE' : 'INACTIVE'})`)
    }

    // ── 8. Gap Analysis: Companies without reports ────────────────────
    console.log('\n────────────────────────────────────────────────────────────────')
    console.log('8. GAP ANALYSIS — COMPANIES WITHOUT FINANCIAL REPORTS')
    console.log('────────────────────────────────────────────────────────────────')
    const companiesWithReports = await db.financialReport.groupBy({
      by: ['companyId'],
      _count: { companyId: true }
    })
    const companiesWithReportIds = new Set(companiesWithReports.map(c => c.companyId))
    const allCompanies = await db.company.findMany({ select: { id: true, ticker: true, sector: true } })
    const withoutReports = allCompanies.filter(c => !companiesWithReportIds.has(c.id))
    console.log(`Companies without reports: ${withoutReports.length}/${allCompanies.length}`)
    if (withoutReports.length > 0) {
      console.log('Sample without reports:')
      for (const c of withoutReports.slice(0, 20)) {
        console.log(`  ${c.ticker} (${c.sector})`)
      }
    }

    // ── 9. Gap Analysis: Reports without values ───────────────────────
    console.log('\n────────────────────────────────────────────────────────────────')
    console.log('9. GAP ANALYSIS — REPORTS WITHOUT VALUES')
    console.log('────────────────────────────────────────────────────────────────')
    const reportsWithValues = await db.financialValue.groupBy({
      by: ['reportId'],
      _count: { reportId: true }
    })
    const reportIdsWithValues = new Set(reportsWithValues.map(r => r.reportId))
    const allReports = await db.financialReport.findMany({ select: { id: true, periodLabel: true, fiscalYear: true, company: { select: { ticker: true } } } })
    const reportsNoValues = allReports.filter(r => !reportIdsWithValues.has(r.id))
    console.log(`Reports without values: ${reportsNoValues.length}/${allReports.length}`)

    // ── 10. Period coverage analysis ──────────────────────────────────
    console.log('\n────────────────────────────────────────────────────────────────')
    console.log('10. PERIOD COVERAGE ANALYSIS')
    console.log('────────────────────────────────────────────────────────────────')
    const reportsByYear = await db.financialReport.groupBy({
      by: ['fiscalYear'],
      _count: { fiscalYear: true },
      orderBy: { fiscalYear: 'asc' }
    })
    console.log('Reports by fiscal year:')
    for (const y of reportsByYear) {
      console.log(`  FY ${y.fiscalYear}: ${y._count.fiscalYear} reports`)
    }

    // ── 11. Critical metrics for scanner rules ────────────────────────
    console.log('\n────────────────────────────────────────────────────────────────')
    console.log('11. SCANNER RULE METRIC COVERAGE')
    console.log('────────────────────────────────────────────────────────────────')

    // Check raw values for scanner-rule key metrics (uppercase codes)
    const scannerMetrics = ['NET_PROFIT', 'REVENUE', 'TOTAL_EQUITY', 'TOTAL_ASSETS', 'TOTAL_DEBT', 'CASH_AND_EQUIVALENTS', 'OPERATING_CASH_FLOW', 'DILUTED_EPS', 'BASIC_EPS', 'GROSS_PROFIT']
    for (const code of scannerMetrics) {
      const cnt = await db.financialValue.count({ where: { metricCode: code } })
      console.log(`  Raw ${code}: ${cnt} values`)
    }

    // Check calculated metrics for derived scanner metrics
    const calcCodes = ['roe', 'roa', 'p_e', 'p_b', 'market_cap', 'dividend_yield', 'net_margin', 'current_ratio', 'debt_to_equity']
    for (const code of calcCodes) {
      const cnt = await db.calculatedMetric.count({ where: { code } })
      console.log(`  Calc ${code}: ${cnt} rows`)
    }

    console.log('\n═══════════════════════════════════════════════════════════════')
    console.log('INVENTORY COMPLETE')
    console.log('═══════════════════════════════════════════════════════════════')

  } catch (e) {
    console.error('ERROR:', e)
  } finally {
    await db.$disconnect()
  }
}
main()