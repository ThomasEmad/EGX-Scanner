// Removes growth-feature remnants from the database (idempotent):
//   1. Deactivates growth preset scanner rules (PROFIT_GROWTH / REVENUE_GROWTH /
//      EQUITY_GROWTH / PROFIT_ACCELERATION) so they leave the dashboard + scanner lists.
//   2. Deletes leftover growth CalculatedMetric rows + current_ratio rows
//      (the recompute pipeline also drops them; this is belt & braces for any
//      company skipped by recompute).
//   3. Deletes FinancialEvent rows of the removed growth event types.
// Run: node scripts/remove-growth-features.mjs [--execute]  (default dry-run)
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const EXECUTE = process.argv.includes("--execute")

const GROWTH_PRESETS = ["PROFIT_GROWTH", "REVENUE_GROWTH", "EQUITY_GROWTH", "PROFIT_ACCELERATION"]
const GROWTH_CM_CODES = [
  "revenue_growth", "profit_growth", "ocf_growth", "debt_growth",
  "equity_growth", "eps_growth", "asset_growth", "current_ratio",
]
const GROWTH_EVENT_TYPES = ["REVENUE_GROWTH", "EQUITY_GROWTH", "PROFIT_ACCELERATION"]

try {
  const presets = await db.scannerRule.findMany({
    where: { presetKey: { in: GROWTH_PRESETS } },
    select: { id: true, presetKey: true, isActive: true },
  })
  console.log(`growth preset rules found: ${presets.length}`)
  for (const p of presets) console.log(`  - ${p.presetKey} isActive=${p.isActive}`)

  const cmCounts = []
  for (const code of GROWTH_CM_CODES) {
    const n = await db.calculatedMetric.count({ where: { code } })
    if (n > 0) cmCounts.push([code, n])
  }
  console.log(`leftover growth/current_ratio CalculatedMetric rows:`)
  for (const [code, n] of cmCounts) console.log(`  - ${code}: ${n}`)
  if (cmCounts.length === 0) console.log(`  (none)`)

  const evCounts = []
  for (const t of GROWTH_EVENT_TYPES) {
    const n = await db.financialEvent.count({ where: { eventType: t } })
    if (n > 0) evCounts.push([t, n])
  }
  console.log(`leftover growth FinancialEvent rows:`)
  for (const [t, n] of evCounts) console.log(`  - ${t}: ${n}`)
  if (evCounts.length === 0) console.log(`  (none)`)

  if (!EXECUTE) {
    console.log(`\nDRY RUN — rerun with --execute to apply.`)
  } else {
    const presetRes = await db.scannerRule.updateMany({
      where: { presetKey: { in: GROWTH_PRESETS } },
      data: { isActive: false },
    })
    console.log(`deactivated preset rules: ${presetRes.count}`)
    const cmRes = await db.calculatedMetric.deleteMany({ where: { code: { in: GROWTH_CM_CODES } } })
    console.log(`deleted CalculatedMetric rows: ${cmRes.count}`)
    const evRes = await db.financialEvent.deleteMany({ where: { eventType: { in: GROWTH_EVENT_TYPES } } })
    console.log(`deleted FinancialEvent rows: ${evRes.count}`)
    console.log(`done.`)
  }
} finally {
  await db.$disconnect()
}
