/* GSSC repair — internal-consistency proofs only (source JSON checked: Excel values are
   FX-conversion artifacts of 2-decimal raw cells, so cross-company equality is expected noise;
   but ×1000 mismatches WITHIN the same report are provable):
   EBIT FY2024 363,185,381,000 → 363,185,381 (EBITDA row in same report = 363,185,381 exactly)
   EBIT FY2025 426,867,885,920 → 426,867,885.92 (EBITDA row = 426,867,885.92 exactly)
   INTEREST FY2024 64,782,236,000 → 64,782,236 (PBT 298,403,145 + 64,782,236 = EBIT 363,185,381 ✓)
   INTEREST FY2025 84,463,074,840 → 84,463,074.84 (PBT 342,404,811.08 + 84,463,074.84 = EBITDA 426,867,885.92 ✓)
   EBITDA rows deleted: equal PBT+interest to the cent = EBIT mislabeled (same disease as MHOT) */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()

;(async () => {
  const c = await db.company.findFirst({ where: { id: { endsWith: "u47d" } }, select: { id: true } })
  const log = []
  async function reportOf(label) {
    return db.financialReport.findFirst({ where: { companyId: c.id, periodType: "ANNUAL", periodLabel: label, statementType: "CONSOLIDATED" }, select: { id: true } })
  }
  async function fix(rep, code, from, to) {
    const v = await db.financialValue.findFirst({ where: { reportId: rep.id, metricCode: code }, select: { id: true, normalizedValue: true } })
    if (!v) { log.push(`MISS ${code}`); return }
    if (Math.abs(v.normalizedValue - from) > Math.abs(from) * 0.001) { log.push(`GUARD-SKIP ${code}: stored ${v.normalizedValue} != ${from}`); return }
    await db.financialValue.update({ where: { id: v.id }, data: { normalizedValue: to, value: to } })
    log.push(`UNIT ${code}: ${from} -> ${to}`)
  }
  async function del(rep, code) {
    const vs = await db.financialValue.findMany({ where: { reportId: rep.id, metricCode: code }, select: { id: true, normalizedValue: true } })
    for (const v of vs) { await db.financialValue.delete({ where: { id: v.id } }); log.push(`DELETED ${code} = ${v.normalizedValue}`) }
  }

  await fix(await reportOf("FY 2024"), "EBIT", 363185381000, 363185381)
  await fix(await reportOf("FY 2025"), "EBIT", 426867885920, 426867885.92)
  await fix(await reportOf("FY 2024"), "INTEREST_EXPENSE", 64782236000, 64782236)
  await fix(await reportOf("FY 2025"), "INTEREST_EXPENSE", 84463074840, 84463074.84)
  for (const label of ["FY 2024", "FY 2025"]) await del(await reportOf(label), "EBITDA")

  console.log(log.join("\n"))
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
