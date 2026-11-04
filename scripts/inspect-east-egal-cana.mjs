import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
function stripHtml(html) { return html.replace(/<script[\s\S]*?<\/script>/g," ").replace(/<style[\s\S]*?<\/style>/g," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ") }
try {
  for (const t of ["EAST","EGAL","CANA"]) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true, nameEn: true } })
    console.log(`\n######## ${t} ${c.nameEn} ########`)
    const reports = await db.financialReport.findMany({ where: { companyId: c.id, fiscalYear: { gte: 2024 } }, orderBy: [{ fiscalYear: "asc" }, { periodType: "asc" }, { periodLabel: "asc" }], select: { fiscalYear: true, periodType: true, periodLabel: true, periodStart: true, periodEnd: true, sourceName: true, values: { where: { metricCode: { in: ["NET_PROFIT","NET_PROFIT_PARENT","REVENUE","TOTAL_EQUITY"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true } } } })
    for (const r of reports) {
      const vals = r.values.map(v=>`${v.metricCode}=${v.normalizedValue}${v.validationStatus!=="VALID"?"("+v.validationStatus+")":""}`).join(" ")
      console.log(`${r.fiscalYear} ${r.periodType} ${r.periodLabel} ${r.periodStart?.toISOString().slice(0,10)}..${r.periodEnd?.toISOString().slice(0,10)} ${r.sourceName} | ${vals}`)
    }
    const calc = await db.calculatedMetric.findMany({ where: { companyId: c.id, code: { in: ["roe","roa","net_profit"] }, periodType: { in: ["ANNUAL","TTM"] } }, orderBy: [{ fiscalYear: "desc" }, { periodType: "asc" }], select: { code: true, periodLabel: true, periodType: true, value: true, valueStatus: true, sourcePeriods: true } })
    console.log("CALC:", calc.slice(0,8).map(r=>`${r.code}/${r.periodLabel}=${r.value}(${r.valueStatus})`).join(" | "))
    const res = await fetch(`https://askborsa.com/company/${t}`, { headers: { "user-agent": "Mozilla/5.0" } })
    const text = stripHtml(await res.text())
    console.log("ASKBORSA:", text.slice(0, 1400))
  }
} finally { await db.$disconnect() }
