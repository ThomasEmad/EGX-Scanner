// Universe-wide coverage survey: quantify the investor's complaint.
//  A. empty quarterly reports (0 values)
//  B. duplicate conflicting values within a report (same metric, CURRENT)
//  C. rounded "display-rounded" values count
//  D. impossible flow values (|v| > 25x nearest annual same metric)
//  E. stale latest period per company (latest report periodEnd older than cutoff)
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const NOW = new Date()
const STALE_MONTHS = 8  // no report newer than ~8 months = stale
const staleCutoff = new Date(NOW.getTime() - STALE_MONTHS * 30 * 86400000)

const companies = await db.company.findMany({
  where: { isActive: true },
  select: { id: true, ticker: true, nameAr: true },
  orderBy: { ticker: "asc" },
})
console.log(`active companies: ${companies.length}`)

const reports = await db.financialReport.findMany({
  where: {
    companyId: { in: companies.map(c => c.id) },
    deletedAt: null, isDemoData: false,
    processingStatus: { notIn: ["FAILED", "REJECTED", "DELETED"] },
    periodType: { in: ["ANNUAL", "QUARTERLY", "SEMIANNUAL", "NINE_MONTH"] },
    statementType: "CONSOLIDATED",
  },
  select: {
    id: true, companyId: true, periodType: true, periodLabel: true, periodEnd: true, supersedesId: true,
    values: { select: { id: true, metricCode: true, normalizedValue: true, subPeriod: true, validationNotes: true } },
  },
})
const superseded = new Set(reports.map(r => r.supersedesId).filter(Boolean))

const emptyQuarterly = []
const dupReports = []
let roundedVals = 0
const impossible = []
const latestByCompany = new Map()

for (const r of reports) {
  if (superseded.has(r.id)) continue
  const cur = r.values.filter(v => v.subPeriod === "CURRENT" || v.subPeriod === null)
  const c = companies.find(x => x.id === r.companyId)

  // latest periodEnd
  if (r.periodEnd && (!latestByCompany.has(r.companyId) || r.periodEnd > latestByCompany.get(r.companyId).end)) {
    latestByCompany.set(r.companyId, { ticker: c?.ticker, end: r.periodEnd, label: r.periodLabel })
  }

  if (r.periodType !== "ANNUAL" && cur.length === 0) emptyQuarterly.push({ ticker: c?.ticker, label: r.periodLabel, end: r.periodEnd })

  // duplicates
  const byMetric = new Map()
  for (const v of cur) {
    const arr = byMetric.get(v.metricCode) ?? []
    arr.push(v)
    byMetric.set(v.metricCode, arr)
    if (String(v.validationNotes ?? "").includes("display-rounded")) roundedVals++
  }
  for (const [metric, arr] of byMetric) {
    if (arr.length > 1) {
      const uniq = [...new Set(arr.map(v => v.normalizedValue))]
      if (uniq.length > 1) dupReports.push({ ticker: c?.ticker, label: r.periodLabel, metric, values: uniq })
    }
  }
}

// impossible flows vs annual
const annualByCompanyMetric = new Map()
for (const r of reports) {
  if (superseded.has(r.id) || r.periodType !== "ANNUAL") continue
  for (const v of r.values.filter(v => v.subPeriod === "CURRENT" || v.subPeriod === null)) {
    const key = `${r.companyId}|${v.metricCode}`
    const arr = annualByCompanyMetric.get(key) ?? []
    arr.push(Math.abs(v.normalizedValue))
    annualByCompanyMetric.set(key, arr)
  }
}
for (const r of reports) {
  if (superseded.has(r.id) || r.periodType === "ANNUAL") continue
  for (const v of r.values.filter(v => v.subPeriod === "CURRENT" || v.subPeriod === null)) {
    const refs = annualByCompanyMetric.get(`${r.companyId}|${v.metricCode}`)
    if (!refs?.length) continue
    const med = refs.sort((a, b) => a - b)[Math.floor(refs.length / 2)]
    if (med > 0 && Math.abs(v.normalizedValue) > med * 25) {
      impossible.push({ ticker: companies.find(x => x.id === r.companyId)?.ticker, label: r.periodLabel, metric: v.metricCode, value: v.normalizedValue, annualMedian: med })
    }
  }
}

// stale companies
const stale = [...latestByCompany.entries()].filter(([, v]) => v.end < staleCutoff).map(([id, v]) => ({ ticker: v.ticker, latest: v.label, end: v.end.toISOString().slice(0, 10) }))
const noReports = companies.filter(c => !latestByCompany.has(c.id)).map(c => c.ticker)

console.log(`\nA. empty quarterly reports: ${emptyQuarterly.length}`)
const emptyByTicker = {}
for (const e of emptyQuarterly) emptyByTicker[e.ticker] = (emptyByTicker[e.ticker] ?? 0) + 1
console.log("   by ticker:", JSON.stringify(emptyByTicker))

console.log(`\nB. duplicate conflicting values: ${dupReports.length}`)
for (const d of dupReports.slice(0, 30)) console.log(`   ${d.ticker} ${d.label} ${d.metric}: ${d.values.join(" vs ")}`)

console.log(`\nC. rounded values total: ${roundedVals}`)

console.log(`\nD. impossible values (>25x annual median): ${impossible.length}`)
for (const d of impossible.slice(0, 30)) console.log(`   ${d.ticker} ${d.label} ${d.metric}: ${d.value} vs med ${d.annualMedian}`)

console.log(`\nE. stale companies (latest report older than ${STALE_MONTHS} months): ${stale.length}`)
for (const s of stale.slice(0, 40)) console.log(`   ${s.ticker}: latest=${s.latest} (${s.end})`)
console.log(`   companies with NO reports at all: ${noReports.length} → ${noReports.slice(0, 20).join(", ")}`)

await db.$disconnect()
