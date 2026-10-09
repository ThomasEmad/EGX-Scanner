import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const TRUSTED = ["VALIDATED", "APPROVED", "EXTRACTED"]
const reps = await db.financialReport.findMany({
  where: { periodType: "ANNUAL", processingStatus: { in: TRUSTED } },
  select: { id: true, companyId: true, fiscalYear: true, statementType: true, sourceName: true, periodLabel: true, _count: { select: { values: true } } },
  orderBy: { companyId: "asc" },
})
// group by company+fy+stmt
const groups = new Map()
for (const r of reps) {
  const k = `${r.companyId}|${r.fiscalYear}|${r.statementType}`
  if (!groups.has(k)) groups.set(k, [])
  groups.get(k).push(r)
}
let conflicts = 0, companies = new Set(), bySource = {}
const examples = []
for (const [k, g] of groups) {
  if (g.length < 2) continue
  conflicts++
  companies.add(g[0].companyId)
  const key = g.map(x => x.sourceName.slice(0, 10)).sort().join("+")
  bySource[key] = (bySource[key] || 0) + 1
  if (examples.length < 12) examples.push(g.map(x => `${x.periodLabel}(${x.sourceName.slice(0,10)},${x._count.values}v,${x.id.slice(-6)})`).join(" || "))
}
console.log(JSON.stringify({ conflictGroups: conflicts, companiesAffected: companies.size, bySourcePattern: bySource }, null, 1))
console.log("examples:")
examples.slice(0, 10).forEach(e => console.log("  " + e))
await db.$disconnect()
