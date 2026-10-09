import { readFileSync } from "node:fs"
import { PrismaClient } from "@prisma/client"
const live = new PrismaClient({ datasources: { db: { url: "file:C:/Users/tomas/Downloads/EGX-Scanner-backup/EGX-Scanner/prisma/prisma/dev.db" } } })
const bak = new PrismaClient({ datasources: { db: { url: "file:C:/Users/tomas/Downloads/EGX-Scanner-backup/EGX-Scanner/prisma/prisma/dev.db.pre-user-purge-20260926-2243.bak" } } })

const bakCira = await bak.company.findUnique({ where: { ticker: "CIRA" } })
if (!bakCira) throw new Error("CIRA not in backup")
const bakReports = await bak.financialReport.findMany({ where: { companyId: bakCira.id }, include: { values: true } })
console.log(`backup CIRA: ${bakCira.nameEn} | ${bakReports.length} reports | ${bakReports.reduce((a, r) => a + r.values.length, 0)} values`)

const cera = await live.company.findUnique({ where: { ticker: "CERA" } })
const ceraReps = await live.financialReport.findMany({ where: { companyId: cera.id }, select: { id: true } })
for (const r of ceraReps) await live.financialReport.delete({ where: { id: r.id } })
await live.calculatedMetric.deleteMany({ where: { companyId: cera.id } })
await live.financialEvent.deleteMany({ where: { companyId: cera.id } })
await live.company.update({ where: { id: cera.id }, data: { nameEn: "Arab Ceramic Co. - Ceramica Remas", nameAr: "العربية للسيراميك - ريماس" } })
console.log(`live CERA wiped (${ceraReps.length} contaminated reports), identity fixed`)

const rec = readFileSync("../egx-data/data/askborsa-harvest.jsonl", "utf-8").split("\n").filter(Boolean).map(l => JSON.parse(l)).find(r => r.ticker === "CERA")
const LABEL_MAP = {
  "صافي الربح": { code: "NET_PROFIT", stmt: "INCOME_STATEMENT" },
  "مجمل الربح": { code: "GROSS_PROFIT", stmt: "INCOME_STATEMENT" },
  "إجمالي الأصول": { code: "TOTAL_ASSETS", stmt: "BALANCE_SHEET" },
  "إجمالي المطلوبات": { code: "TOTAL_LIABILITIES", stmt: "BALANCE_SHEET" },
  "حقوق المساهمين": { code: "TOTAL_EQUITY", stmt: "BALANCE_SHEET" },
  "إجمالي المطلوبات وحقوق المساهمين": { code: "TOTAL_EQUITY_AND_LIABILITIES", stmt: "BALANCE_SHEET" },
  "التدفق النقدي التشغيلي": { code: "OPERATING_CASH_FLOW", stmt: "CASH_FLOW" },
  "التدفق النقدي الاستثماري": { code: "INVESTING_CASH_FLOW", stmt: "CASH_FLOW" },
  "التدفق النقدي التمويلي": { code: "FINANCING_CASH_FLOW", stmt: "CASH_FLOW" },
  "صافي التغير في النقد": { code: "NET_CHANGE_IN_CASH", stmt: "CASH_FLOW" },
}
let ceraVals = 0, ceraRepsCreated = 0
for (let i = 0; i < rec.cols.length; i++) {
  const y = parseInt(rec.cols[i])
  const hasAny = Object.keys(LABEL_MAP).some(l => rec.rows[l] && rec.rows[l][i] !== null && rec.rows[l][i] !== undefined)
  if (!hasAny) continue
  const filing = (rec.filings || []).find(f => f.t.includes(String(y)) && f.t.includes("الميزانية السنوية"))
  const rep = await live.financialReport.create({ data: {
    companyId: cera.id, reportType: "ANNUAL", periodType: "ANNUAL", statementType: "CONSOLIDATED",
    fiscalYear: y, periodLabel: `FY ${y}`, periodEnd: new Date(`${y}-12-31`), language: "AR",
    sourceName: "ASKBORA_SUMMARY", sourceUrl: filing ? "https://askborsa.com" + filing.href : null,
    processingStatus: "APPROVED", approvedBy: "askborsa-import", approvedAt: new Date(),
    extractionMethod: "API_IMPORT", parserVersion: "askborsa-summary@1", extractionConfidence: 0.8,
    isDemoData: false, documentType: "MANUAL_ENTRY",
    notes: "Ceramica Remas annual summary from AskBorsa (rebuilt after CIRA-merge undo)",
  }})
  ceraRepsCreated++
  for (const [label, { code, stmt }] of Object.entries(LABEL_MAP)) {
    const v = rec.rows[label] && rec.rows[label][i]
    if (v === null || v === undefined) continue
    await live.financialValue.create({ data: {
      companyId: cera.id, reportId: rep.id, metricCode: code,
      originalLabel: label, value: v, currency: "EGP", unit: "UNIT", normalizedValue: v,
      statementType: stmt, subPeriod: "CURRENT",
      extractionMethod: "API_IMPORT", confidence: 0.8, validationStatus: "VALID",
      validationNotes: "AskBorsa annual summary (display-rounded 0.01M)",
      isDemoData: false,
    }})
    ceraVals++
  }
}
console.log(`CERA rebuilt: ${ceraRepsCreated} reports / ${ceraVals} values from AskBorsa`)

const { id: _omit, createdAt: _c, updatedAt: _u, ...coData } = bakCira
const cira = await live.company.create({ data: { ...coData, notes: "Restored from pre-purge backup after CIRA=>CERA merge was found wrong (two-source verified: AskBorsa + TradingView both show CIRA=education, CERA=ceramics)" } })
let ciraVals = 0
for (const r of bakReports) {
  const { id: _rid, companyId: _rc, createdAt: _rc2, updatedAt: _ru, values, ...repData } = r
  const rep = await live.financialReport.create({ data: { ...repData, companyId: cira.id } })
  for (const v of values) {
    const { id: _vid, companyId: _vc, reportId: _vr, createdAt: _vc2, updatedAt: _vu, ...valData } = v
    await live.financialValue.create({ data: { ...valData, companyId: cira.id, reportId: rep.id } })
    ciraVals++
  }
}
console.log(`CIRA recreated: ${bakReports.length} reports / ${ciraVals} values from backup`)

await live.auditLog.create({ data: { actor: "admin", action: "COMPANY_UPDATE", entityType: "Company", entityId: cera.id, details: "CIRA=>CERA merge undone (two-source verified wrong): CERA wiped of education data and rebuilt from AskBorsa ceramics series; CIRA education company restored from backup with all reports/values" } })

const total = await live.company.count({ where: { isActive: true } })
console.log("active companies:", total)
await live.$disconnect(); await bak.$disconnect()
