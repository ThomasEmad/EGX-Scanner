/* Recompute runner — loads the TS calculation engine (src/lib/financial/recompute.ts)
   via jiti (bundled in the Next.js toolchain) which resolves the "@/..." tsconfig
   path aliases, then runs recomputeAll() to refresh every company's derived metrics
   after the unit-scale repairs. No bun/tsx needed.
   Usage: node scripts/run-recompute.cjs */
const path = require("node:path")
const { createJiti } = require("jiti")

const root = path.resolve(__dirname, "..")
const jiti = createJiti(path.join(root, "scripts", "run-recompute.cjs"), {
  interopDefault: true,
  moduleCache: false,
  // tsconfig paths: "@/*" -> "./src/*". Using "@" with module-boundary matching so
  // "@/lib/db" resolves to src/lib/db while "@prisma/client" is left untouched.
  alias: { "@": path.join(root, "src") },
})

async function main() {
  const mod = await jiti.import(path.join(root, "src", "lib", "financial", "recompute.ts"))
  const { recomputeAll } = mod
  if (typeof recomputeAll !== "function") throw new Error("recomputeAll not exported")
  const t0 = Date.now()
  const results = await recomputeAll()
  let calc = 0, events = 0, periods = 0
  for (const r of results) { calc += r.calculatedMetrics; events += (r.events || []).length; periods += (r.periods || []).length }
  console.log(`RECOMPUTE DONE: companies=${results.length} calculatedMetrics=${calc} events=${events} periods=${periods} elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

main().catch((e) => { console.error("RECOMPUTE FAILED:", e); process.exit(1) })
