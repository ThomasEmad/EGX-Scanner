import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const tickers = ["ELKA","MHOT","GRCA","SCFM","PRCL","AALR","ALEX","UASG","COPR","EGAS","SIPC","GSSC","UNIT","OFH"]
try {
  const run = await db.auditRun.findFirst({ orderBy: { startedAt: "desc" } })
  console.log("LATEST RUN", run.id, run.startedAt, run.status, run.issuesFound)
  const scores = await db.companyConfidenceScore.findMany({ where: { auditRunId: run.id }, select: { ticker: true, score: true, rating: true, breakdownJson: true } })
  const parsed = scores.map(s => ({ ...s, b: JSON.parse(s.breakdownJson) }))
  const certs = parsed.reduce((a, s) => { a[s.b.certification] = (a[s.b.certification] ?? 0) + 1; return a }, {})
  console.log("CERTIFICATION", certs, "TOTAL", parsed.length)
  console.log("AVG SCORE", (parsed.reduce((a,s)=>a+s.score,0)/parsed.length).toFixed(1))
  const issues = await db.auditIssue.findMany({ where: { auditRunId: run.id }, select: { ticker: true, severity: true, category: true, description: true } })
  const codeOf = (d) => (d.match(/^\[([A-Z0-9_]+)\]/) ?? [])[1] ?? "UNKNOWN"
  const crit = issues.filter(i => i.severity === "critical")
  const byCode = crit.reduce((a, i) => { const c = codeOf(i.description); a[c] = (a[c] ?? 0) + 1; return a }, {})
  console.log("CRITICAL BY CODE", Object.entries(byCode).sort((a,b)=>b[1]-a[1]).slice(0,25))
  console.log("\nCORRECTED TICKERS")
  for (const t of tickers) {
    const s = parsed.find(x => x.ticker === t)
    const fs = issues.filter(i => i.ticker === t)
    const crits = fs.filter(i => i.severity === "critical").map(i => codeOf(i.description))
    const highs = fs.filter(i => i.severity === "high").map(i => codeOf(i.description))
    console.log(`${t} | score=${s?.score} rating=${s?.rating} cert=${s?.b?.certification} blockers=${s?.b?.blockerCount} | critical=${crits.length} ${[...new Set(crits)].slice(0,8).join(",")} | high=${highs.length} ${[...new Set(highs)].slice(0,8).join(",")}`)
  }
  console.log("\nLATEST ROE / ANNUAL ROE")
  for (const t of tickers) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true, sector: true } })
    if (!c) continue
    const rows = await db.calculatedMetric.findMany({ where: { companyId: c.id, code: "roe", value: { not: null } }, orderBy: [{ fiscalYear: "desc" }], select: { value: true, periodLabel: true, periodType: true } })
    console.log(t, c.sector, rows.slice(0, 4).map(r => `${r.periodLabel}:${r.value?.toFixed(2)}`).join(" | "))
  }
} finally { await db.$disconnect() }
