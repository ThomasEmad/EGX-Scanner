import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()

function head(s) { console.log("\n=== " + s + " ===") }

try {
  head("Zero values on never-zero metrics")
  const neverZero = ["TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY", "REVENUE", "COGS", "SHORT_TERM_DEBT", "LONG_TERM_DEBT"]
  for (const code of neverZero) {
    const n = await db.financialValue.count({ where: { metricCode: code, normalizedValue: 0, validationStatus: { not: "FAILED" } } })
    const total = await db.financialValue.count({ where: { metricCode: code, validationStatus: { not: "FAILED" } } })
    console.log(code.padEnd(22), "zeros:", String(n).padStart(5), "/", total)
  }
  const zeroQ = await db.$queryRaw`SELECT metricCode, COUNT(*) n FROM FinancialValue WHERE normalizedValue = 0 AND validationStatus != 'FAILED' GROUP BY metricCode ORDER BY n DESC LIMIT 15`
  console.log("top zero metrics:", zeroQ)

  head("TOTAL_DEBT values whose original label is net debt")
  const netDebt = await db.financialValue.count({ where: { metricCode: "TOTAL_DEBT", originalLabel: { contains: "net debt" } } })
  console.log("net-debt mislabeled as TOTAL_DEBT:", netDebt)
  const tdLabels = await db.financialValue.groupBy({ by: ["originalLabel"], where: { metricCode: "TOTAL_DEBT" }, _count: { _all: true } })
  for (const x of tdLabels.sort((a, b) => b._count._all - a._count._all).slice(0, 12)) console.log(String(x._count._all).padStart(5), x.originalLabel)

  head("Reports per period label (same company+label+basis) — source mixing potential")
  const reports = await db.financialReport.findMany({ where: { deletedAt: null }, select: { id: true, companyId: true, periodLabel: true, statementType: true, sourceName: true, periodType: true } })
  const groups = new Map()
  for (const r of reports) {
    const k = r.companyId + "|" + r.periodLabel + "|" + r.statementType
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  }
  let multi = 0, multiSource = 0
  for (const rs of groups.values()) {
    if (rs.length > 1) { multi++; if (new Set(rs.map(r => r.sourceName)).size > 1) multiSource++ }
  }
  console.log("period groups:", groups.size, "| >1 report:", multi, "| >1 source:", multiSource)

  head("TOTAL_EQUITY_AND_LIABILITIES availability by period")
  const teal = await db.financialValue.count({ where: { metricCode: "TOTAL_EQUITY_AND_LIABILITIES", validationStatus: { not: "FAILED" } } })
  console.log("TEAL usable values:", teal)

  head("NON_CONTROLLING_INTERESTS usable values by report")
  console.log("NCI usable:", await db.financialValue.count({ where: { metricCode: "NON_CONTROLLING_INTERESTS", validationStatus: { not: "FAILED" } } }))

  head("NET_DEBT metric in MetricDefinition")
  const nd = await db.metricDefinition.findMany({ where: { code: { contains: "DEBT" } }, select: { code: true } })
  console.log(nd.map(x => x.code))
} finally { await db.$disconnect() }
