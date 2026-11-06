// Sample actual values behind the top audit findings + quarantine reasons.
import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()

function head(s) { console.log("\n=== " + s + " ===") }

async function sampleIssue(name, n = 6) {
  const run = await db.auditRun.findFirst({ orderBy: { startedAt: "desc" } })
  const rows = await db.auditIssue.findMany({
    where: { auditRunId: run.id, description: { startsWith: name } },
    take: n,
  })
  head(`SAMPLE ${name} (${rows.length})`)
  for (const r of rows) {
    const period = r.period
    const co = await db.company.findFirst({ where: { ticker: r.ticker }, select: { id: true, nameEn: true, sector: true } })
    const reports = await db.financialReport.findMany({
      where: { companyId: co.id, deletedAt: null, periodLabel: period },
      include: { values: { select: { metricCode: true, normalizedValue: true, unit: true, validationStatus: true, statementType: true } } },
      orderBy: [{ fiscalYear: "desc" }],
    })
    const merged = {}
    for (const rep of reports) for (const v of rep.values) merged[v.metricCode] = Math.round(v.normalizedValue)
    const pick = (codes) => Object.fromEntries(codes.map(c => [c, merged[c]]))
    const codes = name.includes("CASH_FLOW") ? ["OPERATING_CASH_FLOW","INVESTING_CASH_FLOW","FINANCING_CASH_FLOW","NET_CHANGE_IN_CASH","OPENING_CASH","CLOSING_CASH"]
      : name.includes("BALANCE_SHEET") ? ["TOTAL_ASSETS","TOTAL_LIABILITIES","TOTAL_EQUITY","CURRENT_ASSETS","NON_CURRENT_ASSETS","CURRENT_LIABILITIES","NON_CURRENT_LIABILITIES"]
      : name.includes("DEBT_COMPONENTS") ? ["SHORT_TERM_DEBT","LONG_TERM_DEBT","TOTAL_DEBT"]
      : name.includes("GROSS_PROFIT") ? ["REVENUE","COGS","GROSS_PROFIT"]
      : name.includes("PBT_TAX") ? ["PROFIT_BEFORE_TAX","INCOME_TAX","NET_PROFIT"]
      : ["REVENUE","NET_PROFIT","OPERATING_CASH_FLOW","DEPRECIATION_EXPENSE"]
    console.log(`\n${r.ticker} (${co.sector}) ${period}: ${r.description.slice(0, 120)}`)
    console.log("   reports:", reports.map(x => `${x.statementType}/${x.sourceName}`).join(" | "))
    console.log("   values:", pick(codes))
  }
}

try {
  for (const name of ["BALANCE_SHEET_EQUATION", "CASH_FLOW_SUM", "DEBT_COMPONENTS", "GROSS_PROFIT_IDENTITY", "PBT_TAX_NET_PROFIT"]) {
    await sampleIssue(name, 5)
  }

  head("Quarantine notes distribution")
  const qv = await db.financialValue.findMany({
    where: { validationNotes: { startsWith: "AUDIT_QUARANTINE" } },
    select: { validationNotes: true, metricCode: true },
  })
  const notes = new Map()
  for (const v of qv) {
    let n = v.validationNotes.replace("AUDIT_QUARANTINE:", "").trim()
    n = n.split(/[.;|]/)[0].slice(0, 90)
    notes.set(n, (notes.get(n) ?? 0) + 1)
  }
  for (const [k, v] of [...notes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(String(v).padStart(5), k)

  head("Quarantine by metric")
  const qm = new Map()
  for (const v of qv) qm.set(v.metricCode, (qm.get(v.metricCode) ?? 0) + 1)
  for (const [k, v] of [...qm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(String(v).padStart(5), k)

  head("Manual corrections")
  const mc = await db.financialValue.count({ where: { isManuallyCorrected: true } })
  console.log("manually corrected values:", mc)
  const mcBy = await db.financialValue.groupBy({ by: ["correctedBy"], where: { isManuallyCorrected: true }, _count: { _all: true } })
  for (const v of mcBy) console.log(String(v.correctedBy).padEnd(30), v._count._all)
} finally {
  await db.$disconnect()
}
