/* DATA-QUALITY-AUDIT-FULL — implements the 8-category audit from
   DATA-AUDIT-PROMPT.md over the live EGX Scanner DB, stores AuditRun +
   AuditIssue + CompanyConfidenceScore (Z's models).
   Usage: node scripts/data-quality-audit-full.cjs [--runId=...]  */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient({ log: ["error"] })

const CRITICAL_METRICS = ["revenue", "net_profit", "total_assets", "total_equity", "eps"]
const STOCK_SKIP = new Set(["OPENING_CASH"])

function monthsSince(d) { return (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24 * 30.4) }
function severityOf(pct) { return pct > 0.05 ? "critical" : pct > 0.01 ? "high" : "medium" }

;(async () => {
  const run = await db.auditRun.create({ data: { type: "manual", status: "running" } })
  const issues = []
  const confidences = []
  const companies = await db.company.findMany({
    where: { isActive: true },
    select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true, isin: true, sourceUrl: true },
  })

  for (const c of companies) {
    const score = { coverage: 100, accounting: 0, conflicts: 0, anomalies: 0, stale: 0, sources: 0, isin: 0 }
    let companyIssues = 0

    const metrics = await db.calculatedMetric.findMany({
      where: { companyId: c.id },
      select: { code: true, value: true, periodLabel: true, periodType: true, fiscalYear: true, periodKey: true, calculatedAt: true },
    })
    const byCode = new Map()
    for (const m of metrics) {
      if (m.value === null || m.value === undefined) continue
      if (!byCode.has(m.code)) byCode.set(m.code, [])
      byCode.get(m.code).push(m)
    }
    const latest = (code) => {
      const arr = byCode.get(code)
      if (!arr || arr.length === 0) return null
      return arr.reduce((a, b) => (b.fiscalYear > a.fiscalYear ? b : a))
    }

    // —— C5 Missing critical metrics (latest year) ——
    let missing = 0
    for (const code of CRITICAL_METRICS) {
      if (!byCode.has(code)) { missing++; issues.push({ ticker: c.ticker, metricCode: code, category: "missing", severity: missing >= 3 ? "critical" : "high", description: `Missing critical metric ${code} — company has no computed value`, period: "latest" }) }
    }
    // coverage % across the 5 core
    const coreHave = CRITICAL_METRICS.filter((k) => byCode.has(k)).length
    score.coverage = Math.round((coreHave / CRITICAL_METRICS.length) * 100)

    // —— C1 Accounting identity: BS equation on the latest year having all three ——
    const years = [...new Set(metrics.filter((m) => ["total_assets", "total_equity"].includes(m.code)).map((m) => m.fiscalYear))].sort((a, b) => b - a)
    for (const fy of years.slice(0, 2)) {
      const ta = metrics.find((m) => m.code === "total_assets" && m.fiscalYear === fy && m.value !== null)
      const te = metrics.find((m) => m.code === "total_equity" && m.fiscalYear === fy && m.value !== null)
      const tl = metrics.find((m) => m.code === "total_liabilities" && m.fiscalYear === fy && m.value !== null)
      if (!ta || !te || !tl || !ta.value || !te.value || !tl.value) continue
      const diff = Math.abs(ta.value - (tl.value + te.value)) / Math.abs(ta.value)
      if (diff > 0.005) {
        const sev = severityOf(diff)
        issues.push({ ticker: c.ticker, metricCode: "total_assets", period: `FY ${fy}`, category: "accounting", severity: sev, description: `Balance sheet identity violated: assets ${Math.round(ta.value/1e6)}M ≠ liabilities ${Math.round(tl.value/1e6)}M + equity ${Math.round(te.value/1e6)}M (diff ${(diff*100).toFixed(1)}%)`, currentValue: String(Math.round(ta.value)), expectedValue: String(Math.round(tl.value + te.value)) })
        companyIssues++
        if (sev === "critical") score.accounting += 20; else if (sev === "high") score.accounting += 10; else score.accounting += 5
      }
    }

    // —— C2 Logical: signs + ratio logic + margins ——
    const signChecks = [["revenue", "REVENUE"], ["total_assets", "TOTAL_ASSETS"], ["market_cap", "MARKET_CAP"]]
    for (const [code, name] of signChecks) {
      const m = latest(code)
      if (m && m.value < 0) { issues.push({ ticker: c.ticker, metricCode: code, period: m.periodLabel, category: "logical", severity: "critical", description: `Negative ${name} = ${Math.round(m.value/1e6)}M — impossible` }); companyIssues++; score.accounting += 20 }
    }
    const pe = latest("p_e")
    if (pe && pe.value > 200) { issues.push({ ticker: c.ticker, metricCode: "p_e", period: pe.periodLabel, category: "logical", severity: "high", description: `P/E = ${pe.value.toFixed(0)} — extreme (over 200)` }); companyIssues++; score.accounting += 10 }
    const roe = latest("roe")
    const teLatest = latest("total_equity")
    if (roe && teLatest && teLatest.value > 0 && roe.value > 100) { issues.push({ ticker: c.ticker, metricCode: "roe", period: roe.periodLabel, category: "logical", severity: "high", description: `ROE = ${roe.value.toFixed(0)}% with positive equity — suspicious` }); companyIssues++; score.accounting += 10 }
    const nm = latest("net_margin")
    if (nm && nm.value > 100) { issues.push({ ticker: c.ticker, metricCode: "net_margin", period: nm.periodLabel, category: "logical", severity: "critical", description: `Net margin ${nm.value.toFixed(0)}% — impossible (>100%)` }); companyIssues++; score.accounting += 20 }
    const cr = latest("current_ratio")
    if (cr && (cr.value > 10 || cr.value < 0.05)) { issues.push({ ticker: c.ticker, metricCode: "current_ratio", period: cr.periodLabel, category: "outlier", severity: "medium", description: `Current ratio ${cr.value.toFixed(2)} — extreme` }); companyIssues++; score.anomalies += 5 }

    // —— C3 Temporal: YoY jumps + stale ——
    for (const code of ["revenue_growth", "profit_growth"]) {
      const arr = (byCode.get(code) ?? []).filter((m) => m.periodType === "ANNUAL").sort((a, b) => b.fiscalYear - a.fiscalYear)
      const m = arr[0]
      if (!m || m.value === null) continue
      if (code === "revenue_growth" && (m.value > 200 || m.value < -50)) { issues.push({ ticker: c.ticker, metricCode: code, period: m.periodLabel, category: "temporal", severity: "high", description: `Revenue YoY ${m.value.toFixed(0)}% — acquisition, divestiture or error` }); companyIssues++; score.anomalies += 5 }
      if (code === "profit_growth" && (m.value > 500 || m.value < -80)) { issues.push({ ticker: c.ticker, metricCode: code, period: m.periodLabel, category: "temporal", severity: "medium", description: `Profit YoY ${m.value.toFixed(0)}% — turnaround or error` }); companyIssues++; score.anomalies += 5 }
    }

    // —— stale data (latest report of any type) ——
    const latestRep = await db.financialReport.findFirst({ where: { companyId: c.id }, orderBy: { periodEnd: "desc" }, select: { periodEnd: true, periodLabel: true } })
    const age = latestRep ? monthsSince(latestRep.periodEnd) : 999
    if (age > 18) { issues.push({ ticker: c.ticker, category: "temporal", severity: "critical", description: `Stale data: latest period ${latestRep?.periodLabel ?? "?"} is ${Math.round(age)} months old` }); companyIssues++; score.stale += 20 }
    else if (age > 12) { issues.push({ ticker: c.ticker, category: "temporal", severity: "medium", description: `Data ${Math.round(age)} months old` }); companyIssues++; score.stale += 5 }

    // —— C4 Cross-source conflicts: same (metric, periodLabel) different values in different reports ——
    const fvRows = await db.financialValue.findMany({
      where: { companyId: c.id, metricCode: { in: ["REVENUE", "NET_PROFIT"] } },
      select: { metricCode: true, normalizedValue: true, reportId: true, report: { select: { periodLabel: true, sourceName: true } } },
    })
    const byKey = new Map()
    for (const v of fvRows) {
      if (v.normalizedValue === null || v.normalizedValue === undefined) continue
      const k = v.metricCode + "|" + v.report.periodLabel
      if (!byKey.has(k)) byKey.set(k, [])
      byKey.get(k).push(v)
    }
    for (const [k, arr] of byKey) {
      if (arr.length < 2) continue
      const vals = arr.map((a) => a.normalizedValue)
      const spread = (Math.max(...vals) - Math.min(...vals)) / Math.max(...vals.map(Math.abs), 1)
      if (spread > 0.15) {
        issues.push({ ticker: c.ticker, metricCode: k.split("|")[0], period: k.split("|")[1], category: "cross_source", severity: spread > 0.3 ? "critical" : "high", description: `Cross-source conflict: ${arr.map((a) => a.report.sourceName.slice(0, 12) + "=" + Math.round(a.normalizedValue / 1e6) + "M").join(" vs ")} (spread ${(spread * 100).toFixed(0)}%)`, currentValue: String(Math.round(Math.max(...vals) / 1e6)) })
        companyIssues++
        score.conflicts += spread > 0.3 ? 15 : 7
      }
    }

    // —— C7 Provenance: placeholder ISIN ——
    if (c.isin && ["EGS02091C019"].includes(c.isin)) { issues.push({ ticker: c.ticker, category: "provenance", severity: "critical", description: "Placeholder ISIN" }); companyIssues++; score.isin += 25 }

    // —— source diversity ——
    const srcs = await db.financialReport.findMany({ where: { companyId: c.id }, select: { sourceName: true }, distinct: ["sourceName"] })
    if (srcs.length === 1) score.sources -= 10
    else if (srcs.length === 2) score.sources -= 5

    // —— confidence ——
    const sc = Math.max(0, Math.min(100, Math.round(100 - (100 - score.coverage) * 0.5 - score.accounting - score.conflicts - score.anomalies - score.stale - Math.max(0, score.sources) - score.isin)))
    const rating = sc >= 80 ? "high" : sc >= 60 ? "medium" : sc >= 30 ? "low" : "critical"
    confidences.push({ ticker: c.ticker, companyId: c.id, score: sc, rating, breakdown: score, issues: issues.splice(0, issues.length) })
    void companyIssues
  }

  // —— persist ——
  const durationSec = Math.round((Date.now() - new Date(run.startedAt).getTime()) / 1000)
  const totalIssues = confidences.reduce((s, x) => s + x.issues.length, 0)
  const updated = await db.auditRun.update({
    where: { id: run.id },
    data: { endedAt: new Date(), companiesChecked: companies.length, issuesFound: totalIssues, status: "completed", durationSec },
  })
  for (const conf of confidences) {
    const { issues, breakdown, companyId, ...rest } = conf
    await db.companyConfidenceScore.create({
      data: { ...rest, breakdownJson: JSON.stringify(breakdown), auditRunId: run.id },
    })
    for (const iss of issues) {
      await db.auditIssue.create({ data: { ...iss, auditRunId: run.id } })
    }
  }
  const bySev = await db.auditIssue.groupBy({ by: ["severity"], where: { auditRunId: run.id }, _count: true })
  console.log(JSON.stringify({ runId: run.id, companies: companies.length, issues: totalIssues, durationSec, bySeverity: bySev.map((g) => g.severity + ":" + g._count).join(" ") }, null, 1))
  const dist = await db.companyConfidenceScore.groupBy({ by: ["rating"], _count: true })
  console.log("confidence distribution:", dist.map((d) => d.rating + ":" + d._count).join(" | "))
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
