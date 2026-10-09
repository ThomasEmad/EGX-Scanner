/* Import name-verified S&P quarterly rows (batch file), sector-sanity gated:
   REVENUE rejected if implausible vs company scale (>8x its max historical revenue). */
const fs = require("fs")
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const rows = JSON.parse(fs.readFileSync("C:/Users/tomas/Downloads/EGX-Scanner-backup/EGX-Scanner/scripts/sa-batch1.json", "utf8"))
;(async () => {
  let created = 0, added = 0, skipped = 0, gated = 0
  for (const [ticker, periodEnd, label, rev, ni] of rows) {
    const c = await db.company.findUnique({ where: { ticker }, select: { id: true, sector: true } })
    if (!c) continue
    let report = await db.financialReport.findFirst({ where: { companyId: c.id, periodType: "QUARTERLY", periodLabel: label, statementType: "CONSOLIDATED" }, select: { id: true } })
    if (!report) {
      try {
        report = await db.financialReport.create({ data: { companyId: c.id, reportType: "INTERIM", periodType: "QUARTERLY", periodLabel: label, fiscalYear: Number(label.split(" ")[1]), periodEnd: new Date(periodEnd), statementType: "CONSOLIDATED", processingStatus: "APPROVED", sourceName: "S&P_GLOBAL_STOCKANALYSIS", version: 1 } })
        created++
      } catch (e) { if (e.code === "P2002") { report = await db.financialReport.findFirst({ where: { companyId: c.id, periodType: "QUARTERLY", periodLabel: label, statementType: "CONSOLIDATED" }, select: { id: true } }) } else throw e }
    }
    const have = new Set((await db.financialValue.findMany({ where: { reportId: report.id }, select: { metricCode: true } })).map(v => v.metricCode))
    for (const [code, valueM] of [["REVENUE", rev], ["NET_PROFIT", ni]]) {
      if (have.has(code)) { skipped++; continue }
      const value = valueM * 1e6
      if (code === "REVENUE") {
        const maxHist = await db.financialValue.aggregate({ where: { companyId: c.id, metricCode: "REVENUE", normalizedValue: { gt: 0 } }, _max: { normalizedValue: true } })
        const maxV = maxHist._max.normalizedValue
        if (maxV && value > maxV * 8) { gated++; console.log("GATE", ticker, label, "REVENUE", Math.round(value/1e6) + "M > 8x max hist " + Math.round(maxV/1e6) + "M"); continue }
        if (value < 0) { gated++; console.log("GATE", ticker, label, "REVENUE negative"); continue }
      }
      await db.financialValue.create({ data: { companyId: c.id, reportId: report.id, metricCode: code, originalLabel: `${code === "REVENUE" ? "Revenue" : "Net Income"} (S&P Global via stockanalysis.com, name-verified)`, value, currency: "EGP", unit: "UNIT", statementType: "CONSOLIDATED", extractionMethod: "MANUAL_ENTRY", normalizedValue: value, validationStatus: "VALID" } })
      have.add(code)
      added++
    }
  }
  await db.auditLog.create({ data: { actor: "system", action: "UPLOAD", entityType: "FinancialReport", details: `S&P quarterly batch-1: ${created} reports, ${added} values, ${gated} sector-sanity gates, ${skipped} existing preserved (EGAS POUL CANA EDFM ABUK VALU BTFH GOUR).` } })
  console.log(JSON.stringify({ created, added, skipped, gated }))
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
