// Turso datetime normalization — REPAIR script (production write, surgical):
// Converts every DateTime column cell stored as INTEGER (epoch millis) to the
// canonical Prisma TEXT format 'YYYY-MM-DDTHH:MM:SS.mmmZ'.
// Only touches cells where typeof(col)='integer'. TEXT/NULL cells untouched.
import fs from 'node:fs'

const TURSO_URL = fs.readFileSync('/home/z/my-project/scripts/.turso_url', 'utf8').trim()
const TURSO_TOKEN = fs.readFileSync('/home/z/my-project/scripts/.turso_token', 'utf8').trim()
const { PrismaClient } = await import('@prisma/client')
const { PrismaLibSQL } = await import('@prisma/adapter-libsql')
const db = new PrismaClient({ adapter: new PrismaLibSQL({ url: TURSO_URL, authToken: TURSO_TOKEN }), log: [] })

const APPLY = process.argv.includes('--apply')
const BATCH = 40000

// 1. enumerate tables + datetime-declared columns
const tables = (await db.$queryRawUnsafe(
  `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' AND name NOT LIKE 'libsql%' AND name NOT LIKE '_cf_%'`
)).map(r => r.name)

let totalFixed = 0
const report = []

for (const t of tables.sort()) {
  let cols
  try { cols = await db.$queryRawUnsafe(`PRAGMA table_info("${t}")`) } catch { continue }
  for (const c of cols) {
    const decl = String(c.type || '').toUpperCase()
    if (!decl.includes('DATE') && !decl.includes('TIME')) continue
    const col = c.name
    try {
      const cnt = await db.$queryRawUnsafe(
        `SELECT COUNT(*) AS n, MIN(${col}) AS lo, MAX(${col}) AS hi FROM "${t}" WHERE typeof(${col})='integer'`
      )
      const n = Number(cnt[0]?.n ?? 0)
      if (n === 0) { report.push(`  = ${t}.${col}: clean`); continue }
      const lo = Number(cnt[0]?.lo), hi = Number(cnt[0]?.hi)
      // sanity: epoch seconds (<1e11) vs millis (>=1e11). Reject implausible ranges.
      if (hi < 1e9 || lo > 4e12) {
        report.push(`  ! ${t}.${col}: ${n} int rows but range ${lo}..${hi} not epoch-like — SKIPPED`)
        continue
      }
      const ms = hi >= 1e11 // millis? seconds otherwise
      const expr = ms ? `${col}/1000` : col
      if (!APPLY) { report.push(`  ~ ${t}.${col}: ${n} int rows (${new Date(lo).toISOString?.() ?? lo} .. ${new Date(hi).toISOString?.() ?? hi}) — WOULD FIX`); totalFixed += n; continue }
      let fixed = 0
      for (let i = 0; i < 40; i++) {
        const res = await db.$executeRawUnsafe(
          `UPDATE "${t}" SET ${col} = strftime('%Y-%m-%dT%H:%M:%fZ', ${expr}, 'unixepoch') ` +
          `WHERE rowid IN (SELECT rowid FROM "${t}" WHERE typeof(${col})='integer' LIMIT ${BATCH})`
        )
        fixed += res
        if (res < BATCH) break
      }
      const after = await db.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM "${t}" WHERE typeof(${col})='integer'`)
      const left = Number(after[0]?.n ?? 0)
      report.push(`  ✚ ${t}.${col}: FIXED ${fixed}/${n}, remaining int: ${left}`)
      totalFixed += fixed
    } catch (e) {
      report.push(`  ✗ ${t}.${col}: ${String(e?.message ?? e).slice(0, 160)}`)
    }
  }
}

console.log(report.join('\n'))
console.log(APPLY ? `TOTAL FIXED: ${totalFixed}` : `TOTAL WOULD FIX: ${totalFixed}  (run with --apply to write)`)
await db.$disconnect()
