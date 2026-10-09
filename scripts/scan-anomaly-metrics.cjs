/* Growth & ratio anomaly scanner over CalculatedMetrics.
   Flags per code family (read-only diagnostic):
   growth codes (revenue_growth, profit_growth, eps_growth, ocf_growth, debt_growth, asset_growth, equity_growth):
     flag if |g| > 5 (i.e. >500%) — split by base size: base |prev| >= 1e6 => "healthy-base anomaly (root-cause)";
     base < 1e6 or sign flip => "small-base/sign-flip artifact (real math)".
   margins (gross_margin, operating_margin, net_margin): flag v < -2 or v > 1.5 (as fractions? values stored as % — detect scale by inspecting)
   roe/roa: |v| > 3 (300%) — again percent-scale aware
   current_ratio > 50, debt_to_equity > 50, liabilities_to_equity > 50, p_e > 500 or < 0, p_b > 100
   Output: counts + worst offenders with company/period/value. */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const GROWTH = ["revenue_growth","profit_growth","eps_growth","ocf_growth","debt_growth","asset_growth","equity_growth"]
const PCT = ["gross_margin","operating_margin","net_margin","roe","roa","dividend_yield"]
const RATIO = ["current_ratio","debt_to_equity","liabilities_to_equity","p_e","p_b"]
;(async () => {
  const companies = await db.company.findMany({ select: { id: true, ticker: true } })
  const tk = new Map(companies.map(c => [c.id, c.ticker]))
  const cms = await db.calculatedMetric.findMany({
    where: { code: { in: [...GROWTH, ...PCT, ...RATIO] }, value: { not: undefined } },
    select: { companyId: true, code: true, periodKey: true, value: true, valueStatus: true, formula: true, sourcePeriods: true },
  })
  const rootCause = []
  const counts = {}
  let seen = 0
  for (const m of cms) {
    if (m.value == null) continue
    seen++
    const v = m.value
    let kind = null, detail = ""
    if (GROWTH.includes(m.code)) {
      // percent scale: 106.2 = +106.2%
      if (Math.abs(v) > 500) { kind = "EXTREME"; detail = `g=${v.toFixed(0)}%` }
      else if (Math.abs(v) > 200) { kind = "high"; detail = `g=${v.toFixed(0)}%` }
    } else if (["gross_margin","operating_margin","net_margin"].includes(m.code)) {
      // percent scale: 45 = 45%
      if (v < -200 || v > 150) { kind = "EXTREME"; detail = `${v.toFixed(0)}%` }
    } else if (["roe","roa"].includes(m.code)) {
      if (Math.abs(v) > 300) { kind = "EXTREME"; detail = `${v.toFixed(0)}%` }
    } else if (RATIO.includes(m.code)) {
      if (m.code === "p_e" && v > 500) { kind = "EXTREME"; detail = `p/e=${v.toFixed(0)}` }
      if (m.code === "p_b" && v > 100) { kind = "EXTREME"; detail = `p/b=${v.toFixed(0)}` }
      if (["current_ratio","debt_to_equity","liabilities_to_equity"].includes(m.code) && Math.abs(v) > 50) { kind = "EXTREME"; detail = `${m.code}=${v.toFixed(0)}` }
    }
    if (kind) {
      const key = kind + ":" + m.code
      counts[key] = (counts[key] || 0) + 1
      if (kind === "EXTREME" && rootCause.length < 60) rootCause.push(`${tk.get(m.companyId)} ${m.code} ${m.periodKey} = ${m.value.toPrecision(6)} (${detail})`)
    }
  }
  console.log("scanned:", seen, "rows")
  console.log("flag counts:", JSON.stringify(counts, null, 1))
  console.log("--- worst (EXTREME) offenders:")
  console.log(rootCause.join("\n"))
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
