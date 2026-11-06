/* MHOT surgical repair round 2 — GP & PBT & interest. Evidence-guarded.
   A. DELETE GROSS_PROFIT FY2017-2020 (Excel importer duplicated/synthesized GP:
      FY2017/18/19 GP == REVENUE to the cent; FY2020 GP == REVENUE/2 to the cent — impossible margins)
   B. DELETE GROSS_PROFIT FY2021 8.27M (AskBorsa cell "8.27K" garbage; 22x below COVID trough; no source to replace)
   C. KEEP GROSS_PROFIT FY2022 459,811,960 — CORRECT (AskBorsa 460M; quarter sum 458.9M)
   D. PBT FY2023 sign flip −999,288,548 → +999,288,548 (NP +819.76M positive; implied ET 18%)
   E. INTEREST_EXPENSE FY2022 ÷1000 (99.03B > revenue 500x) → 99,034,415 */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()

;(async () => {
  const c = await db.company.findUnique({ where: { ticker: "MHOT" }, select: { id: true } })
  const log = []
  async function reportOf(periodType, label) {
    return db.financialReport.findFirst({ where: { companyId: c.id, periodType, periodLabel: label, statementType: "CONSOLIDATED" }, select: { id: true } })
  }
  async function deleteIf(rep, code, expectedEq) {
    if (!rep) { log.push(`MISS-REPORT ${code}`); return }
    const v = await db.financialValue.findFirst({ where: { reportId: rep.id, metricCode: code }, select: { id: true, normalizedValue: true } })
    if (!v) { log.push(`MISS ${code}`); return }
    if (expectedEq != null && Math.abs(v.normalizedValue - expectedEq) > 0.01) { log.push(`GUARD-SKIP ${code}: ${v.normalizedValue} != ${expectedEq}`); return }
    await db.financialValue.delete({ where: { id: v.id } })
    log.push(`DELETED ${code} = ${v.normalizedValue}`)
  }
  async function fixUnit(rep, code, from, to) {
    const v = await db.financialValue.findFirst({ where: { reportId: rep.id, metricCode: code }, select: { id: true, normalizedValue: true } })
    if (!v) { log.push(`MISS ${code}`); return }
    if (Math.abs(v.normalizedValue - from) > Math.abs(from) * 0.001) { log.push(`GUARD-SKIP ${code}: stored ${v.normalizedValue} != ${from}`); return }
    await db.financialValue.update({ where: { id: v.id }, data: { normalizedValue: to, value: to } })
    log.push(`UNIT ${code}: ${from} -> ${to}`)
  }

  // A. Synthetic Excel GP rows (2017-2020)
  for (const [label, eq] of [["FY 2017", 144727360.43], ["FY 2018", 422102878.56], ["FY 2019", 400255117.15], ["FY 2020", 177243816.47]]) {
    await deleteIf(await reportOf("ANNUAL", label), "GROSS_PROFIT", eq)
  }
  // B. AskBorsa FY2021 GP garbage cell
  await deleteIf(await reportOf("ANNUAL", "FY 2021"), "GROSS_PROFIT", 8270000)
  // D. PBT FY2023 sign flip
  await fixUnit(await reportOf("ANNUAL", "FY 2023"), "PROFIT_BEFORE_TAX", -999288548, 999288548)
  // E. Interest expense FY2022 ÷1000
  await fixUnit(await reportOf("ANNUAL", "FY 2022"), "INTEREST_EXPENSE", 99034415000, 99034415)

  console.log(log.join("\n"))
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
