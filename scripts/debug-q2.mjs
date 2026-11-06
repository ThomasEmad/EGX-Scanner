// trace: replicate planFromSnapshot for ABUK only, print Q2 2026 handling
import { readFileSync } from "node:fs"
import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const snap = JSON.parse(readFileSync("reports/tv-financials-snapshot.json", "utf8"))
const rec = snap.companies.ABUK

const comp = await db.company.findUnique({ where: { ticker: "ABUK" } })
const rep = await db.financialReport.findFirst({
  where: { companyId: comp.id, periodType: "QUARTERLY", periodLabel: "Q2 2026", statementType: "CONSOLIDATED", deletedAt: null },
  select: { id: true, processingStatus: true, periodEnd: true },
})
console.log("existing report Q2 2026:", JSON.stringify(rep))
const vals = await db.financialValue.findMany({ where: { reportId: rep.id }, select: { metricCode: true } })
console.log("existing values:", vals.map((v) => v.metricCode).join(","))

// check conflicts JSON for Q2 2026 mentions
const conflicts = JSON.parse(readFileSync("reports/tv-financials-conflicts.json", "utf8")).conflicts.filter((c) => c.ticker === "ABUK" && c.period === "Q2 2026")
console.log("conflicts on Q2 2026:", conflicts.length)
for (const c of conflicts.slice(0, 5)) console.log("  ", c.metric, c.existing, "→", c.tv)
await db.$disconnect()
