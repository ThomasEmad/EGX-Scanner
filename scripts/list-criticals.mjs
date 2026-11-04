import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const run = await db.auditRun.findFirst({ orderBy: { startedAt: "desc" } })
  const issues = await db.auditIssue.findMany({ where: { auditRunId: run.id, severity: "critical" }, select: { ticker: true, category: true, description: true, period: true, metricCode: true, currentValue: true, expectedValue: true } })
  const codeOf = (d) => (d.match(/^\[([A-Z0-9_]+)\]/) ?? [])[1] ?? "UNKNOWN"
  const groups = new Map()
  for (const i of issues) {
    const c = codeOf(i.description)
    if (!groups.has(c)) groups.set(c, [])
    groups.get(c).push(i)
  }
  for (const [code, list] of [...groups.entries()].sort((a,b)=>b[1].length-a[1].length)) {
    console.log(`\n### ${code} (${list.length})`)
    for (const i of list) console.log(`${i.ticker} ${i.period ?? ""} ${i.metricCode ?? ""} | ${i.description.slice(0,240)} | cur=${i.currentValue} exp=${i.expectedValue}`)
  }
} finally { await db.$disconnect() }
