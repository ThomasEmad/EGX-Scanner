// Post-deletion verification: event-type distribution + CM code distribution.
import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const ev = await db.financialEvent.groupBy({ by: ["eventType"], _count: { _all: true } })
  console.log("FinancialEvent types:")
  for (const e of ev.sort((a, b) => b._count._all - a._count._all)) console.log(`  ${e.eventType}: ${e._count._all}`)
  const cm = await db.calculatedMetric.groupBy({ by: ["code"], _count: { _all: true } })
  console.log("CalculatedMetric codes:")
  for (const c of cm.sort((a, b) => b._count._all - a._count._all)) console.log(`  ${c.code}: ${c._count._all}`)
  const presets = await db.scannerRule.findMany({ where: { isPreset: true }, select: { presetKey: true, isActive: true }, orderBy: { presetKey: "asc" } })
  console.log("preset rules:")
  for (const p of presets) console.log(`  ${p.presetKey}: isActive=${p.isActive}`)
} finally {
  await db.$disconnect()
}
