// Build the refresh worklist: zero-data + stale companies with exact gaps.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const CURRENT_YEAR = 2026
const companies = await db.company.findMany({
  where: { isActive: true },
  select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true, isin: true },
})
const worklist = []
for (const c of companies) {
  const reports = await db.financialReport.findMany({
    where: { companyId: c.id, deletedAt: null, periodType: 'ANNUAL' },
    select: { fiscalYear: true, periodLabel: true },
  })
  const years = new Set(reports.map(r => r.fiscalYear))
  const latest = years.size ? Math.max(...years) : 0
  const missing = []
  for (let y = 2021; y <= CURRENT_YEAR - 1; y++) if (!years.has(y)) missing.push(y)
  if (latest < CURRENT_YEAR - 1 || missing.length > 0) {
    worklist.push({ ticker: c.ticker, sector: c.sector, isin: c.isin, latestFY: latest || null, missingYears: missing })
  }
}
// sort by severity: zero-data first, then oldest latest
worklist.sort((a, b) => (a.latestFY ?? -1) - (b.latestFY ?? -1))
console.log(JSON.stringify({ total: worklist.length, zero: worklist.filter(w => !w.latestFY).length }, null, 2))
for (const w of worklist) {
  console.log(`${w.ticker}\t${w.sector}\tlatest=${w.latestFY ?? 'NONE'}\tmissing=${w.missingYears.join(',') || '-'}\tisin=${w.isin ?? '-'}`)
}
await db.$disconnect()
