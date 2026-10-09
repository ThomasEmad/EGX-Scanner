/* READ-ONLY verify: confirm the fleet + EGAL + MAAL repairs landed and growth is sane.
   Usage: node --env-file=.env scripts/verify-unit-fix.cjs */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const CASES = [
  { t: "EGAL", code: "REVENUE", fy: 2022 },
  { t: "GSSC", code: "GROSS_PROFIT", label: "Q1 2024" },
  { t: "GSSC", code: "REVENUE", fy: 2024 },
  { t: "MAAL", code: "COGS", fy: 2022 },
  { t: "MAAL", code: "REVENUE", fy: 2021 },
  { t: "MAAL", code: "TOTAL_ASSETS", fy: 2022 },
  { t: "MHOT", code: "REVENUE", fy: 2022 },
  { t: "UEGC", code: "TOTAL_ASSETS", fy: 2021 },
]
;(async () => {
  for (const c of CASES) {
    const co = await db.company.findFirst({ where: { ticker: c.t }, select: { id: true } })
    if (!co) { console.log(`${c.t}: no company`); continue }
    const where = { companyId: co.id, metricCode: c.code, report: { periodType: c.label ? "QUARTERLY" : "ANNUAL" } }
    if (c.label) where.report.periodLabel = c.label; else where.report.fiscalYear = c.fy
    const v = await db.financialValue.findFirst({ where, select: { normalizedValue: true, report: { select: { periodLabel: true } } }, orderBy: { report: { periodEnd: "asc" } } })
    console.log(`${c.t.padEnd(5)} ${c.code.padEnd(16)} ${(v?.report?.periodLabel || "?").padEnd(9)} = ${(v ? (v.normalizedValue / 1e6).toFixed(1) + "M" : "MISSING")}`)
  }
  // EGAL revenue growth FY2022/FY2023 should now be sane (not 220B). FY2024 = 48.85% expected.
  const eg = await db.company.findFirst({ where: { ticker: "EGAL" }, select: { id: true } })
  const g = await db.calculatedMetric.findMany({ where: { companyId: eg.id, code: "revenue_growth" }, select: { periodLabel: true, value: true }, orderBy: { fiscalYear: "asc" } })
  console.log("\nEGAL revenue_growth:")
  for (const x of g.filter((z) => /2022|2023|2024/.test(z.periodLabel))) {
    console.log(`  ${x.periodLabel}: ${x.value == null ? "n/a" : (x.value).toFixed(2)}`)
  }
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })

