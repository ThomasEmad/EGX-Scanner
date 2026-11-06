import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
function stripHtml(html) { return html.replace(/<script[\s\S]*?<\/script>/g," ").replace(/<style[\s\S]*?<\/style>/g," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ") }
try {
  for (const t of ["BQDC","IRON"]) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true, nameEn: true, nameAr: true, isin: true, sector: true } })
    console.log(`\n######## ${t} ${c.nameEn} / ${c.nameAr} ISIN=${c.isin} sector=${c.sector} ########`)
    const reports = await db.financialReport.findMany({ where: { companyId: c.id, periodType: "ANNUAL", fiscalYear: { gte: 2020 } }, orderBy: { fiscalYear: "asc" }, select: { fiscalYear: true, sourceName: true, periodEnd: true, values: { where: { metricCode: { in: ["NET_PROFIT","REVENUE","TOTAL_ASSETS","TOTAL_EQUITY","TOTAL_LIABILITIES"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true } } } })
    for (const r of reports) console.log(`${r.fiscalYear} ${r.periodEnd?.toISOString().slice(0,10)} ${r.sourceName} | ${r.values.map(v=>`${v.metricCode}=${v.normalizedValue}${v.validationStatus!=="VALID"?"("+v.validationStatus+")":""}`).join(" ")}`)
    const res = await fetch(`https://askborsa.com/company/${t}`, { headers: { "user-agent": "Mozilla/5.0" } })
    const text = stripHtml(await res.text())
    console.log("ASKBORSA:", text.slice(0, 1500))
  }
} finally { await db.$disconnect() }
