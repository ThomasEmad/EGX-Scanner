// Batch ISIN scan: validates every company ISIN with the corrected ISO 6166 Luhn
// and lists duplicates. Also samples COMI quarterly cash-flow rows to ground-truth
// the CASH_FLOW_SUM criticals from the first audit run.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

function isValidISIN(isin) {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return false
  let digits = ''
  for (const ch of isin.slice(0, 11)) {
    if (/[A-Z]/.test(ch)) digits += (ch.charCodeAt(0) - 55).toString()
    else digits += ch
  }
  let sum = 0, mult = 2
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10) * mult
    if (d > 9) d -= 9
    sum += d
    mult = mult === 2 ? 1 : 2
  }
  return (10 - (sum % 10)) % 10 === parseInt(isin.slice(11), 10)
}

const companies = await db.company.findMany({ select: { ticker: true, isin: true, nameEn: true }, orderBy: { ticker: 'asc' } })

const missing = companies.filter(c => !c.isin)
const invalid = companies.filter(c => c.isin && !isValidISIN(c.isin))
const placeholder = companies.filter(c => c.isin === 'EGS02091C019' || c.isin === 'EG00000000000')

// duplicates
const seen = new Map()
const dupes = []
for (const c of companies) {
  if (!c.isin) continue
  if (seen.has(c.isin)) dupes.push(`${c.isin}: ${seen.get(c.isin)} + ${c.ticker}`)
  else seen.set(c.isin, c.ticker)
}

console.log(`total=${companies.length}`)
console.log(`ISIN_MISSING=${missing.length}`)
console.log(`ISIN_CHECKSUM_INVALID=${invalid.length}`)
console.log(`ISIN_PLACEHOLDER=${placeholder.length}`)
console.log(`ISIN_DUPLICATED=${dupes.length}`)
if (missing.length) console.log('missing:', missing.map(c => c.ticker).join(','))
if (invalid.length) console.log('invalid:', invalid.map(c => `${c.ticker}(${c.isin})`).join(', '))
if (placeholder.length) console.log('placeholders:', placeholder.map(c => `${c.ticker}(${c.isin})`).join(', '))
if (dupes.length) console.log('dupes:', dupes.join(' | '))

// --- COMI cash-flow ground truth ---
const comi = await db.company.findUnique({ where: { ticker: 'COMI' }, select: { id: true } })
const cfReports = await db.financialReport.findMany({
  where: { companyId: comi.id, deletedAt: null },
  include: { values: { where: { metricCode: { in: ['OPERATING_CASH_FLOW', 'INVESTING_CASH_FLOW', 'FINANCING_CASH_FLOW', 'NET_CHANGE_IN_CASH'] } }, select: { metricCode: true, normalizedValue: true } } },
  orderBy: [{ fiscalYear: 'asc' }, { periodLabel: 'asc' }],
})
console.log('\n--- COMI cash-flow rows (Ground truth) ---')
for (const r of cfReports) {
  const v = Object.fromEntries(r.values.map(v => [v.metricCode, v.normalizedValue]))
  if (Object.keys(v).length === 0) continue
  const sum = (v.OPERATING_CASH_FLOW ?? 0) + (v.INVESTING_CASH_FLOW ?? 0) + (v.FINANCING_CASH_FLOW ?? 0)
  console.log(`${r.periodLabel} [${r.periodType}] src=${r.sourceName} | OCF=${v.OPERATING_CASH_FLOW ?? '-'} ICF=${v.INVESTING_CASH_FLOW ?? '-'} FCF=${v.FINANCING_CASH_FLOW ?? '-'} NET=${v.NET_CHANGE_IN_CASH ?? '-'} | 3flow-sum=${sum}`)
}

await db.$disconnect()
