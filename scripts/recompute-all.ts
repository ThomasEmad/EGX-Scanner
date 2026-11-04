// Recompute all derived metrics + events from the (now-repaired) raw values.
import { recomputeAll } from '../src/lib/financial/recompute'
import { PrismaClient } from '@prisma/client'

async function main() {
  const results = await recomputeAll()
  const created = results.reduce((a, r) => a + r.created, 0)
  const updated = results.reduce((a, r) => a + r.updated, 0)
  const errors = results.filter(r => r.errors && r.errors.length > 0)
  console.log(JSON.stringify({ companies: results.length, metricsCreated: created, metricsUpdated: updated, companiesWithErrors: errors.length }))
  if (errors.length) console.log('error companies:', errors.slice(0, 5).map(e => JSON.stringify(e.errors?.slice(0, 2))).join(' | '))
  const db = new PrismaClient()
  await db.$disconnect()
  process.exit(0)
}
main().catch(e => { console.error('RECOMPUTE FAILED:', e); process.exit(1) })
