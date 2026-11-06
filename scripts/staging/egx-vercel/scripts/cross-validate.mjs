// Cross-source validation: AskBorsa summary vs DB annual values for the same
// (ticker, fiscalYear, metric). Reports mismatches > 0.5% — each is either a
// DB extraction error or an AskBorsa rounding/scale artifact.
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'

const db = new PrismaClient()
const files = [
  'C:/Users/tomas/.local/share/opencode/tool-output/tool_182fced6a001OgJ76e8ZCHxHeU',
  'C:/Users/tomas/.local/share/opencode/tool-output/tool_182ff8579001ra3BQzEsUq944C',
]
const records = files.flatMap(f => JSON.parse(readFileSync(f, 'utf8')))

const LABEL_MAP = {
  'صافي الربح': 'NET_PROFIT',
  'مجمل الربح': 'GROSS_PROFIT',
  'إجمالي الأصول': 'TOTAL_ASSETS',
  'إجمالي المطلوبات': 'TOTAL_LIABILITIES',
  'حقوق المساهمين': 'TOTAL_EQUITY',
  'التدفق النقدي التشغيلي': 'OPERATING_CASH_FLOW',
  'التدفق النقدي الاستثماري': 'INVESTING_CASH_FLOW',
  'التدفق النقدي التمويلي': 'FINANCING_CASH_FLOW',
  'صافي التغير في النقد': 'NET_CHANGE_IN_CASH',
}

const mismatches = []
let checked = 0
for (const rec of records) {
  if (!rec.rows || !rec.cols) continue
  const company = await db.company.findUnique({ where: { ticker: rec.ticker }, select: { id: true } })
  if (!company) continue
  for (let ci = 0; ci < rec.cols.length; ci++) {
    const year = Number(rec.cols[ci])
    if (!isFinite(year) || year < 2015) continue
    const reports = await db.financialReport.findMany({
      where: { companyId: company.id, deletedAt: null, periodType: 'ANNUAL', fiscalYear: year },
      include: { values: { where: { validationStatus: { not: 'FAILED' } } } },
    })
    if (!reports.length) continue
    // aggregate DB values per metric (max overlap report wins; value identical across reports expected)
    const dbVals = new Map()
    for (const r of reports) for (const v of r.values) {
      if (v.normalizedValue === null) continue
      if (!dbVals.has(v.metricCode)) dbVals.set(v.metricCode, v.normalizedValue)
    }
    for (const [label, code] of Object.entries(LABEL_MAP)) {
      const askVal = rec.rows[label]?.[ci]
      if (askVal === null || askVal === undefined || !isFinite(askVal)) continue
      const dbVal = dbVals.get(code)
      if (dbVal === undefined) continue
      checked++
      const rel = Math.abs(askVal - dbVal) / Math.max(Math.abs(dbVal), 1)
      if (rel > 0.005) {
        mismatches.push({ ticker: rec.ticker, year, code, ask: askVal, db: dbVal, relPct: +(rel * 100).toFixed(2) })
      }
    }
  }
}
console.log(JSON.stringify({ checked, mismatchCount: mismatches.length }, null, 2))
const byT = new Map()
for (const m of mismatches) {
  if (!byT.has(m.ticker)) byT.set(m.ticker, [])
  byT.get(m.ticker).push(m)
}
for (const [t, ms] of [...byT.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 25)) {
  console.log(`\n${t} (${ms.length} mismatches):`)
  for (const m of ms.slice(0, 8)) console.log(`  FY${m.year} ${m.code}: db=${m.db.toPrecision(8)} ask=${m.ask.toPrecision(8)} (${m.relPct}%)`)
}
await db.$disconnect()
