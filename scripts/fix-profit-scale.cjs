/* Focused profit-scale fixes (evidence in comments):
   GSSC NPP FY2024/2025 = NET_PROFIT x 1000 exactly (NP correct-scale in same report)
   MAAL NP+NPP FY2021/FY2023 x1000 (TE 2-5B real; mcap 2.13B; sibling years correct scale;
     quarterly correct rows +/-5..80M; FY2022/24/25 annuals correct)
   MAAL quarterly NP x1000: Q2 2022, Q3 2022, Q1 2023, Q4 2023 (|v| >= 1B impossible for a
     company with mcap 2.13B and annual profits +/-10..105M) */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const FIXES = [
  ["GSSC", "ANNUAL", "FY 2025", "NET_PROFIT_PARENT", 265160968670],
  ["GSSC", "ANNUAL", "FY 2024", "NET_PROFIT_PARENT", 206020690000],
  ["MAAL", "ANNUAL", "FY 2021", "NET_PROFIT", 26239975000],
  ["MAAL", "ANNUAL", "FY 2021", "NET_PROFIT_PARENT", 26239975000],
  ["MAAL", "ANNUAL", "FY 2023", "NET_PROFIT", 56267054000],
  ["MAAL", "ANNUAL", "FY 2023", "NET_PROFIT_PARENT", 56267054000],
  ["MAAL", "QUARTERLY", "Q2 2022", "NET_PROFIT", -2130000000],
  ["MAAL", "QUARTERLY", "Q3 2022", "NET_PROFIT", 3210000000],
  ["MAAL", "QUARTERLY", "Q1 2023", "NET_PROFIT", -14630000000],
  ["MAAL", "QUARTERLY", "Q4 2023", "NET_PROFIT", 14370000000],
]
;(async () => {
  let n = 0
  for (const [ticker, pt, label, code, stored] of FIXES) {
    const c = await db.company.findUnique({ where: { ticker }, select: { id: true } })
    const r = await db.financialReport.findFirst({ where: { companyId: c.id, periodType: pt, periodLabel: label, statementType: "CONSOLIDATED" }, select: { id: true } })
    if (!r) { console.log("MISS-REPORT " + ticker + " " + label); continue }
    const v = await db.financialValue.findFirst({ where: { reportId: r.id, metricCode: code }, select: { id: true, normalizedValue: true } })
    if (!v) { console.log("MISS " + ticker + " " + label + " " + code); continue }
    if (Math.abs(v.normalizedValue - stored) > Math.abs(stored) * 0.001) { console.log("GUARD-SKIP " + ticker + " " + label + " " + code + ": " + v.normalizedValue); continue }
    const fixed = stored / 1000
    await db.financialValue.update({ where: { id: v.id }, data: { normalizedValue: fixed, value: fixed } })
    console.log("FIXED " + ticker + " " + label + " " + code + ": " + stored + " -> " + fixed)
    n++
  }
  console.log("applied:", n)
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
