import { readFileSync } from "node:fs"
import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const text = readFileSync("reports/askborsa-annual-comparison.csv", "utf8").replace(/^\uFEFF/, "")
const lines = text.split(/\r?\n/).filter(Boolean)
const header = lines[0].split(",")
const idx = Object.fromEntries(header.map((h,i)=>[h,i]))
const rows = lines.slice(1).map(l => l.split(","))
function ask(t, metric, year) {
  const r = rows.find(x => x[idx.ticker] === t && x[idx.metric] === metric && Number(x[idx.askYear]) === year)
  return r ? { value: Number(r[idx.askValue]), status: r[idx.status], app: Number(r[idx.appValue]), parent: r[idx.appParentNetProfit] ? Number(r[idx.appParentNetProfit]) : null } : null
}
try {
  const top = await db.calculatedMetric.findMany({
    where: { code: "roe", valueStatus: "OK", periodType: { in: ["ANNUAL","TTM"] }, value: { gt: 0 } },
    orderBy: { value: "desc" }, take: 25,
    select: { companyId: true, value: true, periodType: true, periodLabel: true, fiscalYear: true },
  })
  for (const r of top) {
    const c = await db.company.findUnique({ where: { id: r.companyId }, select: { ticker: true, nameEn: true, sector: true } })
    const y = r.fiscalYear
    const rep = await db.financialReport.findFirst({ where: { companyId: r.companyId, fiscalYear: y, periodType: r.periodType === "TTM" ? undefined : "ANNUAL" }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], select: { periodType: true, values: { where: { metricCode: { in: ["NET_PROFIT","NET_PROFIT_PARENT","TOTAL_EQUITY","TOTAL_ASSETS"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true } } } })
    const v = Object.fromEntries((rep?.values ?? []).map(x => [x.metricCode, x.normalizedValue]))
    const np = v.NET_PROFIT_PARENT ?? v.NET_PROFIT
    const eq = v.TOTAL_EQUITY
    const appRoe = np != null && eq ? (np / eq) * 100 : null
    const aNp = ask(c.ticker, "net_profit", y), aEq = ask(c.ticker, "total_equity", y)
    const askRoe = aNp?.value && aEq?.value ? (aNp.value / aEq.value) * 100 : null
    console.log(`${c.ticker.padEnd(5)} ${r.periodLabel.padEnd(18)} appROE=${r.value.toFixed(2)}% rawNP=${np?.toLocaleString("en-US")} eq=${eq?.toLocaleString("en-US")} | AskROE=${askRoe?.toFixed(2) ?? "n/a"}% askNP=${aNp?.value?.toLocaleString("en-US") ?? "n/a"}(${aNp?.status ?? ""}) askEq=${aEq?.value?.toLocaleString("en-US") ?? "n/a"}(${aEq?.status ?? ""})`)
  }
} finally { await db.$disconnect() }
