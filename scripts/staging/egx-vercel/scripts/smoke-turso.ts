// Smoke test: dual-mode Prisma client through the libSQL adapter.
// Run: DATABASE_URL="file:./unused.db" TURSO_DATABASE_URL=file:/tmp/turso-smoke.db bun run scripts/smoke-turso.ts
import { buildPrismaClient } from "../src/lib/db"

const url = process.env.TURSO_DATABASE_URL || ""
if (!url) {
  console.error("Set TURSO_DATABASE_URL (file: for local test)")
  process.exit(1)
}
console.log("Adapter mode target:", url)

const db = buildPrismaClient()

const companyCount = await db.company.count()
console.log("✔ company.count() =", companyCount)

// Write path through the adapter (create → read → delete)
const probe = await db.adminSession.create({
  data: {
    token: "smoke-test-token-probe",
    expiresAt: new Date(Date.now() + 60_000),
  },
})
const readBack = await db.adminSession.findUnique({ where: { token: "smoke-test-token-probe" } })
if (!readBack) throw new Error("write/read through adapter failed")
await db.adminSession.delete({ where: { id: probe.id } })
console.log("✔ insert/read/delete through libSQL adapter OK")

console.log("✔ SMOKE TEST PASSED — Turso adapter path is fully functional")
process.exit(0)
