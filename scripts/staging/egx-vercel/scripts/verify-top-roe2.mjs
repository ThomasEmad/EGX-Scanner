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
  const api = await fetch("http://localhost:3000/api/v1/rankings?metric=roe&basis=latest").then(r=>r.json())
  for (const r of api.results.slice(0, 25)) {
    const rep = await db.financialReport.findFirst({ where: { companyId: r.companyId, fiscalYear: r.fiscalYear, periodType: r.periodType === "TTM" ? undefined : "ANNUAL" }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], select: { periodType: true, periodLabel: true, values: { where: { metricCode: { in: ["NET_PROFIT","NET_PROFIT_PARENT","TOTAL_EQUITY","TOTAL_ASSETS"] } }, select: { metricCode: true, normalizedValue: true } } } })
    const v = Object.fromEntries((rep?.values ?? []).map(x => [x.metricCode, x.normalizedValue]))
    const np = v.NET_PROFIT_PARENT ?? v.NET_PROFIT
    const eq = v.TOTAL_EQUITY
    const aNp = ask(r.ticker, "net_profit", r.fiscalYear), aEq = ask(r.ticker, "total_equity", r.fiscalYear)
    const askRoe = aNp?.value && aEq?.value ? (aNp.value / aEq.value) * 100 : null
    console.log(`${r.ticker.padEnd(5)} ${r.periodLabel.padEnd(20)} appROE=${r.value.toFixed(2)}% rawNP=${np?.toLocaleString("en-US")} eq=${eq?.toLocaleString("en-US")} | AskROE=${askRoe?.toFixed(2) ?? "n/a"}% askNP=${aNp?.value?.toLocaleString("en-US") ?? "n/a"}(${aNp?.status ?? ""}) askEq=${aEq?.value?.toLocaleString("en-US") ?? "n/a"}(${aEq?.status ?? ""})`)
  }
} finally { await db.$disconnect() }
