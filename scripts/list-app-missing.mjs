import { readFileSync } from "node:fs"
import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const text = readFileSync("reports/askborsa-annual-comparison.csv", "utf8").replace(/^\uFEFF/, "")
const lines = text.split(/\r?\n/).filter(Boolean)
const header = lines[0].split(",")
const idx = Object.fromEntries(header.map((h,i)=>[h,i]))
const rows = lines.slice(1).map(l => l.split(",")).filter(r => r[idx.status] === "APP_MISSING")
try {
  for (const r of rows) {
    const t = r[idx.ticker]
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true, nameEn: true, sector: true, isActive: true } })
    if (!c) { console.log(`${t} MISSING COMPANY`); continue }
    const reports = await db.financialReport.findMany({ where: { companyId: c.id, periodType: "ANNUAL" }, orderBy: { fiscalYear: "desc" }, take: 3, select: { fiscalYear: true, periodEnd: true, sourceName: true, values: { where: { metricCode: { in: ["REVENUE","NET_PROFIT"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true } } } })
    const existing = reports.map(rep => `${rep.fiscalYear}(${rep.periodEnd?.toISOString().slice(0,10)})[${rep.sourceName}] ${rep.values.map(v=>`${v.metricCode}=${v.normalizedValue}/${v.validationStatus}`).join(" ")}`).join(" || ")
    console.log(`${t} ${c.nameEn} [${c.sector}] active=${c.isActive} ask=${r[idx.metric]} ${r[idx.askYear]}=${r[idx.askValue]} | ${existing}`)
  }
} finally { await db.$disconnect() }
