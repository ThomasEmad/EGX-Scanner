// Quarantine VALU's garbage Yahoo/Mubasher-earnings financials (idempotent):
// provably inconsistent with ground truth (AskBorsa EGP: assets ~12B, equity
// ~1.76B, NP ~765M FY2025) by non-constant factors — mixed-scale/line garbage.
// Real values live in the AskBorsa Q1-2025 report (kept).
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const EXECUTE = process.argv.includes('--execute')
const valu = await db.company.findUnique({ where: { ticker: 'VALU' }, select: { id: true } })
const reports = await db.financialReport.findMany({
  where: {
    companyId: valu.id, deletedAt: null,
    OR: [
      { periodType: 'ANNUAL', fiscalYear: { in: [2023, 2024, 2026] }, sourceName: { contains: 'YAHOO' } },
      { periodType: 'ANNUAL', fiscalYear: 2025, sourceName: { contains: 'MUBASHER' } },
      { periodType: 'QUARTERLY', fiscalYear: 2024, sourceName: { contains: 'ASKBORA' } },
    ],
  },
  include: { values: { select: { id: true, metricCode: true, normalizedValue: true, validationStatus: true, validationNotes: true } } },
})

const rows = []
for (const r of reports) {
  for (const v of r.values) {
    if ((v.validationNotes ?? '').startsWith('AUDIT_QUARANTINE')) continue
    if (v.validationStatus === 'FAILED') continue
    rows.push({ id: v.id, report: `${r.periodLabel} ${r.fiscalYear}`, metric: v.metricCode })
  }
}
console.log(JSON.stringify({ mode: EXECUTE ? 'EXECUTE' : 'DRY', reports: reports.length, toQuarantine: rows.length }))
for (const r of reports) console.log(`  ${r.periodLabel} FY${r.fiscalYear} ${r.sourceName.slice(0, 30)}`)

if (EXECUTE) {
  let n = 0
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400)
    await Promise.all(chunk.map(r => db.financialValue.update({
      where: { id: r.id },
      data: {
        validationStatus: 'NEEDS_REVIEW',
        validationNotes: 'AUDIT_QUARANTINE: mixed-scale/line garbage financials — inconsistent with the company\'s EGP filings by non-constant factors (assets/equity/revenue off 20-80x); awaiting re-extraction from filings.',
      },
    })))
    n += chunk.length
  }
  console.log('quarantined:', n)
}
await db.$disconnect()
