import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
function stripHtml(html) { return html.replace(/<script[\s\S]*?<\/script>/g," ").replace(/<style[\s\S]*?<\/style>/g," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ") }
try {
  for (const t of ["TALM","OCDI","ZMID","DSCW","ATQA"]) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true, nameEn: true, nameAr: true, sector: true } })
    console.log(`\n######## ${t} ${c.nameEn} / ${c.nameAr} ${c.sector} ########`)
    const reports = await db.financialReport.findMany({ where: { companyId: c.id, periodType: "ANNUAL", fiscalYear: { gte: 2023 } }, orderBy: { fiscalYear: "desc" }, select: { fiscalYear: true, sourceName: true, values: { where: { metricCode: { in: ["TOTAL_ASSETS","TOTAL_LIABILITIES","TOTAL_EQUITY","TOTAL_EQUITY_AND_LIABILITIES","NON_CONTROLLING_INTERESTS","OPERATING_CASH_FLOW","INVESTING_CASH_FLOW","FINANCING_CASH_FLOW","NET_CHANGE_IN_CASH","OPENING_CASH","CLOSING_CASH","FX_EFFECT_CASH","NET_PROFIT","REVENUE"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true } } } })
    for (const r of reports.slice(0,2)) console.log(`${r.fiscalYear} ${r.sourceName} | ${r.values.map(v=>`${v.metricCode}=${v.normalizedValue}${v.validationStatus!=="VALID"?"("+v.validationStatus+")":""}`).join(" ")}`)
    const res = await fetch(`https://askborsa.com/company/${t}`, { headers: { "user-agent": "Mozilla/5.0" } })
    const text = stripHtml(await res.text())
    const i = text.indexOf("القوائم المالية الملخصة")
    console.log("ASKBORSA:", i >= 0 ? text.slice(i, i + 1600) : text.slice(0, 1600))
  }
} finally { await db.$disconnect() }
