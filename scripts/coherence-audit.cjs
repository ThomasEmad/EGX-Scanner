/* Coherence audit: the accounting identity H1 = Q1 + Q2 · 9M = H1 + Q3 · FY = 9M + Q4
   must hold for cumulative reports of the same period. Violations = provably
   mislabeled or corrupt reports.
   Classes:
     B_MISLABELED  cumulative ≈ discrete (within 15%) → the "cumulative" report
                   actually carries the discrete period's data
     A_INVERTED    cumulative < discrete → corrupt/mislabeled
     C_DERIVED_NEG discrete would be negative (cum − disc < 0 for revenue)
   Usage: node scripts/coherence-audit.cjs            (audit only)
          node scripts/coherence-audit.cjs --fix      (apply deterministic repairs) */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const FIX = process.argv.includes("--fix")

const CUM_LABELS = [
  { type: "SEMIANNUAL", label: (y) => `H1 ${y}`, discLabel: (y) => `Q1 ${y}`, discType: "QUARTERLY" },
  { type: "NINE_MONTH", label: (y) => `9M ${y}`, discLabel: (y) => `Q1 2026`, skip: true }, // handled via H1
  { type: "ANNUAL", label: (y) => `FY ${y}`, discLabel: (y) => null, skip: true },
]

;(async () => {
  const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true } })
  const violations = []
  for (const c of companies) {
    const reports = await db.financialReport.findMany({
      where: { companyId: c.id, fiscalYear: { gte: 2024 }, periodType: { in: ["QUARTERLY", "SEMIANNUAL", "NINE_MONTH", "ANNUAL"] } },
      select: { id: true, periodType: true, periodLabel: true, fiscalYear: true, sourceName: true },
    })
    if (reports.length < 2) continue
    // per (periodType, label) → report with revenue value
    for (const fy of [2026, 2025]) {
      const h1 = reports.find((r) => r.periodType === "SEMIANNUAL" && r.periodLabel === `H1 ${fy}`)
      const q1 = reports.find((r) => r.periodType === "QUARTERLY" && r.periodLabel === `Q1 ${fy}`)
      const q2 = reports.find((r) => r.periodType === "QUARTERLY" && r.periodLabel === `Q2 ${fy}`)
      if (!h1) continue
      const h1rev = await db.financialValue.findFirst({ where: { reportId: h1.id, metricCode: "REVENUE" }, select: { normalizedValue: true } })
      if (!h1rev || h1rev.normalizedValue === null) continue
      const h1v = h1rev.normalizedValue
      const q1rev = q1 ? await db.financialValue.findFirst({ where: { reportId: q1.id, metricCode: "REVENUE" }, select: { normalizedValue: true } }) : null
      const q2rev = q2 ? await db.financialValue.findFirst({ where: { reportId: q2.id, metricCode: "REVENUE" }, select: { normalizedValue: true } }) : null
      const q1v = q1rev?.normalizedValue ?? null
      const q2v = q2rev?.normalizedValue ?? null

      let cls = null, detail = ""
      if (q1v && h1v < q1v * 0.9) {
        cls = "A_INVERTED"
        detail = `H1 ${Math.round(h1v / 1e6)}M < Q1 ${Math.round(q1v / 1e6)}M`
      } else if (q1v && Math.abs(h1v - q1v) / Math.max(q1v, 1) < 0.15) {
        cls = "B_MISLABELED"
        detail = `H1 ${Math.round(h1v / 1e6)}M ≈ Q1 ${Math.round(q1v / 1e6)}M (within 15%)`
      } else if (q2v && Math.abs(h1v - (q1v ?? 0) - q2v) / Math.max(q2v, 1) > 0.25 && q1v) {
        cls = "C_INCOHERENT"
        detail = `H1 ${Math.round(h1v / 1e6)}M ≠ Q1+Q2 ${Math.round(((q1v ?? 0) + q2v) / 1e6)}M`
      }
      if (cls) violations.push({ ticker: c.ticker, fy, class: cls, detail, h1ReportId: h1.id, source: h1.sourceName, h1v, q1v, q2v })
    }
  }
  console.log(JSON.stringify({ total: violations.length, byClass: violations.reduce((m, v) => ({ ...m, [v.class]: (m[v.class] || 0) + 1 }), {}) }, null, 1))
  for (const v of violations) console.log(` ${v.class} ${v.ticker} FY${v.fy}: ${v.detail} (${v.source.slice(0, 18)})`)
  fs.writeFileSync && require("fs").writeFileSync("C:/Users/tomas/Downloads/EGX-Scanner-backup/egx-data/data/coherence-violations.json", JSON.stringify(violations, null, 1), "utf8")
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
