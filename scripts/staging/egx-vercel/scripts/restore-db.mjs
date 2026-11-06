// Restore a verified SQLite backup. This is intentionally explicit:
// it takes a safety backup of the current database first, verifies the
// candidate, and only then replaces the live file.
//
// Stop the application server before running this (Windows keeps the file
// locked while the server is running).
//
// Usage:
//   node scripts/restore-db.mjs --from backups/prisma-2026-11-03T18-00-00-000Z.db --yes

import fs from "node:fs"
import path from "node:path"
import { PrismaClient } from "@prisma/client"

const args = process.argv.slice(2)
const fromArg = args.find((a) => a.startsWith("--from="))
const from = fromArg ? fromArg.split("=")[1] : null
const confirmed = args.includes("--yes")

if (!from) {
  console.error("Usage: node scripts/restore-db.mjs --from <backup.db> --yes")
  process.exit(1)
}
if (!confirmed) {
  console.error("Refusing to restore without --yes. Stop the server first.")
  process.exit(1)
}

const dbUrl = process.env.DATABASE_URL
if (!dbUrl || !dbUrl.startsWith("file:")) {
  console.error("DATABASE_URL must be a SQLite `file:` URL")
  process.exit(1)
}
const live = dbUrl.replace(/^file:/, "").replace(/^\/+/, "")
const candidate = path.resolve(from)

if (!fs.existsSync(candidate)) {
  console.error(`Backup not found: ${candidate}`)
  process.exit(1)
}
if (!fs.existsSync(live)) {
  console.error(`Live database not found: ${live}`)
  process.exit(1)
}

async function integrity(file) {
  const db = new PrismaClient({ datasourceUrl: `file:${file}` })
  try {
    const rows = await db.$queryRawUnsafe("PRAGMA integrity_check")
    return Array.isArray(rows) && rows[0] ? String(Object.values(rows[0])[0]) : "unknown"
  } finally {
    await db.$disconnect()
  }
}

const candidateCheck = await integrity(candidate)
if (candidateCheck.toLowerCase() !== "ok") {
  console.error(`Candidate failed integrity_check: ${candidateCheck}`)
  process.exit(1)
}

// Safety copy of the current live database before replacing it.
const safetyDir = path.join(process.cwd(), "backups")
fs.mkdirSync(safetyDir, { recursive: true })
const safety = path.join(safetyDir, `pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.db`)
fs.copyFileSync(live, safety)

fs.copyFileSync(candidate, live)
const liveCheck = await integrity(live)
if (liveCheck.toLowerCase() !== "ok") {
  console.error(`Restored database failed integrity_check: ${liveCheck}. Safety copy: ${safety}`)
  process.exit(1)
}

console.log(
  JSON.stringify(
    { ok: true, restoredFrom: candidate, safetyCopy: safety, integrity: liveCheck },
    null,
    2,
  ),
)
