/* MHOT surgical repair — every edit carries named evidence. July-FY company (FY ends Jun 30).
   1. Unit fixes: FY2025 NP ×10; FY2018/19/21/22 + 2022 quarters ÷1000; FY2025 CF rows ÷1 (thousands→units)
   2. Collapsed periodEnds (AskBorsa importer defaulted quarters to fiscal-year-end)
   3. Derive NET_PROFIT = PROFIT_BEFORE_TAX − INCOME_TAX where absent (same-row identity)
   Untouched on purpose: Q3 2025 / Q3 2026 (TV rows self-contradictory: NI vs PBT−tax, GP vs rev−COGS) */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()

;(async () => {
  const c = await db.company.findUnique({ where: { ticker: "MHOT" }, select: { id: true } })
  const log = []

  async function reportOf(periodType, label) {
    return db.financialReport.findFirst({ where: { companyId: c.id, periodType, periodLabel: label, statementType: "CONSOLIDATED" }, select: { id: true, periodEnd: true } })
  }
  async function fixUnit(rep, code, from, to, evidence) {
    const v = await db.financialValue.findFirst({ where: { reportId: rep.id, metricCode: code }, select: { id: true, normalizedValue: true } })
    if (!v) { log.push(`MISS ${rep.id} ${code}`); return }
    if (Math.abs(v.normalizedValue - from) > Math.abs(from) * 0.001) { log.push(`GUARD-SKIP ${code}: stored ${v.normalizedValue} != expected ${from}`); return }
    await db.financialValue.update({ where: { id: v.id }, data: { normalizedValue: to, value: to } })
    log.push(`UNIT ${code}: ${from} -> ${to}`)
  }

  // ---- 1. Unit fixes ----
  // FY2025 (Yahoo): NP/NET_PROFIT_PARENT ×10; CF rows stored in thousands
  const fy25 = await reportOf("ANNUAL", "FY 2025")
  // Evidence: same-report PBT=1.86B (implied ET 25.3%), AskBorsa NP=1.39B, equity walk 2.51B→3.37B
  await fixUnit(fy25, "NET_PROFIT", 138939316, 1389393160)
  await fixUnit(fy25, "NET_PROFIT_PARENT", 138939316, 1389393160)
  await fixUnit(fy25, "FINANCING_CASH_FLOW", -554796, -554796000)
  await fixUnit(fy25, "INVESTING_CASH_FLOW", 86289, 86289000)
  await fixUnit(fy25, "FREE_CASH_FLOW", 1280355, 1280355000)

  // FY2022 annual ÷1000 — AskBorsa 351M; quarter-sum 350.48M reconciles
  const fy22 = await reportOf("ANNUAL", "FY 2022")
  await fixUnit(fy22, "NET_PROFIT", 350608570000, 350608570)
  // FY2021 annual ÷1000 — AskBorsa −183M; COVID year; TA bound 1.7B
  const fy21 = await reportOf("ANNUAL", "FY 2021")
  await fixUnit(fy21, "NET_PROFIT", -183000000000, -183000000)
  // FY2018/2019 ÷1000 — NP exceeded total assets by 100x; Refinitiv USD-standardization disease
  const fy18 = await reportOf("ANNUAL", "FY 2018")
  if (fy18) await fixUnit(fy18, "NET_PROFIT", 211051439280, 211051439.28)
  const fy19 = await reportOf("ANNUAL", "FY 2019")
  if (fy19) await fixUnit(fy19, "NET_PROFIT", 200127558580, 200127558.58)
  // 2022 quarters ÷1000 — corrected sum 66+85.13+123+76.35 = 350.48M = FY2022 annual
  for (const [label, from, to] of [["Q1 2022", 66000000000, 66000000], ["Q2 2022", 85130000000, 85130000], ["Q3 2022", 123000000000, 123000000], ["Q4 2022", 76350000000, 76350000]]) {
    const q = await reportOf("QUARTERLY", label)
    if (q) await fixUnit(q, "NET_PROFIT", from, to)
  }

  // ---- 2. Collapsed periodEnds (July-FY calendar) ----
  const peFixes = [
    ["ANNUAL", "FY 2021", "2021-06-30"],
    ["QUARTERLY", "Q2 2022", "2021-12-31"],
    ["QUARTERLY", "Q2 2023", "2022-12-31"],
    ["QUARTERLY", "Q3 2023", "2023-03-31"],
    ["QUARTERLY", "Q2 2024", "2023-12-31"],
    ["QUARTERLY", "Q3 2024", "2024-03-31"],
  ]
  for (const [pt, label, date] of peFixes) {
    const r = await reportOf(pt, label)
    if (!r) { log.push(`MISS-REPORT ${pt} ${label}`); continue }
    if (String(r.periodEnd).slice(0, 10) === date) { log.push(`PE-OK ${label}`); continue }
    await db.financialReport.update({ where: { id: r.id }, data: { periodEnd: new Date(date) } })
    log.push(`PERIODEND ${label}: -> ${date}`)
  }

  // ---- 3. Derive missing NET_PROFIT = PBT − tax (same-row identity, only-missing-slot) ----
  for (const label of ["Q1 2025", "Q1 2026", "Q4 2026"]) {
    const q = await reportOf("QUARTERLY", label)
    if (!q) { log.push(`MISS-REPORT ${label}`); continue }
    const vals = await db.financialValue.findMany({ where: { reportId: q.id, metricCode: { in: ["PROFIT_BEFORE_TAX", "INCOME_TAX", "NET_PROFIT"] } }, select: { metricCode: true, normalizedValue: true } })
    const m = Object.fromEntries(vals.map(v => [v.metricCode, v.normalizedValue]))
    if (m.NET_PROFIT != null) { log.push(`DERIVE-SKIP ${label}: exists`); continue }
    if (m.PROFIT_BEFORE_TAX == null || m.INCOME_TAX == null) { log.push(`DERIVE-SKIP ${label}: no PBT/tax`); continue }
    const ni = m.PROFIT_BEFORE_TAX - m.INCOME_TAX
    await db.financialValue.create({ data: { companyId: c.id, reportId: q.id, metricCode: "NET_PROFIT", originalLabel: `NET_PROFIT (derived: PBT - tax)`, value: ni, currency: "EGP", unit: "UNIT", statementType: "CONSOLIDATED", extractionMethod: "DERIVED", normalizedValue: ni, validationStatus: "VALID" } })
    log.push(`DERIVED ${label}: NET_PROFIT = ${m.PROFIT_BEFORE_TAX} - ${m.INCOME_TAX} = ${ni}`)
  }

  console.log(log.join("\n"))
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
