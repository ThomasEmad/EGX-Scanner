/* MHOT repair round 3 — EBIT & EBITDA rows from Yahoo.
   Yahoo's "EBITDA" rows for MHOT are actually EBIT (= PBT + interest, verified to the cent
   on FY2022), with FY2023/FY2024 built on the sign-broken PBT. No D&A rows exist anywhere,
   so true EBITDA is not computable → delete EBITDA, rebuild EBIT from the identity. */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()

;(async () => {
  const c = await db.company.findUnique({ where: { ticker: "MHOT" }, select: { id: true } })
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

  // EBIT FY2022: ÷1000 — equals PBT(275,349,823) + interest(99,034,415) = 374,384,238
  await fix(await reportOf("FY 2022"), "EBIT", 374384238000, 374384238)
  // EBIT FY2023: rebuilt = corrected PBT(999,288,548) + interest(143,793,027) = 1,143,081,575
  await fix(await reportOf("FY 2023"), "EBIT", -855495521, 1143081575)
  // EBIT FY2024: rebuilt = PBT(1,869,813,380) + interest(119,648,282) = 1,989,461,662
  await fix(await reportOf("FY 2024"), "EBIT", -1750165098, 1989461662)
  // EBITDA rows: actually EBIT mislabeled; 2 of 3 sign-broken; no D&A data → not computable
  for (const label of ["FY 2022", "FY 2023", "FY 2024"]) await del(await reportOf(label), "EBITDA")

  console.log(log.join("\n"))
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
