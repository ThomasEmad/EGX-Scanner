// For each key table: how many rows are TEXT vs INT in createdAt, and the
// latest write timestamp of each type → identifies the active int-writer.
import fs from 'node:fs'
const TURSO_URL = fs.readFileSync('/home/z/my-project/scripts/.turso_url', 'utf8').trim()
const TURSO_TOKEN = fs.readFileSync('/home/z/my-project/scripts/.turso_token', 'utf8').trim()
const { PrismaClient } = await import('@prisma/client')
const { PrismaLibSQL } = await import('@prisma/adapter-libsql')
const db = new PrismaClient({ adapter: new PrismaLibSQL({ url: TURSO_URL, authToken: TURSO_TOKEN }), log: [] })

const tables = [
  ['FinancialReport', 'createdAt'], ['FinancialValue', 'createdAt'],
  ['CalculatedMetric', 'calculatedAt'], ['MarketPrice', 'createdAt'],
  ['AuditIssue', 'detectedAt'], ['User', 'createdAt'],
  ['SmartAnalysisUsage', 'createdAt'], ['PriceAlert', 'createdAt'],
  ['AiAnalysis', 'createdAt'], ['AuditRun', 'startedAt'],
]
for (const [t, c] of tables) {
  try {
    const r = await db.$queryRawUnsafe(
      `SELECT typeof(${c}) AS ty, COUNT(*) AS n, MIN(${c}) AS lo, MAX(${c}) AS hi FROM "${t}" GROUP BY typeof(${c})`
    )
    const parts = r.map(x => {
      const v = x.lo != null ? String(x.ty === 'integer' ? new Date(Number(x.hi)).toISOString() : x.hi) : '-'
      return `${x.ty}: ${x.n} (latest: ${v})`
    })
    console.log(`${t}.${c}  total=${r.reduce((a, x) => a + Number(x.n), 0)}  |  ${parts.join('  ||  ')}`)
  } catch (e) {
    console.log(`${t}.${c}: ERR ${String(e?.message ?? e).slice(0, 120)}`)
  }
}
await db.$disconnect()
