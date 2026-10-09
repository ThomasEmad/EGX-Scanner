/* Import S&P annual financials (Revenue, NI, OCF, Total Debt) for thin companies.
   Only-missing-slot. Creates ANNUAL CONSOLIDATED reports.
   Usage: node scripts/import-sa-annual.cjs <batchJsonPath> */
const fs = require("fs")
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const rows = JSON.parse(fs.readFileSync(process.argv[2] ?? "C:/Users/tomas/Downloads/EGX-Scanner-backup/EGX-Scanner/scripts/sa-annual-batch1.json", "utf8"))
;(async () => {
  let created = 0, added = 0, skipped = 0
  for (const [ticker, periodEnd, label, rev, ni, ocf, debt] of rows) {
    const c = await db.company.findUnique({ where: { ticker }, select: { id: true } })
    if (!c) continue
    let report = await db.financialReport.findFirst({
      where: { companyId: c.id, periodType: "ANNUAL", periodLabel: label, statementType: "CONSOLIDATED" },
      select: { id: true, sourceName: true },
    })
    if (!report) {
      try { report = await db.financialReport.create({ data: { companyId: c.id, reportType: "ANNUAL", periodType: "ANNUAL", periodLabel: label, fiscalYear: Number(label.split(" ")[1]), periodEnd: new Date(periodEnd), statementType: "CONSOLIDATED", processingStatus: "APPROVED", sourceName: "S&P_GLOBAL_STOCKANALYSIS", version: 1 } }); created++ } catch (e) { if (e.code === "P2002") { report = await db.financialReport.findFirst({ where: { companyId: c.id, periodType: "ANNUAL", periodLabel: label, statementType: "CONSOLIDATED" }, select: { id: true } }) } else throw e }
    }
    const have = new Set((await db.financialValue.findMany({ where: { reportId: report.id }, select: { metricCode: true } })).map(v => v.metricCode))
    for (const [code, valueM] of [["REVENUE", rev], ["NET_PROFIT", ni], ["OPERATING_CASH_FLOW", ocf], ["TOTAL_DEBT", debt]]) {
      if (have.has(code)) { skipped++; continue }
      const value = valueM * 1e6
      if (code === "REVENUE" && value < 0) continue
      try {
        await db.financialValue.create({ data: { companyId: c.id, reportId: report.id, metricCode: code, originalLabel: `${code} (S&P Global via stockanalysis.com annual)`, value, currency: "EGP", unit: "UNIT", statementType: "CONSOLIDATED", extractionMethod: "MANUAL_ENTRY", normalizedValue: value, validationStatus: "VALID" } })
        have.add(code); added++
      } catch (e) { /* dup skip */ }
    }
  }
  await db.auditLog.create({ data: { actor: "system", action: "UPLOAD", entityType: "FinancialReport", details: `S&P annual import: ${created} reports, ${added} values, ${skipped} preserved (batch-1: ABUK TMGH SWDY ETEL PHDC JUFO EFID EAST MFPC CLHO COMI).` } })
  console.log(JSON.stringify({ reportsCreated: created, valuesAdded: added, existingPreserved: skipped }))
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
