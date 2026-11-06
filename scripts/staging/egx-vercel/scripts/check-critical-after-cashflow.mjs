import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const run = await db.auditRun.findFirst({ orderBy: { startedAt: "desc" }, select: { id: true } })
  const counts = await db.$queryRawUnsafe(`SELECT severity, category, count(*) as n FROM AuditIssue WHERE auditRunId = ? GROUP BY severity, category ORDER BY n DESC`, run.id)
  console.log("COUNTS", counts.map(r => `${r.severity}/${r.category}=${Number(r.n)}`).join(" "))
  const rows = await db.$queryRawUnsafe(`SELECT ticker, period, category, severity, description FROM AuditIssue WHERE auditRunId = ? AND severity = 'critical' ORDER BY ticker`, run.id)
  const by = new Map()
  for (const r of rows) { const code = String(r.description).split(":")[0]; by.set(code, (by.get(code)??0)+1) }
  console.log("CODES", [...by.entries()].sort((a,b)=>b[1]-a[1]).map(([c,n])=>`${c}=${n}`).join(" "))
  for (const r of rows) console.log(`${r.ticker} ${r.period ?? ""} [${r.category}] ${String(r.description).slice(0,190)}`)
} finally { await db.$disconnect() }
