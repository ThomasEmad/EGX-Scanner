import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()

function median(a) { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

const FIN = /bank|financ|insur|invest/i

try {
  const companies = await db.company.findMany({ select: { id: true, ticker: true, sector: true } })
  const rows = []
  for (const co of companies) {
    const vals = await db.financialValue.findMany({
      where: { companyId: co.id, metricCode: "TOTAL_ASSETS", validationStatus: "VALID" },
      select: { normalizedValue: true, report: { select: { periodType: true, periodLabel: true, fiscalYear: true } } },
    })
    const annual = vals.filter(v => v.report.periodType === "ANNUAL" && v.normalizedValue > 0)
    if (annual.length < 2) continue
    const med = median(annual.map(v => v.normalizedValue))
    const fin = FIN.test(co.sector || "")
    for (const v of annual) {
      const ratio = v.normalizedValue / med
      const cap = fin ? 5e12 : 2e12
      if (v.normalizedValue > cap || ratio > 50 || ratio < 0.02) {
        rows.push({ ticker: co.ticker, sector: co.sector, fy: v.report.fiscalYear, label: v.report.periodLabel, value: v.normalizedValue, median: med, ratio: Number(ratio.toFixed(3)), fin })
      }
    }
  }
  console.log("flagged annual TOTAL_ASSETS periods:", rows.length)
  for (const r of rows.sort((a, b) => b.value - a.value)) console.log(r.ticker.padEnd(6), String(r.fy), r.value.toExponential(2), "median", r.median.toExponential(2), "ratio", r.ratio, r.fin ? "FIN" : "", r.sector)

  // revenue sanity
  const revRows = []
  for (const co of companies) {
    const vals = await db.financialValue.findMany({
      where: { companyId: co.id, metricCode: "REVENUE", validationStatus: "VALID" },
      select: { normalizedValue: true, report: { select: { periodType: true, fiscalYear: true } } },
    })
    const annual = vals.filter(v => v.report.periodType === "ANNUAL" && v.normalizedValue > 0)
    if (annual.length < 2) continue
    const med = median(annual.map(v => v.normalizedValue))
    for (const v of annual) {
      const ratio = v.normalizedValue / med
      if (ratio > 50 || ratio < 0.02) revRows.push({ ticker: co.ticker, fy: v.report.fiscalYear, value: v.normalizedValue, median: med, ratio: Number(ratio.toFixed(3)) })
    }
  }
  console.log("\nflagged annual REVENUE periods (ratio>50 or <0.02):", revRows.length)
  for (const r of revRows.sort((a, b) => b.ratio - a.ratio).slice(0, 30)) console.log(r.ticker.padEnd(6), String(r.fy), r.value.toExponential(2), "median", r.median.toExponential(2), "ratio", r.ratio)
} finally { await db.$disconnect() }
