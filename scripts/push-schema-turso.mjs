// Push the Prisma schema to a Turso (libSQL) database — or to any local
// file: database for testing.
//
// Usage:
//   TURSO_DATABASE_URL=libsql://your-db-yourorg.turso.io \
//   TURSO_AUTH_TOKEN=eyJ... \
//   node scripts/push-schema-turso.mjs
//
// Local smoke test (same code path, local file target):
//   TURSO_DATABASE_URL=file:/tmp/turso-smoke.db node scripts/push-schema-turso.mjs
//
// How it works:
//   1. Generates the full SQLite DDL from prisma/schema.prisma via
//      `prisma migrate diff --from-empty --to-schema-datamodel --script`
//      (pure offline schema diff — never touches any database).
//   2. Executes every statement against the target through @libsql/client —
//      the same driver the app uses at runtime. Idempotent-ish: it fails if
//      tables already exist, which protects an already-seeded production DB
//      from being clobbered by accident.

import { execSync } from "node:child_process"

const url =
  (process.env.TURSO_DATABASE_URL || "").trim() ||
  process.argv[2] ||
  ""

if (!url) {
  console.error(
    "Missing target database. Set TURSO_DATABASE_URL (libsql://…) or pass a file: URL as the first argument."
  )
  process.exit(1)
}

// 1. Generate the DDL from the Prisma schema (offline — no DB connection).
const env = { ...process.env }
if (!env.DATABASE_URL) env.DATABASE_URL = "file:./prisma/unused-diff-target.db"
let sql = ""
try {
  sql = execSync(
    "bunx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script",
    { encoding: "utf8", env, cwd: new URL("..", import.meta.url).pathname, maxBuffer: 64 * 1024 * 1024 }
  )
} catch (err) {
  console.error("Failed to generate schema SQL:", err.stderr || err.message)
  process.exit(1)
}

const statements = sql
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s && !s.split("\n").every((l) => !l.trim() || l.trim().startsWith("--")))

if (statements.length === 0) {
  console.error("Generated SQL contained no statements — aborting.")
  process.exit(1)
}

console.log(`Target: ${url}`)
console.log(`Statements to apply: ${statements.length}`)

// 2. Apply to the target database through @libsql/client.
const { createClient } = await import("@libsql/client")
const client = createClient({
  url,
  authToken: (process.env.TURSO_AUTH_TOKEN || "").trim() || undefined,
})

try {
  await client.batch(statements.map((s) => ({ sql: s, args: [] })), "write")
} catch (err) {
  const msg = String(err?.message || err)
  if (msg.includes("already exists")) {
    console.error("✖ Target database already has tables — refusing to overwrite.")
    console.error("  (This script creates a NEW empty schema. For an existing DB use the app's migration flow instead.)")
  } else {
    console.error("✖ Failed to apply schema:", msg)
  }
  process.exit(1)
}

console.log(`✔ Schema applied successfully (${statements.length} statements).`)
console.log("Next step: seed it —  TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… bun prisma/seed.ts")
