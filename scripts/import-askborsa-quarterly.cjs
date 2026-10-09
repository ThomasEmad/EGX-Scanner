/* Re-import AskBorsa quarterly data DIRECTLY as discrete QUARTERLY reports.
   The previous import stored Q2 as SEMIANNUAL and Q3 as NINE_MONTH, which were
   purged during discretization. This import puts every value directly into
   QUARTERLY reports — only-missing-slot, source: ASKBORA_QUARTERLY.
   Usage: node scripts/import-askborsa-quarterly.cjs */
const fs = require("fs")
const path = require("path")
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()

const LABEL_MAP = {
  "صافي الربح": "NET_PROFIT",
  "مجمل الربح": "GROSS_PROFIT",
  "إجمالي الأصول": "TOTAL_ASSETS",
  "إجمالي المطلوبات": "TOTAL_LIABILITIES",
  "حقوق المساهمين": "TOTAL_EQUITY",
  "إجمالي المطلوبات وحقوق المساهمين": "TOTAL_EQUITY_AND_LIABILITIES",
  "التدفق النقدي التشغيلي": "OPERATING_CASH_FLOW",
  "التدفق النقدي الاستثماري": "INVESTING_CASH_FLOW",
  "التدفق النقدي التمويلي": "FINANCING_CASH_FLOW",
  "صافي التغير في النقد": "NET_CHANGE_IN_CASH",
  "توزيعات نقدية مدفوعة": "DIVIDENDS_PAID",
}

const Q_END = { Q1: "-03-31", Q2: "-06-30", Q3: "-09-30", Q4: "-12-31" }
const Q_LABEL = { Q1: "Q1", Q2: "Q2", Q3: "Q3", Q4: "Q4" }

;(async () => {
  const file = path.join(__dirname, "../../egx-data/data/askborsa-quarterly-harvest.jsonl")
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l))
  console.log("harvest lines:", lines.length)

  const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true } })
  const byTicker = new Map(companies.map(c => [c.ticker.toUpperCase(), c]))

  let created = 0, added = 0, skippedDupe = 0, skippedNoCompany = 0
  const tickersProcessed = new Set()

  for (const entry of lines) {
    const ticker = String(entry.ticker || "").toUpperCase()
    const company = byTicker.get(ticker)
    if (!company) { skippedNoCompany++; continue }
    tickersProcessed.add(ticker)

    const tab = entry.tab // Q1|Q2|Q3|Q4
    const cols = entry.cols // [2021, 2022, ...]
    const rows = entry.rows // { Arabic label: [values] }

    for (const [arLabel, canonical] of Object.entries(LABEL_MAP)) {
      const values = rows[arLabel]
      if (!values || !Array.isArray(values)) continue
      for (let col = 0; col < cols.length; col++) {
        const fy = Number(cols[col])
        const val = values[col]
        if (val === null || val === undefined || !Number.isFinite(val) || fy < 2020 || fy > 2027) continue

        const periodEnd = `${fy}${Q_END[tab]}`
        const periodLabel = `${Q_LABEL[tab]} ${fy}`

        // find or create the quarterly report
        let report = await db.financialReport.findFirst({
          where: { companyId: company.id, periodType: "QUARTERLY", periodLabel, statementType: "CONSOLIDATED" },
          select: { id: true },
        })
        if (!report) {
          try {
            report = await db.financialReport.create({
              data: { companyId: company.id, reportType: "INTERIM", periodType: "QUARTERLY", periodLabel, fiscalYear: fy, periodEnd: new Date(periodEnd), statementType: "CONSOLIDATED", processingStatus: "APPROVED", sourceName: "ASKBORA_QUARTERLY", version: 1 },
            })
            created++
          } catch (e) {
            if (e.code === "P2002") {
              report = await db.financialReport.findFirst({ where: { companyId: company.id, periodType: "QUARTERLY", periodLabel, statementType: "CONSOLIDATED" }, select: { id: true } })
            } else throw e
          }
        }

        // only-missing-slot
        const existing = await db.financialValue.findFirst({ where: { reportId: report.id, metricCode: canonical }, select: { id: true, normalizedValue: true } })
        if (existing) { skippedDupe++; continue }

        await db.financialValue.create({
          data: {
            companyId: company.id, reportId: report.id, metricCode: canonical,
            originalLabel: `${arLabel} (AskBorsa quarterly ${tab})`,
            value: val, currency: "EGP", unit: "UNIT", statementType: "CONSOLIDATED",
            extractionMethod: "MANUAL_ENTRY", normalizedValue: val, validationStatus: "VALID",
          },
        })
        added++
      }
    }
  }

  await db.auditLog.create({
    data: { actor: "system", action: "UPLOAD", entityType: "FinancialReport",
      details: `ASKBORA_QUARTERLY re-import as discrete QUARTERLY: ${created} reports created, ${added} values added, ${skippedDupe} existing preserved, ${skippedNoCompany} records skipped (unknown ticker), ${tickersProcessed.size} tickers processed.` },
  })
  console.log(JSON.stringify({ reportsCreated: created, valuesAdded: added, skippedDupe, skippedNoCompany, tickers: tickersProcessed.size }))
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
