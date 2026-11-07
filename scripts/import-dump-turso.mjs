// Import a SQLite SQL dump (gzipped) into a Turso (libSQL) database — or any
// local file: database for testing. Memory-safe for multi-GB dumps.
//
// Usage:
//   TURSO_DATABASE_URL=libsql://your-db-yourorg.turso.io \
//   TURSO_AUTH_TOKEN=eyJ... \
//   node scripts/import-dump-turso.mjs /path/to/dump.sql.gz
//
// Local smoke test (same code path, local target):
//   TURSO_DATABASE_URL=file:/tmp/import-test.db \
//   node scripts/import-dump-turso.mjs /tmp/dump.sql.gz
//
// Why three passes? Dumps are often ordered alphabetically, so an INSERT for
// table X can appear before its parent table Y is even created. libSQL builds
// (local and remote) commonly run with PRAGMA foreign_keys=ON and the pragma
// cannot be toggled reliably per request over HTTP. So we:
//   pass A — all CREATE TABLE statements (FK refs to later tables are legal)
//   pass B — INSERTs streamed from per-table spill files in FK-topological
//            order (parents first) — constant memory, never holds the dump
//   pass C — indexes / triggers / views (created last, after all data)
// Pass 1 streams the dump once and spills INSERT statements to per-table temp
// files, so memory stays flat no matter how large the dump is.

import { createReadStream } from "node:fs"
import { createWriteStream, mkdirSync, rmSync } from "node:fs"
import { createGunzip } from "node:zlib"
import { createInterface } from "node:readline"
import path from "node:path"
import os from "node:os"

const target = (process.env.TURSO_DATABASE_URL || "").trim()
const token = (process.env.TURSO_AUTH_TOKEN || "").trim() || undefined
const dumpPath = process.argv[2]

if (!target || !dumpPath) {
  console.error(
    "Usage: TURSO_DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… node scripts/import-dump-turso.mjs <dump.sql.gz>"
  )
  process.exit(1)
}

const BATCH_BYTES = 400 * 1024
const SPILL_DIR = path.join(os.tmpdir(), `egx-import-spill-${process.pid}`)

const { createClient } = await import("@libsql/client")
const client = createClient({ url: target, authToken: token })

console.log(`Target: ${target}`)
console.log(`Dump:   ${dumpPath}`)
console.log(`Spill:  ${SPILL_DIR}`)

// Refuse to import over an existing schema (protect production DBs).
try {
  const res = await client.execute("SELECT count(*) AS c FROM sqlite_master WHERE type='table'")
  const existing = Number(res.rows[0]?.c ?? 0)
  if (existing > 0) {
    console.error(`✖ Target already has ${existing} tables — refusing to import over it.`)
    process.exit(1)
  }
} catch (err) {
  console.error("✖ Cannot reach target database:", String(err?.message || err).slice(0, 160))
  process.exit(1)
}

mkdirSync(SPILL_DIR, { recursive: true })

// ---------- pass 1: one streaming scan, spill inserts per table ----------
const createTables = [] // { name, sql, refs }
const uniqueIdx = [] // CREATE UNIQUE INDEX — required by FK parent keys BEFORE data
const otherDdl = [] // regular indexes / triggers / views — rebuilt after data
const spilledTables = new Set()
const spillFiles = new Map() // table -> write stream
const otherStatements = []

let cur = ""
let inString = false
let lineNo = 0

function classify(raw) {
  const s = raw.trim()
  if (!s) return
  const upper = s.toUpperCase()
  if (upper.startsWith("BEGIN TRANSACTION") || upper.startsWith("COMMIT") || upper.startsWith("PRAGMA")) {
    return
  }
  let m = s.match(/^CREATE TABLE\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/i)
  if (m) {
    const refs = [...s.matchAll(/REFERENCES\s+"([A-Za-z_][A-Za-z0-9_]*)"/gi)].map((r) => r[1])
    createTables.push({ name: m[1], sql: s, refs })
    return
  }
  if (/^CREATE UNIQUE INDEX/i.test(s)) {
    // FKs may reference columns whose uniqueness is declared by these indexes
    // (e.g. Company.ticker). They must exist BEFORE the data pass, otherwise
    // inserts fail with "foreign key mismatch".
    uniqueIdx.push(s)
    return
  }
  if (/^CREATE INDEX|^CREATE TRIGGER|^CREATE VIEW/i.test(s)) {
    otherDdl.push(s)
    return
  }
  m = s.match(/^INSERT INTO\s+"([A-Za-z_][A-Za-z0-9_]*)"/i)
  if (m) {
    const table = m[1]
    let ws = spillFiles.get(table)
    if (!ws) {
      ws = createWriteStream(path.join(SPILL_DIR, `${table}.sql`), { encoding: "utf8" })
      spillFiles.set(table, ws)
      spilledTables.add(table)
    }
    ws.write(s)
    ws.write("\n<<--STMT-->>\n")
    return
  }
  otherStatements.push(s)
}

const t0 = Date.now()
const rl = createInterface({
  input: createReadStream(dumpPath).pipe(createGunzip()),
  crlfDelay: Infinity,
})

for await (const line of rl) {
  lineNo++
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inString) {
      cur += ch
      if (ch === "'") inString = false
    } else if (ch === "'") {
      inString = true
      cur += ch
    } else if (ch === ";") {
      classify(cur)
      cur = ""
    } else {
      cur += ch
    }
  }
  cur += "\n"
}
classify(cur)

const spills = spillFiles.size
for (const [, ws] of spillFiles) ws.end()
console.log(
  `✔ Scan: ${lineNo} lines → ${createTables.length} tables, ${uniqueIdx.length} unique indexes, ${otherDdl.length} indexes, ` +
    `${spills} insert-spill files — ${Math.round((Date.now() - t0) / 1000)}s`
)

// ---------- FK-topological order ----------
const tableNames = new Set(createTables.map((t) => t.name))
const nameToRefs = new Map(
  createTables.map((t) => [t.name, (t.refs || []).filter((r) => tableNames.has(r) && r !== t.name)])
)
const orderedTables = []
const visited = new Set()
const visiting = new Set()
function visit(t) {
  if (visited.has(t) || visiting.has(t)) return
  visiting.add(t)
  for (const r of nameToRefs.get(t) || []) visit(r)
  visiting.delete(t)
  visited.add(t)
  orderedTables.push(t)
}
for (const t of createTables.map((x) => x.name)) visit(t)
console.log(`FK order: ${orderedTables.slice(0, 8).join(" → ")} …`)

// ---------- batched sender (constant memory) ----------
let batchCount = 0
let totalSent = 0
let pending = []
let pendingBytes = 0

async function sendBatch(final = false) {
  if (pending.length === 0) return
  const chunk = pending
  pending = []
  pendingBytes = 0
  batchCount++
  await client.batch(chunk, "write")
  totalSent += chunk.length
  if (batchCount % 50 === 0 || final) {
    const rss = Math.round(process.memoryUsage().rss / 1e6)
    console.log(`  … batch #${batchCount} — ${totalSent} statements applied (${rss}MB rss)`)
  }
}

async function push(sql) {
  if (typeof sql !== "string") {
    console.error("push() got non-string:", typeof sql)
    return
  }
  pending.push({ sql, args: [] })
  pendingBytes += sql.length
  if (pendingBytes >= BATCH_BYTES) await sendBatch()
}

async function pushSpilledTable(table) {
  const file = path.join(SPILL_DIR, `${table}.sql`)
  const rl2 = createInterface({
    input: createReadStream(file),
    crlfDelay: Infinity,
  })
  let stmt = ""
  let count = 0
  for await (const line of rl2) {
    if (line === "<<--STMT-->>") {
      await push(stmt.trim())
      stmt = ""
      count++
    } else {
      stmt += line + "\n"
    }
  }
  if (stmt.trim()) await push(stmt.trim())
  rmSync(file, { force: true })
  return count
}

// pass A — tables + the unique indexes FKs depend on
for (const t of createTables) await push(t.sql)
for (const sql of uniqueIdx) await push(sql)
await sendBatch()
console.log(`✔ Pass A done — ${createTables.length} tables + ${uniqueIdx.length} unique indexes`)

// pass B — inserts from spill files, parents first
for (const table of orderedTables) {
  if (!spilledTables.has(table)) continue
  await pushSpilledTable(table)
}
await sendBatch()
console.log(`✔ Pass B (INSERT) done`)

// misc statements + indexes
for (const sql of otherStatements) await push(sql)
for (const sql of otherDdl) await push(sql)
await sendBatch(true)
console.log(`✔ Pass C (indexes/other) done`)

// ---------- sanity check ----------
try {
  const companies = await client.execute("SELECT count(*) AS c FROM Company")
  const reports = await client.execute("SELECT count(*) AS c FROM FinancialReport")
  const tables = await client.execute("SELECT count(*) AS c FROM sqlite_master WHERE type='table'")
  console.log(
    `✔ Sanity — tables: ${tables.rows[0]?.c}, Company: ${companies.rows[0]?.c}, FinancialReport: ${reports.rows[0]?.c}`
  )
} catch (err) {
  console.error("⚠ Sanity query failed (import may be incomplete):", String(err?.message || err).slice(0, 160))
  process.exit(1)
}

rmSync(SPILL_DIR, { recursive: true, force: true })
console.log(`✔ IMPORT OK in ${Math.round((Date.now() - t0) / 1000)}s — ${batchCount} batches total.`)
