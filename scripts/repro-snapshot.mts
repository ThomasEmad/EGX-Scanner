// Reproduce buildAiSnapshotBundle against PRODUCTION Turso from the sandbox,
// with full error visibility and per-query timing.
import { readFileSync } from "node:fs"
const envVar = (name: string): string => {
  const line = readFileSync("/tmp/my-project/.env", "utf8")
    .split("\n")
    .find((l) => l.startsWith(name + "="))
  return line ? line.slice(name.length + 1).trim() : ""
}
// db.ts prefers TURSO_DATABASE_URL — pass the production Turso URL + token
// through so the local run talks to the SAME database as Vercel.
process.env.TURSO_DATABASE_URL ||= envVar("TURSO_DATABASE_URL") ||
  (readFileSync("/home/z/my-project/scripts/turso-query.sh", "utf8").match(/URL="(https:\/\/[^"]+)\/v2\/pipeline"/)?.[1] ?? "")
process.env.TURSO_AUTH_TOKEN ||= envVar("TURSO_AUTH_TOKEN") ||
  (readFileSync("/home/z/my-project/scripts/turso-query.sh", "utf8").match(/TOKEN="([^"]+)"/)?.[1] ?? "")
console.log("turso url:", (process.env.TURSO_DATABASE_URL || "MISSING").slice(0, 50), "| token:", process.env.TURSO_AUTH_TOKEN ? "set" : "MISSING")

async function main() {
  const { db } = await import("/tmp/my-project/src/lib/db")
  const { buildAiSnapshotBundle } = await import("/tmp/my-project/src/lib/ai/analysis-snapshot")
  const cid = process.argv[2] || "cmui726f8004hbx90jyyuioyk"

  const company = await db.company.findFirst({
    where: { OR: [{ id: cid }, { ticker: cid.toUpperCase() }] },
    select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true, isActive: true },
  })
  console.log("company:", company?.ticker ?? cid)
  if (!company) { console.error("NOT FOUND"); process.exit(1) }

  const t0 = Date.now()
  try {
    const bundle = await buildAiSnapshotBundle(company as never)
    console.log("OK in", Date.now() - t0, "ms")
    console.log("hasData:", bundle.hasData, "| dataHash:", bundle.dataHash.slice(0, 12), "| basis:", bundle.statementBasis, "| periods:", bundle.promptPeriodCount, "| events:", bundle.eventCount, "| snapshotBytes:", bundle.snapshotJson.length)
  } catch (e) {
    console.error("FAILED after", Date.now() - t0, "ms")
    console.error(e instanceof Error ? e.stack : String(e))
    process.exit(1)
  }
  process.exit(0)
}

main()
