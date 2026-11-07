import { PrismaClient } from '@prisma/client'

const FLAT_URL  = 'file:C:/Users/tomas/Downloads/Meza-backup/Meza/prisma/dev.db'
const NESTED_URL = 'file:C:/Users/tomas/Downloads/Meza-backup/Meza/prisma/prisma/dev.db'

const flat = new PrismaClient({ datasources: { db: { url: FLAT_URL } } })
const nested = new PrismaClient({ datasources: { db: { url: NESTED_URL } } })

const BATCH = 500
let newCompanies = 0, newReports = 0, newValues = 0, newPrices = 0, newCalcMetrics = 0
const companyIdMap = new Map()

async function main() {
  console.log('=== Starting merge: FLAT -> NESTED ===')

  // 1. Merge companies (match by ticker)
  console.log('\n--- Merging companies ---')
  const flatCompanies = await flat.company.findMany()
  const nestedCompanies = await nested.company.findMany()
  const nestedTickers = new Set(nestedCompanies.map(c => c.ticker))

  const newCompanyData = []
  for (const fc of flatCompanies) {
    if (nestedTickers.has(fc.ticker)) continue
    newCompanyData.push({
      ticker: fc.ticker, isin: fc.isin, nameEn: fc.nameEn, nameAr: fc.nameAr,
      sector: fc.sector, industry: fc.industry, listingStatus: fc.listingStatus,
      isActive: fc.isActive, isDemoData: fc.isDemoData, sharesOutstanding: fc.sharesOutstanding,
      website: fc.website, descriptionEn: fc.descriptionEn, descriptionAr: fc.descriptionAr,
      egxCategory: fc.egxCategory, sourceUrl: fc.sourceUrl, irUrl: fc.irUrl,
      lastVerifiedAt: fc.lastVerifiedAt, originalTicker: fc.originalTicker,
    })
  }

  for (let i = 0; i < newCompanyData.length; i += BATCH) {
    await nested.company.createMany({ data: newCompanyData.slice(i, i + BATCH) })
  }
  newCompanies = newCompanyData.length
  console.log(`  New companies: ${newCompanies}`)

  // Map company IDs
  const allNestedCompanies = await nested.company.findMany()
  for (const fc of flatCompanies) {
    if (companyIdMap.has(fc.id)) continue
    const match = allNestedCompanies.find(nc => nc.ticker === fc.ticker)
    if (match) companyIdMap.set(fc.id, match.id)
  }

  // 2. Merge reports
  console.log('\n--- Merging reports ---')
  const flatReports = await flat.financialReport.findMany()
  const nestedReports = await nested.financialReport.findMany()
  const nestedReportKeys = new Set(
    nestedReports.map(r => `${r.companyId}|${r.fiscalYear}|${r.periodType}|${r.periodLabel}|${r.statementType}`)
  )

  const newReportData = []
  for (const fr of flatReports) {
    const nestedCompanyId = companyIdMap.get(fr.companyId)
    if (!nestedCompanyId) continue
    const key = `${nestedCompanyId}|${fr.fiscalYear}|${fr.periodType}|${fr.periodLabel}|${fr.statementType}`
    if (nestedReportKeys.has(key)) continue
    newReportData.push({
      companyId: nestedCompanyId, reportType: fr.reportType, periodType: fr.periodType,
      statementType: fr.statementType, fiscalYear: fr.fiscalYear, periodLabel: fr.periodLabel,
      periodStart: fr.periodStart, periodEnd: fr.periodEnd, processingStatus: fr.processingStatus,
      extractionMethod: fr.extractionMethod, sourceName: fr.sourceName, sourceUrl: fr.sourceUrl,
      parserVersion: fr.parserVersion, version: fr.version,
    })
  }

  for (let i = 0; i < newReportData.length; i += BATCH) {
    await nested.financialReport.createMany({ data: newReportData.slice(i, i + BATCH) })
  }
  newReports = newReportData.length
  console.log(`  New reports: ${newReports}`)

  // Build report ID map: flat reportId -> nested reportId
  const flatReports2 = await flat.financialReport.findMany({ select: { id: true, companyId: true, fiscalYear: true, periodType: true, periodLabel: true, statementType: true } })
  const nestedReports2 = await nested.financialReport.findMany({ select: { id: true, companyId: true, fiscalYear: true, periodType: true, periodLabel: true, statementType: true } })
  const reportIdMap = new Map()
  for (const fr of flatReports2) {
    const nestedCompanyId = companyIdMap.get(fr.companyId)
    if (!nestedCompanyId) continue
    const key = `${nestedCompanyId}|${fr.fiscalYear}|${fr.periodType}|${fr.periodLabel}|${fr.statementType}`
    const match = nestedReports2.find(nr => `${nr.companyId}|${nr.fiscalYear}|${nr.periodType}|${nr.periodLabel}|${nr.statementType}` === key)
    if (match) reportIdMap.set(fr.id, { nestedId: match.id, nestedCompanyId })
  }

  // 3. Merge values
  console.log('\n--- Merging financial values ---')
  const flatValues = await flat.financialValue.findMany()
  const nestedValues = await nested.financialValue.findMany()
  const nestedValueKeys = new Set(
    nestedValues.map(v => `${v.reportId}|${v.metricCode}|${v.subPeriod ?? 'NULL'}`)
  )

  const newValueData = []
  for (const fv of flatValues) {
    const reportMap = reportIdMap.get(fv.reportId)
    if (!reportMap) continue
    const key = `${reportMap.nestedId}|${fv.metricCode}|${fv.subPeriod ?? 'NULL'}`
    if (nestedValueKeys.has(key)) continue
    newValueData.push({
      reportId: reportMap.nestedId, companyId: reportMap.nestedCompanyId, metricCode: fv.metricCode,
      normalizedValue: fv.normalizedValue, value: fv.value, unit: fv.unit, currency: fv.currency,
      statementType: fv.statementType, subPeriod: fv.subPeriod, sourceName: fv.sourceName,
      sourceUrl: fv.sourceUrl, extractionMethod: fv.extractionMethod, parserVersion: fv.parserVersion,
      confidenceScore: fv.confidenceScore, validationStatus: fv.validationStatus, valueNotes: fv.valueNotes,
      originalLabel: fv.originalLabel ?? '',
    })
  }

  for (let i = 0; i < newValueData.length; i += BATCH) {
    await nested.financialValue.createMany({ data: newValueData.slice(i, i + BATCH) })
  }
  newValues = newValueData.length
  console.log(`  New values: ${newValues}`)

  // 4. Merge market prices
  console.log('\n--- Merging market prices ---')
  const flatPrices = await flat.marketPrice.findMany()
  const nestedPrices = await nested.marketPrice.findMany()
  const nestedPriceKeys = new Set(
    nestedPrices.map(p => `${p.companyId}|${p.asOf.getTime()}`)
  )

  const newPriceData = []
  for (const fp of flatPrices) {
    const nestedCompanyId = companyIdMap.get(fp.companyId)
    if (!nestedCompanyId) continue
    const key = `${nestedCompanyId}|${fp.asOf.getTime()}`
    if (nestedPriceKeys.has(key)) continue
    newPriceData.push({
      companyId: nestedCompanyId, asOf: fp.asOf, price: fp.price, currency: fp.currency,
      sourceName: fp.sourceName, isDemoData: fp.isDemoData, notes: fp.notes,
    })
  }

  for (let i = 0; i < newPriceData.length; i += BATCH) {
    await nested.marketPrice.createMany({ data: newPriceData.slice(i, i + BATCH) })
  }
  newPrices = newPriceData.length
  console.log(`  New prices: ${newPrices}`)

  // 5. Merge calculated metrics
  console.log('\n--- Merging calculated metrics ---')
  const flatCalc = await flat.calculatedMetric.findMany()
  const nestedCalc = await nested.calculatedMetric.findMany()
  const nestedCalcKeys = new Set(
    nestedCalc.map(c => `${c.companyId}|${c.code}|${c.periodType}:${c.fiscalYear}:${c.periodLabel ?? ''}|${c.statementType}`)
  )

  const newCalcData = []
  for (const fc of flatCalc) {
    const nestedCompanyId = companyIdMap.get(fc.companyId)
    if (!nestedCompanyId) continue
    const periodKey = `${fc.periodType}:${fc.fiscalYear}:${fc.periodLabel ?? ''}`
    const key = `${nestedCompanyId}|${fc.code}|${periodKey}|${fc.statementType}`
    if (nestedCalcKeys.has(key)) continue
    newCalcData.push({
      companyId: nestedCompanyId, code: fc.code, periodKey,
      fiscalYear: fc.fiscalYear, periodType: fc.periodType, periodLabel: fc.periodLabel,
      statementType: fc.statementType, value: fc.value, valueStatus: fc.valueStatus,
      formulaVersion: fc.formulaVersion, sourcePeriods: fc.sourcePeriods, calculatedAt: fc.calculatedAt,
    })
  }

  for (let i = 0; i < newCalcData.length; i += BATCH) {
    await nested.calculatedMetric.createMany({ data: newCalcData.slice(i, i + BATCH) })
  }
  newCalcMetrics = newCalcData.length
  console.log(`  New calculated metrics: ${newCalcMetrics}`)

  // Final counts
  console.log('\n=== FINAL NESTED COUNTS ===')
  const c = await nested.company.count()
  const r = await nested.financialReport.count()
  const v = await nested.financialValue.count()
  const p = await nested.marketPrice.count()
  const cm = await nested.calculatedMetric.count()
  console.log(`Companies: ${c} | Reports: ${r} | Values: ${v} | Prices: ${p} | CalcMetrics: ${cm}`)

  await flat['$disconnect']()
  await nested['$disconnect']()
  console.log('\n=== Merge complete ===')
}

main().catch(e => { console.error('Merge failed:', e); process.exit(1) })