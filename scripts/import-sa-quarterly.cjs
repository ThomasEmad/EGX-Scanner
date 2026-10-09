/* Import quarterly Revenue + Net Income harvested from stockanalysis.com
   (S&P Global Market Intelligence data, company-name verified per fetch).
   Only-missing-slot: existing values from other sources are never overwritten.
   Usage: node scripts/import-sa-quarterly.cjs */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()

// [ticker, periodEnd, periodLabel, revenueM, netIncomeM] — revenueM/NI null = not available
const DATA = [
  ["QNBE", "2026-06-30", "Q2 2026", 16962, 9079],
  ["QNBE", "2026-03-31", "Q1 2026", 14764, 6911],
  ["QNBE", "2025-06-30", "Q2 2025", 13790, 7917],
  ["QNBE", "2025-03-31", "Q1 2025", 12537, 5375],
  ["TMGH", "2026-06-30", "Q2 2026", 17121, 3318],
  ["TMGH", "2026-03-31", "Q1 2026", 13071, 4148],
  ["TMGH", "2025-06-30", "Q2 2025", 14965, 2712],
  ["TMGH", "2025-03-31", "Q1 2025", 9427, 3684],
  ["MASR", "2026-06-30", "Q2 2026", 2384, 345.57],
  ["MASR", "2026-03-31", "Q1 2026", 2751, 594.19],
  ["MASR", "2025-06-30", "Q2 2025", 2227, 348.84],
  ["MASR", "2025-03-31", "Q1 2025", 2563, 685.86],
  ["EAST", "2026-06-30", "Q2 2026", 12007, 2901],
  ["EAST", "2026-03-31", "Q1 2026", 8526, 714.18],
  ["EAST", "2025-06-30", "Q2 2025", 10030, 2702],
  ["EAST", "2025-03-31", "Q1 2025", 8897, 1103],
  ["JUFO", "2026-06-30", "Q2 2026", 9078, 712.91],
  ["JUFO", "2026-03-31", "Q1 2026", 8600, 668.62],
  ["JUFO", "2025-06-30", "Q2 2025", 7362, 481.12],
  ["JUFO", "2025-03-31", "Q1 2025", 6803, 299.62],
  ["ETEL", "2026-06-30", "Q2 2026", 31005, 11830],
  ["ETEL", "2026-03-31", "Q1 2026", 28211, 3572],
  ["ETEL", "2025-06-30", "Q2 2025", 25710, 5862],
  ["ETEL", "2025-03-31", "Q1 2025", 24718, 4646],
  ["CLHO", "2026-06-30", "Q2 2026", 2337, 152.6],
  ["CLHO", "2026-03-31", "Q1 2026", 1973, 118.09],
  ["CLHO", "2025-06-30", "Q2 2025", 1763, 250.41],
  ["CLHO", "2025-03-31", "Q1 2025", 1619, 200.58],
  ["AMER", "2026-03-31", "Q1 2026", 398.33, 50.11],
  ["AMER", "2025-06-30", "Q2 2025", 259.24, 4.73],
  ["AMER", "2025-03-31", "Q1 2025", 316.19, 3.69],
  ["SKPC", "2026-06-30", "Q2 2026", 4747, 323.24],
  ["SKPC", "2026-03-31", "Q1 2026", 3788, 121.55],
  ["SKPC", "2025-12-31", "Q4 2025", 3501, -334.08],
  ["SKPC", "2025-09-30", "Q3 2025", 3360, 475.84],
  ["SKPC", "2025-06-30", "Q2 2025", 3940, 440.69],
  ["SKPC", "2025-03-31", "Q1 2025", 3612, 477.48],
  ["LCSW", "2026-06-30", "Q2 2026", 2433, 72.22],
  ["LCSW", "2026-03-31", "Q1 2026", 1957, 62.96],
  ["LCSW", "2025-06-30", "Q2 2025", 1878, 77.91],
  ["LCSW", "2025-03-31", "Q1 2025", 1691, 109.47],
  ["SWDY", "2026-06-30", "Q2 2026", 88017, 4376],
  ["SWDY", "2026-03-31", "Q1 2026", 75298, 4255],
  ["SWDY", "2025-06-30", "Q2 2025", 64409, 3890],
  ["SWDY", "2025-03-31", "Q1 2025", 59392, 3699],
  ["ORHD", "2026-06-30", "Q2 2026", 8358, 1235],
  ["ORHD", "2026-03-31", "Q1 2026", 6460, 1724],
  ["ORHD", "2025-06-30", "Q2 2025", 5088, 1113],
  ["ORHD", "2025-03-31", "Q1 2025", 6441, 2045],
  ["EMFD", "2026-06-30", "Q2 2026", 4316, -2213],
  ["EMFD", "2026-03-31", "Q1 2026", 6763, 7769],
  ["EMFD", "2025-06-30", "Q2 2025", 3520, 587.52],
  ["EMFD", "2025-03-31", "Q1 2025", 5906, 3327],
  ["CIRA", "2026-02-28", "Q2 2026", 1571, 338.4],
  ["CIRA", "2025-11-30", "Q1 2026", 1397, 352],
  ["CIRA", "2025-02-28", "Q2 2025", 1157, 222.77],
  ["CIRA", "2024-11-30", "Q1 2025", 1016, 185.3],
  ["ADIB", "2026-06-30", "Q2 2026", 7192, 3882],
  ["ADIB", "2026-03-31", "Q1 2026", 7194, 3655],
  ["ADIB", "2025-06-30", "Q2 2025", 5581, 3193],
  ["ADIB", "2025-03-31", "Q1 2025", 5107, 3033],
  ["PHDC", "2026-06-30", "Q2 2026", 10182, 1060],
  ["PHDC", "2026-03-31", "Q1 2026", 9346, 1205],
  ["PHDC", "2025-06-30", "Q2 2025", 7187, 903.72],
  ["PHDC", "2025-03-31", "Q1 2025", 8393, 1540],
]

;(async () => {
  const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true } })
  const byTicker = new Map(companies.map((c) => [c.ticker.toUpperCase(), c]))

  let created = 0, added = 0, skipped = 0
  const groups = new Map()
  for (const [ticker, periodEnd, label, rev, ni] of DATA) {
    const key = `${ticker}|${label}|${periodEnd}`
    if (!groups.has(key)) groups.set(key, { ticker, periodEnd, label, items: [] })
    if (rev !== null) groups.get(key).items.push(["REVENUE", rev])
    if (ni !== null) groups.get(key).items.push(["NET_PROFIT", ni])
  }

  for (const [key, g] of groups) {
    const company = byTicker.get(g.ticker)
    if (!company) { console.log("skip unknown:", g.ticker); continue }
    let report = await db.financialReport.findFirst({
      where: { companyId: company.id, periodType: "QUARTERLY", periodLabel: g.label, statementType: "CONSOLIDATED" },
      select: { id: true },
    })
    if (!report) {
      try {
      const fy = Number(g.label.split(" ")[1])
        const createdRep = await db.financialReport.create({
          data: {
            companyId: company.id, reportType: "INTERIM", periodType: "QUARTERLY",
            periodLabel: g.label, fiscalYear: fy, periodEnd: new Date(g.periodEnd),
            statementType: "CONSOLIDATED", processingStatus: "APPROVED",
            sourceName: "S&P_GLOBAL_STOCKANALYSIS", version: 1,
          },
        })
        report = createdRep
        created++
      } catch (e) {
        if (e && e.code === "P2002") {
          report = await db.financialReport.findFirst({
            where: { companyId: company.id, periodType: "QUARTERLY", periodLabel: g.label, statementType: "CONSOLIDATED" },
            select: { id: true },
          })
        } else throw e
      }
    }
    const existing = await db.financialValue.findMany({ where: { reportId: report.id }, select: { metricCode: true } })
    const have = new Set(existing.map((e) => e.metricCode))
    for (const [code, valueM] of g.items) {
      if (have.has(code)) { skipped++; continue }
      const value = valueM * 1e6
      await db.financialValue.create({
        data: {
          companyId: company.id, reportId: report.id, metricCode: code,
          originalLabel: `${code === "REVENUE" ? "Revenue" : "Net Income"} (S&P Global via stockanalysis.com quarterly, name-verified)`,
          value, currency: "EGP", unit: "UNIT", statementType: "CONSOLIDATED",
          extractionMethod: "MANUAL_ENTRY", normalizedValue: value, validationStatus: "VALID",
        },
      })
      have.add(code)
      added++
    }
  }

  await db.auditLog.create({
    data: { actor: "system", action: "UPLOAD", entityType: "FinancialReport",
      details: `S&P quarterly import (stockanalysis.com, name-verified per fetch): ${created} quarterly reports created, ${added} values added (REVENUE + NET_PROFIT), ${skipped} existing slots preserved. Covers Q1/Q2 2026 + 2025 quarters for ${new Set(DATA.map(d => d[0])).size} companies.` },
  })
  console.log(JSON.stringify({ reportsCreated: created, valuesAdded: added, existingPreserved: skipped }))
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
