/* Import the Excel-statements supplement (Refinitiv CF-Exports, USD→EGP) with
   the established only-missing-slot policy: values land in find-or-created
   ANNUAL CONSOLIDATED/STANDALONE reports; an existing metric value from another
   source is NEVER overwritten. Usage: node scripts/import-excel-statements.cjs */
const fs = require("fs")
const path = require("path")
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()

const file = path.join(__dirname, "../../egx-data/data/excel-statements-supplement.json")
const { records } = JSON.parse(fs.readFileSync(file, "utf8"))

;(async () => {
  const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true } })
  const byTicker = new Map(companies.map((c) => [c.ticker.toUpperCase(), c]))

  // CREATE_MISSING=1: companies present in the Excel files but absent from the DB
  // (deleted in earlier zero-data purges) are recreated from Refinitiv metadata
  const meta = fs.existsSync(path.join(__dirname, "../../statments/unmatched-meta.json"))
    ? JSON.parse(fs.readFileSync(path.join(__dirname, "../../statments/unmatched-meta.json"), "utf8"))
    : {}
  if (process.env.CREATE_MISSING === "1") {
    const tickersInFile = [...new Set(records.map((r) => String(r.ticker).toUpperCase()))]
    for (const t of tickersInFile) {
      if (byTicker.has(t)) continue
      const m = meta[t]
      if (!m) continue
      const created = await db.company.create({
        data: { ticker: t, nameEn: m.nameEn, sector: m.sector, isActive: true, listingStatus: "LISTED", sourceUrl: "Refinitiv CF-Export (user files)" },
      })
      byTicker.set(t, created)
      await db.auditLog.create({ data: { actor: "system", action: "UPLOAD", entityType: "Company", entityId: created.id, details: `Recreated company ${t} (${m.nameEn}, sector ${m.sector}) from user-provided Refinitiv Excel files — deleted earlier as zero-data; 2015-2025 statements now available.` } })
      console.log("created:", t, "-", m.nameEn.slice(0, 45), "[" + m.sector + "]")
    }
  }

  // group by (ticker, fy, basis)
  const groups = new Map()
  for (const r of records) {
    const c = byTicker.get(String(r.ticker).toUpperCase())
    if (!c) continue // not in our universe (e.g. .MZ listings)
    const key = `${r.ticker}|${r.fiscal_year}|${r.statement_basis}`
    if (!groups.has(key)) groups.set(key, { ticker: r.ticker, company: c, fy: r.fiscal_year, basis: r.statement_basis, periodEnd: r.period, items: [] })
    groups.get(key).items.push(r)
  }
  console.log("groups:", groups.size)

  let created = 0, added = 0, skippedOwned = 0, skippedDupe = 0
  for (const [key, g] of groups) {
    const report = await db.financialReport.findFirst({
      where: { companyId: g.company.id, periodType: "ANNUAL", fiscalYear: g.fy, statementType: g.basis },
      select: { id: true },
    })
    let reportId
    if (report) {
      reportId = report.id
    } else {
      const createdRep = await db.financialReport.create({
        data: {
          companyId: g.company.id,
          reportType: "ANNUAL",
          periodType: "ANNUAL",
          periodLabel: `FY ${g.fy}`,
          fiscalYear: g.fy,
          periodEnd: new Date(g.periodEnd),
          statementType: g.basis,
          extractionMethod: "MANUAL_ENTRY",
          processingStatus: "APPROVED",
          sourceName: "EXCEL_STATEMENTS",
          version: 1,
        },
      })
      reportId = createdRep.id
      created++
    }
    const existing = await db.financialValue.findMany({ where: { reportId }, select: { metricCode: true } })
    const have = new Set(existing.map((e) => e.metricCode))
    for (const item of g.items) {
      if (have.has(item.metric_code)) {
        if (existing.some((e) => e.metricCode === item.metric_code)) skippedDupe++
        continue
      }
      // a metric already owned by a DIFFERENT report of the same company+year+statementType is not overwritten —
      // but here we only fill THIS report; cross-report duplicates are deduped by the calc engine's statement-pref
      await db.financialValue.create({
        data: {
          reportId,
          companyId: g.company.id,
          metricCode: item.metric_code,
          originalLabel: `${item.metric_label_refinitiv} (Refinitiv CF-Export, USD→EGP)`,
          value: item.value,
          currency: "EGP",
          unit: "UNIT",
          statementType: g.basis,
          extractionMethod: "MANUAL_ENTRY",
          normalizedValue: item.value,
          validationStatus: "VALID",
        },
      })
      have.add(item.metric_code)
      added++
    }
  }

  await db.auditLog.create({
    data: {
      actor: "system",
      action: "UPLOAD",
      entityType: "FinancialReport",
      details: `EXCEL_STATEMENTS import: ${records.length} records read, ${created} reports created, ${added} values added, ${skippedDupe} duplicates skipped (user-provided Refinitiv CF-Export xlsx 2015-2024, USD→EGP via file FX rows).`,
    },
  })
  console.log(JSON.stringify({ groups: groups.size, reportsCreated: created, valuesAdded: added, skippedDupe }))
  await db.$disconnect()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
