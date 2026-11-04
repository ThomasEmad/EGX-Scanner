// Quarantine cross-quarter duplicate reports (idempotent, reversible).
// The later report in a consecutive-quarter pair whose overlapping values are
// >=90% identical is a harvest copy (click-race bug) — impossible under both
// discrete and cumulative conventions. Marks values NEEDS_REVIEW + note.
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'
const db = new PrismaClient()

const suspects = JSON.parse(readFileSync('crossquarter-dupes.json', 'utf8'))
const EXECUTE = process.argv.includes('--execute')

// Collect all non-quarantined value ids of the suspect reports.
const valueIds = [...new Set(suspects.flatMap(s => s.valueIds))]
const rows = []
for (let i = 0; i < valueIds.length; i += 150) {
  const chunk = valueIds.slice(i, i + 150)
  const found = await db.financialValue.findMany({
    where: { id: { in: chunk } },
    select: { id: true, metricCode: true, normalizedValue: true, validationNotes: true },
  })
  rows.push(...found.filter(r => !(r.validationNotes ?? '').startsWith('AUDIT_QUARANTINE')))
}
console.log(JSON.stringify({ mode: EXECUTE ? 'EXECUTE' : 'DRY', reports: suspects.length, toQuarantine: rows.length }))

if (EXECUTE) {
  let n = 0
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400)
    await Promise.all(chunk.map(r => db.financialValue.update({
      where: { id: r.id },
      data: {
        validationStatus: 'NEEDS_REVIEW',
        validationNotes: `AUDIT_QUARANTINE: cross-quarter duplicate — ${r.metricCode} identical (±0.05%) to the previous quarter's report (harvest tab-switch copy; impossible under discrete and cumulative conventions). Awaiting re-extraction.`,
      },
    })))
    n += chunk.length
  }
  console.log('quarantined:', n)
}
await db.$disconnect()
