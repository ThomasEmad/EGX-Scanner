// Import harvested AskBorsa annual summaries into the DB — fill MISSING annual
// years only (existing annuals for a year are never overwritten/duplicated).
// Values: plain EGP from the AskBorsa parser (unit=UNIT).
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'

const db = new PrismaClient()
const files = [
  'C:/Users/tomas/.local/share/opencode/tool-output/tool_182fced6a001OgJ76e8ZCHxHeU', // batch 1
  'C:/Users/tomas/.local/share/opencode/tool-output/tool_182ff8579001ra3BQzEsUq944C', // batch 2+3
]
const records = files.flatMap(f => JSON.parse(readFileSync(f, 'utf8')))

const LABEL_MAP = {
  'صافي الربح': ['NET_PROFIT', 'INCOME_STATEMENT'],
  'مجمل الربح': ['GROSS_PROFIT', 'INCOME_STATEMENT'],
  'إجمالي الأصول': ['TOTAL_ASSETS', 'BALANCE_SHEET'],
  'إجمالي المطلوبات': ['TOTAL_LIABILITIES', 'BALANCE_SHEET'],
  'حقوق المساهمين': ['TOTAL_EQUITY', 'BALANCE_SHEET'],
  'إجمالي المطلوبات وحقوق المساهمين': ['TOTAL_EQUITY_AND_LIABILITIES', 'BALANCE_SHEET'],
  'التدفق النقدي التشغيلي': ['OPERATING_CASH_FLOW', 'CASH_FLOW'],
  'التدفق النقدي الاستثماري': ['INVESTING_CASH_FLOW', 'CASH_FLOW'],
  'التدفق النقدي التمويلي': ['FINANCING_CASH_FLOW', 'CASH_FLOW'],
  'صافي التغير في النقد': ['NET_CHANGE_IN_CASH', 'CASH_FLOW'],
}
// fyStart month → fiscal year end month
const FY_END = { 'يناير': 11, 'فبراير': 0, 'مارس': 1, 'ابريل': 2, 'أبريل': 2, 'مايو': 3, 'يونيو': 4, 'يوليو': 5, 'اغسطس': 6, 'أغسطس': 6, 'سبتمبر': 7, 'اكتوبر': 8, 'أكتوبر': 8, 'نوفمبر': 9, 'ديسمبر': 10 }

const EXECUTE = process.argv.includes('--execute')
let created = 0, values = 0, skippedExisting = 0, noCompany = []
const perTicker = new Map()

for (const rec of records) {
  if (!rec.rows || !rec.cols) continue
  const company = await db.company.findUnique({ where: { ticker: rec.ticker }, select: { id: true } })
  if (!company) { noCompany.push(rec.ticker); continue }

  // existing annual years
  const existing = await db.financialReport.findMany({
    where: { companyId: company.id, deletedAt: null, periodType: 'ANNUAL' },
    select: { fiscalYear: true },
  })
  const existingYears = new Set(existing.map(r => r.fiscalYear))

  // matched FY PDF from filings (annual balance sheet)
  const fyPdf = (rec.filings || []).find(f => /الميزانية السنوية/.test(f.t))

  for (let ci = 0; ci < rec.cols.length; ci++) {
    const year = Number(rec.cols[ci])
    if (!isFinite(year) || year < 2000) continue
    if (existingYears.has(year)) { skippedExisting++; continue }
    // collect non-null values for this year
    const vals = []
    for (const [label, metricArr] of Object.entries(LABEL_MAP)) {
      const arr = rec.rows[label]
      const v = arr ? arr[ci] : undefined
      if (v === null || v === undefined || !isFinite(v)) continue
      vals.push({ metricCode: metricArr[0], statementType: metricArr[1], normalizedValue: v })
    }
    if (vals.length < 3) continue // too thin to be useful

    if (!EXECUTE) { created++; values += vals.length; continue }

    const endMonthIdx = FY_END[rec.fyStart] ?? 11
    const fyEnd = new Date(year, endMonthIdx + 1, 0) // last day of end month
    const report = await db.financialReport.create({
      data: {
        companyId: company.id,
        reportType: 'ANNUAL',
        periodType: 'ANNUAL',
        periodLabel: `FY ${year}`,
        fiscalYear: year,
        periodStart: new Date(fyEnd.getFullYear(), fyEnd.getMonth() - 11, 1),
        periodEnd: fyEnd,
        statementType: 'CONSOLIDATED',
        language: 'AR',
        sourceName: 'ASKBORA_SUMMARY',
        sourceUrl: fyPdf ? `https://askborsa.com${fyPdf.href}` : `https://askborsa.com/company/${rec.ticker}`,
        processingStatus: 'APPROVED',
        extractionMethod: 'API_IMPORT',
        parserVersion: 'askborsa-refresh-2026-10',
        notes: `Annual summary harvested from AskBorsa during 2026-10 data-quality refresh (worklist run). Values plain EGP.`,
        discoveredAt: new Date(),
      },
    })
    for (const v of vals) {
      await db.financialValue.create({
        data: {
          companyId: company.id,
          reportId: report.id,
          metricCode: v.metricCode,
          originalLabel: v.metricCode,
          value: v.normalizedValue,
          currency: 'EGP',
          unit: 'UNIT',
          normalizedValue: v.normalizedValue,
          statementType: v.statementType,
          extractionMethod: 'API_IMPORT',
          confidence: 0.85,
          validationStatus: 'VALID',
        },
      })
      values++
    }
    created++
    perTicker.set(rec.ticker, (perTicker.get(rec.ticker) ?? 0) + 1)
  }
}

console.log(JSON.stringify({ mode: EXECUTE ? 'EXECUTE' : 'DRY', reportsCreated: created, valuesCreated: values, yearsSkippedExisting: skippedExisting, noCompany: noCompany }, null, 2))
console.log('per ticker:', [...perTicker.entries()].map(([t, n]) => `${t}(${n})`).join(', '))
await db.$disconnect()
