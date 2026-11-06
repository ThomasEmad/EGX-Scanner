import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const rows = await db.financialValue.findMany({
    where: { originalLabel: { startsWith: "COPIED from" }, validationStatus: { not: "FAILED" } },
    select: { metricCode: true, validationStatus: true, report: { select: { periodType: true, periodLabel: true, fiscalYear: true } } },
  })
  const byPeriod = new Map()
  for (const r of rows) {
    const k = r.report.periodType
    if (!byPeriod.has(k)) byPeriod.set(k, { total: 0, valid: 0 })
    const o = byPeriod.get(k); o.total++; if (r.validationStatus === "VALID") o.valid++
  }
  console.log("COPIED by period type:")
  for (const [k, v] of [...byPeriod.entries()].sort((a, b) => b[1].total - a[1].total)) console.log(k.padEnd(12), v)

  const staticCodes = new Set(["SHARE_CAPITAL", "SHARES_OUTSTANDING", "TREASURY_SHARES", "PAR_VALUE"])
  const nonStatic = rows.filter(r => !staticCodes.has(r.metricCode))
  console.log("\nnon-static copied values:", nonStatic.length, "| static (whitelisted):", rows.length - nonStatic.length)

  const perCompany = new Map()
  for (const r of rows) { /* need company */ }
  const withCompany = await db.financialValue.findMany({
    where: { originalLabel: { startsWith: "COPIED from" }, validationStatus: "VALID" },
    select: { company: { select: { ticker: true } }, metricCode: true },
  })
  const co = new Map()
  for (const r of withCompany) co.set(r.company.ticker, (co.get(r.company.ticker) ?? 0) + 1)
  console.log("\ncompanies with VALID copied values:", co.size, "of 264")
  console.log("top 15:", [...co.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([t, n]) => `${t}=${n}`).join(", "))
} finally { await db.$disconnect() }
