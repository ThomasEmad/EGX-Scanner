// Deep data-quality diagnostics: what are the issues really made of?
import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()

function head(s) { console.log("\n=== " + s + " ===") }

try {
  const run = await db.auditRun.findFirst({ orderBy: { startedAt: "desc" } })
  if (!run) { console.log("no run"); process.exit(0) }

  head("1. Issues by check name × severity (latest run)")
  const issues = await db.auditIssue.findMany({
    where: { auditRunId: run.id },
    select: { ticker: true, severity: true, description: true, category: true, metricCode: true, period: true },
  })
  const byCheck = new Map()
  for (const i of issues) {
    let name = i.description.split(/[:.(]/)[0].trim()
    if (name.length > 60) name = name.slice(0, 60)
    const key = name + " | " + i.severity
    byCheck.set(key, (byCheck.get(key) ?? 0) + 1)
  }
  for (const [k, v] of [...byCheck.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
    console.log(String(v).padStart(5), k)
  }

  head("2. Confidence distribution")
  const scores = await db.companyConfidenceScore.findMany({ orderBy: { score: "asc" } })
  const bands = { critical: 0, low: 0, medium: 0, high: 0 }
  for (const s of scores) bands[s.rating] = (bands[s.rating] ?? 0) + 1
  console.log(bands)
  console.log("lowest 15:", scores.slice(0, 15).map(s => `${s.ticker}=${s.score}(${s.rating})`).join(", "))
  const avg = Math.round(scores.reduce((a, s) => a + s.score, 0) / (scores.length || 1))
  console.log("average score:", avg, "| companies:", scores.length)

  head("3. Issues per company (top 15)")
  const perCo = new Map()
  for (const i of issues) perCo.set(i.ticker, (perCo.get(i.ticker) ?? 0) + 1)
  for (const [t, n] of [...perCo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(String(n).padStart(5), t)

  head("4. Duplicate reports per company+periodLabel (consolidation / version mixing)")
  const reports = await db.financialReport.findMany({
    where: { deletedAt: null },
    select: { id: true, companyId: true, periodLabel: true, periodType: true, statementType: true,
              version: true, isRestatement: true, fiscalYear: true, periodEnd: true,
              sourceName: true, processingStatus: true, extractionMethod: true },
  })
  const groups = new Map()
  for (const r of reports) {
    const k = r.companyId + "|" + r.periodLabel
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  }
  let dupGroups = 0, dupMixed = 0
  const examples = []
  for (const [k, rs] of groups) {
    if (rs.length > 1) {
      dupGroups++
      const types = new Set(rs.map(r => r.statementType))
      const srcs = new Set(rs.map(r => r.sourceName))
      if (types.size > 1 || srcs.size > 1) {
        dupMixed++
        if (examples.length < 10) examples.push(`${k} → ${rs.map(r => `${r.statementType}/${r.sourceName}/v${r.version}`).join(" , ")}`)
      }
    }
  }
  console.log("groups with >1 report:", dupGroups, "| of which mixed stmt/source:", dupMixed)
  for (const e of examples) console.log("  ", e)

  head("5. Values by validation status")
  const vals = await db.financialValue.groupBy({ by: ["validationStatus"], _count: { _all: true } })
  for (const v of vals) console.log(v.validationStatus.padEnd(14), v._count._all)
  const quarantined = await db.financialValue.count({ where: { validationNotes: { startsWith: "AUDIT_QUARANTINE" } } })
  console.log("quarantined:", quarantined)

  head("6. Reports by processing status / extraction method")
  const rps = await db.financialReport.groupBy({ by: ["processingStatus"], where: { deletedAt: null }, _count: { _all: true } })
  for (const v of rps) console.log(v.processingStatus.padEnd(18), v._count._all)
  const rms = await db.financialReport.groupBy({ by: ["extractionMethod"], where: { deletedAt: null }, _count: { _all: true } })
  for (const v of rms) console.log(String(v.extractionMethod).padEnd(18), v._count._all)

  head("7. Latest fiscal year coverage")
  const companies = await db.company.findMany({ where: { isActive: true }, select: { ticker: true, id: true } })
  const fyByCo = new Map()
  for (const r of reports) {
    if (r.periodType !== "ANNUAL") continue
    const cur = fyByCo.get(r.companyId) ?? 0
    if (r.fiscalYear > cur) fyByCo.set(r.companyId, r.fiscalYear)
  }
  const fyDist = new Map()
  for (const c of companies) {
    const fy = fyByCo.get(c.id) ?? 0
    fyDist.set(fy, (fyDist.get(fy) ?? 0) + 1)
  }
  for (const [fy, n] of [...fyDist.entries()].sort((a, b) => b[0] - a[0])) console.log("latest annual FY", fy, "→", n, "companies")
} finally {
  await db.$disconnect()
}
