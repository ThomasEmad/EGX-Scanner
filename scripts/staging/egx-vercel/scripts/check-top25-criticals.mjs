import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const api = await fetch("http://localhost:3000/api/v1/rankings?metric=roe&basis=latest").then(r=>r.json())
  const top = api.results.slice(0,25).map(r=>r.ticker)
  const run = await db.auditRun.findFirst({ orderBy: { startedAt: "desc" }, select: { id: true } })
  const rows = await db.$queryRawUnsafe(`SELECT ticker, severity, description FROM AuditIssue WHERE auditRunId = ? AND severity = 'critical'`, run.id)
  const hits = rows.filter(r => top.includes(r.ticker))
  console.log("TOP25", top.join(","))
  console.log("TOP25 CRITICALS", hits.length)
  for (const h of hits) console.log(h.ticker, String(h.description).slice(0,160))
} finally { await db.$disconnect() }
