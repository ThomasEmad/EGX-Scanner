// Measure the real AI snapshot size for NIPH using the app's own builder
import { PrismaClient } from "@prisma/client"

const DATABASE_URL = "file:/tmp/my-project/db/custom.db?connection_limit=1"
const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } })

async function main() {
  const company = await prisma.company.findFirst({ where: { ticker: "NIPH" } })
  if (!company) { console.log("NIPH not found"); return }

  // Dynamically import the TS builder via tsx
  const { buildAiSnapshotBundle } = await import("/tmp/my-project/src/lib/ai/analysis-snapshot.ts")
  const bundle = await buildAiSnapshotBundle(company)
  const json = bundle.snapshotJson
  console.log("snapshotJson length:", json.length, "chars (~", Math.round(json.length / 4), "tokens)")

  // Break down top-level section sizes
  const snap = JSON.parse(json)
  for (const [k, v] of Object.entries(snap)) {
    const s = JSON.stringify(v)
    console.log(`  ${k}: ${s.length} chars`)
  }
  // periods detail
  if (Array.isArray(snap.periods)) {
    console.log("  periods count:", snap.periods.length)
    for (const p of snap.periods) console.log(`    ${p.periodKey}: metrics=${Object.keys(p.calculatedMetrics || {}).length} raw=${Object.keys(p.rawValues || {}).length} size=${JSON.stringify(p).length}`)
  }
  if (snap.signals) console.log("  signals count:", snap.signals.length)
  if (snap.modules) console.log("  modules count:", snap.modules.length)
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
