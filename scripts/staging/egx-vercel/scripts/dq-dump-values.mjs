import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()

async function dump(ticker, periodLabel) {
  const co = await db.company.findFirst({ where: { ticker } })
  const reps = await db.financialReport.findMany({
    where: { companyId: co.id, deletedAt: null, periodLabel },
    include: { values: { where: { subPeriod: "CURRENT" }, select: { metricCode: true, originalLabel: true, normalizedValue: true, unit: true, validationStatus: true, validationNotes: true } } },
  })
  console.log(`\n===== ${ticker} ${periodLabel} =====`)
  for (const r of reps) {
    console.log(`-- ${r.statementType}/${r.sourceName} v${r.version} ${r.periodType}`)
    for (const v of r.values.sort((a,b)=>a.metricCode.localeCompare(b.metricCode))) {
      console.log(`   ${v.metricCode.padEnd(32)} ${Math.round(v.normalizedValue).toString().padStart(18)}  ${v.unit.padEnd(8)} "${v.originalLabel}" ${v.validationStatus} ${v.validationNotes?.slice(0,30) ?? ""}`)
    }
  }
}

try {
  await dump("AALR", "FY 2025")
  await dump("ACGC", "FY 2023")
  await dump("ABUK", "Q1 2026")
  await dump("AMER", "FY 2022")
  await dump("AMOC", "FY 2020")
  const cnt = await db.financialValue.count({ where: { metricCode: "TOTAL_EQUITY_AND_LIABILITIES", validationStatus: { not: "FAILED" } } })
  const cnt2 = await db.financialValue.count({ where: { metricCode: "NON_CONTROLLING_INTERESTS", validationStatus: { not: "FAILED" } } })
  const cnt3 = await db.financialValue.count({ where: { metricCode: "FX_EFFECT_CASH", validationStatus: { not: "FAILED" } } })
  console.log("\nTOTAL_EQUITY_AND_LIABILITIES values:", cnt, "| NCI:", cnt2, "| FX_EFFECT_CASH:", cnt3)
} finally { await db.$disconnect() }
