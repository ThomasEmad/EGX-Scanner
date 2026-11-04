import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const run = await db.auditRun.findFirst({ orderBy: { startedAt: "desc" }, select: { id: true } })
  const issues = await db.auditIssue.findMany({ where: { runId: run.id, severity: "CRITICAL" }, select: { code: true, companyId: true, periodLabel: true, message: true } })
  const by = new Map()
  for (const i of issues) by.set(i.code, (by.get(i.code) ?? 0) + 1)
  console.log("CRITICAL CODES:", [...by.entries()].sort((a,b)=>b[1]-a[1]).map(([c,n])=>`${c}=${n}`).join(" "))
  for (const t of ["EAST","EGAL","CANA","SIPC","BQDC","IRON","UNIT"]) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true } })
    const rows = await db.calculatedMetric.findMany({ where: { companyId: c.id, code: { in: ["roe","roa"] }, periodType: { in: ["ANNUAL","TTM"] } }, orderBy: [{ fiscalYear: "desc" }, { periodType: "asc" }], select: { code: true, periodLabel: true, periodType: true, value: true, valueStatus: true } })
    console.log(`${t}: ${rows.slice(0,6).map(r=>`${r.code}/${r.periodLabel}=${r.value}(${r.valueStatus})`).join(" | ")}`)
  }
} finally { await db.$disconnect() }
