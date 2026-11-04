// Quarantine fabricated template-contaminated values (idempotent, reversible).
// Marks rows: validationStatus=NEEDS_REVIEW + AUDIT_QUARANTINE note.
// Originals preserved; excluded from reads/scores/recompute by status.
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'
const db = new PrismaClient()

const data = JSON.parse(readFileSync('contamination-fabricated.json', 'utf8'))
const ids = data.quarantineIds
const EXECUTE = process.argv.includes('--execute')

// re-scan live: only rows still without a quarantine note (idempotent re-runs)
// chunked: SQLite chokes on thousands of IN parameters + negation filters.
// NOTE: Prisma `not: startsWith` excludes NULL notes — filter in JS instead.
const rows = []
for (let i = 0; i < ids.length; i += 150) {
  const chunk = ids.slice(i, i + 150)
  const found = await db.financialValue.findMany({
    where: { id: { in: chunk } },
    select: { id: true, metricCode: true, normalizedValue: true, validationNotes: true, report: { select: { fiscalYear: true, sourceName: true } } },
  })
  rows.push(...found.filter(r => !(r.validationNotes ?? '').startsWith('AUDIT_QUARANTINE')))
}
console.log(JSON.stringify({ mode: EXECUTE ? 'EXECUTE' : 'DRY', toQuarantine: rows.length, alreadyQuarantined: ids.length - rows.length }))

if (EXECUTE) {
  const now = new Date()
  let n = 0
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400)
    await Promise.all(chunk.map(r => db.financialValue.update({
      where: { id: r.id },
      data: {
        validationStatus: 'NEEDS_REVIEW',
        validationNotes: `AUDIT_QUARANTINE: fabricated template value — identical value ${r.normalizedValue} for ${r.metricCode} FY${r.report.fiscalYear} shared across many unrelated companies (${r.report.sourceName} batch). Provably not real; awaiting re-extraction from filings.`,
      },
    })))
    n += chunk.length
    if (n % 2000 === 0) console.log(`... ${n}/${rows.length}`)
  }
  console.log('quarantined:', n)
}
await db.$disconnect()
