// ORAS (Orascom Construction) reports in USD — every source (Yahoo, Reuters,
// AskBorsa, TV) reproduces the USD filing, so the whole value set was stored
// ~48x too small vs EGP. Currency auto-fix is sanctioned by the audit spec.
// Converts normalizedValue USD->EGP at CBE period-end rates; original USD value
// preserved in originalValue (reversible). Idempotent via AUDIT_CURRENCY_FIX note.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

// CBE period-end USD/EGP mid rates (Dec-2024 per start-of-2025 bank quotes;
// 2025 year-end per CBE 47.60/47.74; 2026 quarter-ends per CBE daily table)
const RATES = [
  ['2022-12-31', 24.70], ['2023-03-31', 30.85], ['2023-06-30', 30.9], ['2023-09-30', 30.92], ['2023-12-31', 30.93],
  ['2024-03-31', 47.6], ['2024-06-30', 47.9], ['2024-09-30', 48.6], ['2024-12-31', 50.8],
  ['2025-03-31', 50.3], ['2025-06-30', 49.6], ['2025-09-30', 48.8], ['2025-12-31', 47.7],
  ['2026-03-31', 54.59], ['2026-06-30', 49.23], ['2026-09-30', 51.99], ['2026-12-31', 56.1],
]
function rateFor(date) {
  const d = date.toISOString().slice(0, 10)
  for (const [end, rate] of RATES) if (d <= end) return rate
  return 56.1
}
const COUNT_METRICS = new Set(['SHARES_OUTSTANDING'])

const EXECUTE = process.argv.includes('--execute')
const oras = await db.company.findUnique({ where: { ticker: 'ORAS' }, select: { id: true, ticker: true } })

const reports = await db.financialReport.findMany({
  where: { companyId: oras.id, deletedAt: null },
  select: { id: true, periodLabel: true, periodType: true, fiscalYear: true, periodEnd: true, sourceName: true, values: true },
})

const toConvert = []
const toQuarantine = []
let skippedQuarantined = 0, skippedCount = 0
for (const r of reports) {
  const rate = rateFor(r.periodEnd)
  for (const v of r.values) {
    if (v.normalizedValue === null || v.normalizedValue === undefined) continue
    if ((v.validationNotes ?? '').startsWith('AUDIT_QUARANTINE')) { skippedQuarantined++; continue }
    if ((v.validationNotes ?? '').startsWith('AUDIT_CURRENCY_FIX')) continue // idempotent
    if (v.validationStatus === 'FAILED') continue
    if (COUNT_METRICS.has(v.metricCode)) { skippedCount++; continue }
    if (v.metricCode === 'BOOK_VALUE_PER_SHARE') {
      // internally inconsistent with its own equity/shares — garbage line, quarantine
      toQuarantine.push({ id: v.id, metricCode: v.metricCode, periodLabel: r.periodLabel, rate })
      continue
    }
    toConvert.push({ id: v.id, metricCode: v.metricCode, periodLabel: r.periodLabel, rate, value: Number(v.normalizedValue) })
  }
}

console.log(JSON.stringify({
  mode: EXECUTE ? 'EXECUTE' : 'DRY',
  reports: reports.length,
  toConvert: toConvert.length,
  toQuarantineBVPS: toQuarantine.length,
  skippedQuarantined, skippedCount,
}))

// magnitude preview per period
const byPeriod = new Map()
for (const v of toConvert) byPeriod.set(v.periodLabel, { rate: v.rate, n: (byPeriod.get(v.periodLabel)?.n ?? 0) + 1 })
for (const [p, x] of [...byPeriod].slice(0, 30)) console.log(`  ${p}: rate=${x.rate} n=${x.n}`)

if (EXECUTE) {
  let n = 0
  for (const v of toConvert) {
    await db.financialValue.update({
      where: { id: v.id },
      data: {
        originalValue: v.value,
        normalizedValue: v.value * v.rate,
        isManuallyCorrected: true,
        correctedBy: 'audit-currency-fix',
        correctionReason: 'USD-reported figures stored as EGP',
        validationNotes: `AUDIT_CURRENCY_FIX: Orascom Construction reports in USD; converted USD->EGP @ ${v.rate} (CBE period-end rate). Original USD value preserved in originalValue.`,
      },
    })
    n++
  }
  for (const v of toQuarantine) {
    await db.financialValue.update({
      where: { id: v.id },
      data: {
        validationStatus: 'NEEDS_REVIEW',
        validationNotes: `AUDIT_QUARANTINE: BOOK_VALUE_PER_SHARE line internally inconsistent with the report's own equity and share count (Yahoo-derived garbage); awaiting re-extraction.`,
      },
    })
  }
  console.log('converted:', n, '| quarantined BVPS:', toQuarantine.length)
}
await db.$disconnect()
