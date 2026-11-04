import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const run = await db.auditRun.findFirst({ orderBy: { startedAt: "desc" }, select: { id: true } })
  console.log("RUN", run.id)
  const counts = await db.$queryRawUnsafe(`SELECT severity, category, count(*) as n FROM AuditIssue WHERE auditRunId = ? GROUP BY severity, category ORDER BY n DESC`, run.id)
  console.log("COUNTS", counts.map(r => `${r.severity}/${r.category}=${Number(r.n)}`).join(" "))
  const rows = await db.$queryRawUnsafe(`SELECT ticker, period, category, severity, description FROM AuditIssue WHERE auditRunId = ? AND severity = 'critical' ORDER BY ticker LIMIT 100`, run.id)
  for (const r of rows) console.log(`${r.ticker} ${r.period ?? ""} [${r.category}] ${String(r.description).slice(0,220)}`)
  for (const t of ["EAST","EGAL","CANA","SIPC","BQDC","IRON","UNIT"]) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true } })
    const cm = await db.calculatedMetric.findMany({ where: { companyId: c.id, code: { in: ["roe","roa"] }, periodType: { in: ["ANNUAL","TTM"] } }, orderBy: [{ fiscalYear: "desc" }, { periodType: "asc" }], select: { code: true, periodLabel: true, periodType: true, value: true, valueStatus: true } })
    console.log(`${t}: ${cm.slice(0,6).map(r=>`${r.code}/${r.periodLabel}=${r.value}(${r.valueStatus})`).join(" | ")}`)
  }
} finally { await db.$disconnect() }
