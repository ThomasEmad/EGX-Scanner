// Equivalence check: SQL-aggregated latest period keys vs the old full-scan JS
// logic, per company per periodType. Ground truth = cursor-paged full fetch.
import fs from 'node:fs'
const U = fs.readFileSync('/home/z/my-project/scripts/.turso_url', 'utf8').trim()
const T = fs.readFileSync('/home/z/my-project/scripts/.turso_token', 'utf8').trim()
const { PrismaClient } = await import('@prisma/client')
const { PrismaLibSQL } = await import('@prisma/adapter-libsql')
const db = new PrismaClient({ adapter: new PrismaLibSQL({ url: U, authToken: T }), log: [] })

function parseKey(key) { const [pt, y, sub = ''] = key.split(':'); return { pt, fy: Number(y), sub } }
function newer(a, b) { const x = parseKey(a), y = parseKey(b); return x.fy > y.fy || (x.fy === y.fy && x.sub > y.sub) }

// --- ground truth: full scan (paged) --------------------------------------
const PAGE = 2000
const truth = new Map() // company|type|stmt -> latest key
let cursor, pages = 0, rows = 0
const t0 = Date.now()
for (;;) {
  const page = await db.calculatedMetric.findMany({
    where: { statementType: { in: ['CONSOLIDATED', 'STANDALONE'] } },
    select: { id: true, companyId: true, periodKey: true, periodType: true, statementType: true },
    orderBy: [{ id: 'asc' }],
    take: PAGE, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  })
  pages++; rows += page.length
  for (const r of page) {
    const k = `${r.companyId}|${r.periodType}|${r.statementType}`
    const cur = truth.get(k)
    if (!cur || newer(r.periodKey, cur)) truth.set(k, r.periodKey)
  }
  if (page.length < PAGE) break
  cursor = page[page.length - 1].id
}
console.log(`ground truth: ${rows} rows in ${pages} pages, ${(Date.now() - t0) / 1000}s, ${truth.size} groups`)

// --- new SQL aggregate ----------------------------------------------------
const agg = await db.$queryRawUnsafe(
  `SELECT companyId, periodType, statementType, MAX(periodKey) AS periodKey
   FROM CalculatedMetric WHERE statementType IN ('CONSOLIDATED','STANDALONE')
   GROUP BY companyId, periodType, statementType`
)
console.log(`sql aggregate: ${agg.length} groups`)
let mismatch = 0
for (const r of agg) {
  const k = `${r.companyId}|${r.periodType}|${r.statementType}`
  if (truth.get(k) !== r.periodKey) { mismatch++; if (mismatch <= 5) console.log('MISMATCH', k, 'sql:', r.periodKey, 'js:', truth.get(k)) }
}
let missing = 0
for (const [k, v] of truth) {
  const [cid, pt, st] = k.split('|')
  const found = agg.find(a => a.companyId === cid && a.periodType === pt && a.statementType === st)
  if (!found) { missing++; if (missing <= 3) console.log('MISSING GROUP', k) }
}
console.log(mismatch === 0 && missing === 0 ? '✅ EQUIVALENT — SQL aggregate matches full JS scan exactly' : `❌ mismatches: ${mismatch}, missing: ${missing}`)
await db.$disconnect()
