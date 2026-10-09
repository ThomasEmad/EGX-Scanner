/* Re-import ALL AskBorsa annual data with only-missing-slot.
   Catches values missed by the first import (companies created later, etc.) */
const fs = require("fs")
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()

const LABEL_MAP = {
  "إجمالي الأصول": "TOTAL_ASSETS",
  "إجمالي المطلوبات": "TOTAL_LIABILITIES",
  "حقوق المساهمين": "TOTAL_EQUITY",
  "التدفق النقدي التشغيلي": "OPERATING_CASH_FLOW",
  "التدفق النقدي الاستثماري": "INVESTING_CASH_FLOW",
  "التدفق النقدي التمويلي": "FINANCING_CASH_FLOW",
  "صافي التغير في النقد": "NET_CHANGE_IN_CASH",
  "صافي الربح": "NET_PROFIT",
  "مجمل الربح": "GROSS_PROFIT",
}

;(async () => {
  const file = "C:/Users/tomas/Downloads/EGX-Scanner-backup/egx-data/data/askborsa-harvest.jsonl"
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(l => l.trim())
  console.log("lines:", lines.length)

  const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true } })
  const byTicker = new Map(companies.map(c => [c.ticker.toUpperCase(), c]))

  let reportsCreated = 0, added = 0, skippedDupe = 0, skippedNoCompany = 0
  for (const line of lines) {
    const entry = JSON.parse(line)
    const ticker = String(entry.ticker || "").toUpperCase()
    const company = byTicker.get(ticker)
    if (!company) { skippedNoCompany++; continue }

    const cols = entry.cols || []
    const rows = entry.rows || {}

    for (const [arLabel, canonical] of Object.entries(LABEL_MAP)) {
      const values = rows[arLabel]
      if (!values || !Array.isArray(values)) continue
      for (let col = 0; col < cols.length; col++) {
        const fy = Number(cols[col])
        const val = values[col]
        if (val === null || val === undefined || !Number.isFinite(val) || fy < 2015 || fy > 2027) continue

        const periodEnd = `${fy}-12-31`
        const periodLabel = `FY ${fy}`

        let report = await db.financialReport.findFirst({
          where: { companyId: company.id, periodType: "ANNUAL", periodLabel, statementType: "CONSOLIDATED" },
          select: { id: true, sourceName: true },
        })
        if (!report) {
          try {
            report = await db.financialReport.create({
              data: { companyId: company.id, reportType: "ANNUAL", periodType: "ANNUAL", periodLabel, fiscalYear: fy, periodEnd: new Date(`${fy}-12-31`), statementType: "CONSOLIDATED", processingStatus: "APPROVED", sourceName: "ASKBORA_SUMMARY", version: 1 },
            })
            reportsCreated++
          } catch (e) {
            if (e.code === "P2002") {
              report = await db.financialReport.findFirst({ where: { companyId: company.id, periodType: "ANNUAL", periodLabel, statementType: "CONSOLIDATED" }, select: { id: true } })
            } else throw e
          }
        }

        const existing = await db.financialValue.findFirst({ where: { reportId: report.id, metricCode: canonical }, select: { id: true } })
        if (existing) { skippedDupe++; continue }

        await db.financialValue.create({
          data: {
            companyId: company.id, reportId: report.id, metricCode: canonical,
            originalLabel: `${arLabel} (AskBorsa annual)`,
            value: val, currency: "EGP", unit: "UNIT", statementType: "CONSOLIDATED",
            extractionMethod: "MANUAL_ENTRY", normalizedValue: val, validationStatus: "VALID",
          },
        })
        added++
      }
    }
  }

  await db.auditLog.create({ data: { actor: "system", action: "UPLOAD", entityType: "FinancialReport", details: `AskBorsa annual re-import: ${created} reports created, ${added} values added, ${skippedDupe} preserved, ${skippedNoCompany} unknown tickers.` } })
  console.log(JSON.stringify({ reportsCreated: created, valuesAdded: added, skippedDupe, skippedNoCompany }))
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
