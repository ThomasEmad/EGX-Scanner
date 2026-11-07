// Consistent, verifiable SQLite backup for Meza.
//
// Uses SQLite's `VACUUM INTO`, which produces a clean copy even while the
// database is open, then verifies the copy with `PRAGMA integrity_check`.
// Old backups are pruned only after a new backup has passed verification.
//
// Usage:
//   node scripts/backup-db.mjs                 # keep the last 14 backups
//   node scripts/backup-db.mjs --keep=30
//   node scripts/backup-db.mjs --dry-run       # report what would happen

import fs from "node:fs"
import path from "node:path"
import { PrismaClient } from "@prisma/client"

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const keepArg = args.find((a) => a.startsWith("--keep="))
const keep = keepArg ? Math.max(1, Number(keepArg.split("=")[1]) || 14) : 14

const dbUrl = process.env.DATABASE_URL
if (!dbUrl || !dbUrl.startsWith("file:")) {
  console.error("DATABASE_URL must be a SQLite `file:` URL")
  process.exit(1)
}

// Resolve without mangling absolute paths (the old leading-slash strip turned
// `file:/home/z/...` into a broken relative path).
const source = path.resolve(dbUrl.replace(/^file:/, ""))
const backupDir = path.join(process.cwd(), "backups")
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const dest = path.join(backupDir, `prisma-${stamp}.db`)

if (!fs.existsSync(source)) {
  console.error(`Database file not found: ${source}`)
  process.exit(1)
}

if (dryRun) {
  console.log(JSON.stringify({ dryRun: true, source, dest, keep }, null, 2))
  process.exit(0)
}

fs.mkdirSync(backupDir, { recursive: true })

const db = new PrismaClient()
try {
  // SQLite string literal: escape single quotes, normalize separators.
  const sqlPath = dest.replace(/\\/g, "/").replace(/'/g, "''")
  await db.$executeRawUnsafe(`VACUUM INTO '${sqlPath}'`)
} finally {
  await db.$disconnect()
}

const size = fs.statSync(dest).size
if (size < 1024) {
  console.error(`Backup is suspiciously small (${size} bytes): ${dest}`)
  process.exit(1)
}

// Verify the backup by opening it as its own database.
const backupDb = new PrismaClient({ datasourceUrl: `file:${dest}` })
let integrity = "unknown"
try {
  const rows = await backupDb.$queryRawUnsafe("PRAGMA integrity_check")
  integrity = Array.isArray(rows) && rows[0] ? Object.values(rows[0])[0] : "unknown"
} finally {
  await backupDb.$disconnect()
}

if (String(integrity).toLowerCase() !== "ok") {
  console.error(`Backup failed integrity_check: ${integrity}`)
  process.exit(1)
}

// Prune old backups only after the new one is verified.
const backups = fs
  .readdirSync(backupDir)
  .filter((f) => /^prisma-.*\.db$/.test(f))
  .map((f) => ({ f, t: fs.statSync(path.join(backupDir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)
const removed = backups.slice(keep).map((b) => b.f)
for (const f of removed) fs.unlinkSync(path.join(backupDir, f))

console.log(
  JSON.stringify(
    {
      ok: true,
      backup: path.relative(process.cwd(), dest),
      bytes: size,
      integrity,
      kept: Math.min(backups.length, keep),
      pruned: removed,
    },
    null,
    2,
  ),
)
