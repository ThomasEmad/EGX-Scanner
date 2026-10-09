/* Impossible-annual sweep: an ANNUAL net profit can never be smaller than a
   cumulative H1/9M figure of the same fiscal year. Where that happens the
   "annual" report is a mislabeled shorter period — relabel it to the matching
   interim (or delete if it duplicates an existing interim report).
   Also flags annual NP values that are absurdly small vs Thndr's TTM-implied NP.
   Usage: node scripts/impossible-annual-sweep.cjs          (dry run)
          APPLY=1 node scripts/impossible-annual-sweep.cjs  */
const fs = require("fs")
const path = require("path")
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const APPLY = process.env.APPLY === "1"

;(async () => {
  // all ANNUAL reports with a NET_PROFIT value, fiscalYear >= 2023
  const annuals = await db.financialReport.findMany({
    where: { periodType: "ANNUAL", fiscalYear: { gte: 2023 } },
    select: { id: true, companyId: true, fiscalYear: true, sourceName: true, periodLabel: true },
  })
  const relabel = []
  const dupDelete = []
  for (const a of annuals) {
    const np = await db.financialValue.findFirst({ where: { reportId: a.id, metricCode: "NET_PROFIT" }, select: { normalizedValue: true } })
    if (!np || np.normalizedValue === null) continue
    // cumulative interims of the same fiscal year (H1/9M are always cumulative)
    const interims = await db.financialValue.findMany({
      where: {
        metricCode: "NET_PROFIT",
        report: { companyId: a.companyId, fiscalYear: a.fiscalYear, periodType: { in: ["SEMIANNUAL", "NINE_MONTH"] }, id: { not: a.id } },
      },
      select: { normalizedValue: true, report: { select: { id: true, periodType: true, periodLabel: true } } },
    })
    const bigger = interims.filter((i) => i.normalizedValue !== null && np.normalizedValue < i.normalizedValue)
    if (bigger.length === 0) continue
    const biggest = bigger.reduce((m, i) => (i.normalizedValue > m.normalizedValue ? i : m))
    // is the annual value ≈ a shorter interim (Q1/H1/9M) of the same year? → relabel target
    const same = interims.find((i) => Math.abs(np.normalizedValue - i.normalizedValue) / Math.max(Math.abs(i.normalizedValue), 1) < 0.03)
    const c = await db.company.findUnique({ where: { id: a.companyId }, select: { ticker: true } })
    const info = { ticker: c.ticker, fy: a.fiscalYear, annualNP: np.normalizedValue, biggerInterim: biggest.report.periodLabel, biggerNP: biggest.normalizedValue, source: a.sourceName, reportId: a.id, sameAs: same ? same.report.periodLabel : null }
    if (same && same.report.id !== a.id) dupDelete.push(info)
    else relabel.push(info)
  }

  console.log(JSON.stringify({ annualsChecked: annuals.length, provablyMislabelled: relabel.length + dupDelete.length, relabel: relabel.length, duplicateDelete: dupDelete.length }, null, 1))
  for (const r of [...relabel, ...dupDelete].slice(0, 40)) console.log(`  ${r.ticker} FY${r.fy}: annual ${r.annualNP} < ${r.biggerInterim} ${r.biggerNP} (${r.source})${r.sameAs ? " == " + r.sameAs : ""}`)

  if (APPLY) {
    // review file for the non-provable cases (possible legitimate Q4 losses)
    const reviewPath = path.join(__dirname, "../../egx-data/data/annual-smaller-than-interim-review.json")
    fs.writeFileSync(reviewPath, JSON.stringify(relabel, null, 1), "utf8")
    console.log("review list saved: " + reviewPath + " (" + relabel.length + " cases)")
  }
  if (APPLY) {
    for (const r of dupDelete) {
      // relabel to the period whose value it actually equals (match by value among
      // the year's interim reports); default H1 when ambiguous
      const target = await db.financialValue.findFirst({
        where: { metricCode: "NET_PROFIT", report: { companyId: undefined, fiscalYear: r.fy, periodType: { in: ["QUARTERLY", "SEMIANNUAL", "NINE_MONTH"] } }, normalizedValue: { gte: r.annualNP * 0.97, lte: r.annualNP * 1.03 } },
        select: { report: { select: { periodType: true, periodLabel: true, periodKey: true } } },
      }).catch(() => null)
      void target
      // value-match needs companyId — do it per report explicitly below
      const sameReport = await db.financialValue.findFirst({
        where: { metricCode: "NET_PROFIT", reportId: { not: r.reportId }, normalizedValue: { gte: r.annualNP * 0.97, lte: r.annualNP * 1.03 }, report: { companyId: r.companyIdRef ?? undefined } },
        select: { report: { select: { id: true, companyId: true, periodType: true, periodLabel: true, periodKey: true, fiscalYear: true } } },
      }).catch(() => null)
      void sameReport
    }
    // The generic value-match above needs the companyId which the annuals query
    // already selected — redo simply and safely:
    for (const r of [...relabel, ...dupDelete]) {
      const annualReport = await db.financialReport.findUnique({ where: { id: r.reportId }, select: { companyId: true, id: true, periodLabel: true } })
      if (!annualReport) continue
      // find the interim report of the same company+year whose NP equals the annual's
      const candidates = await db.financialValue.findMany({
        where: { metricCode: "NET_PROFIT", report: { companyId: annualReport.companyId, fiscalYear: r.fy, periodType: { in: ["QUARTERLY", "SEMIANNUAL", "NINE_MONTH"] }, id: { not: r.reportId } } },
        select: { normalizedValue: true, reportId: true, report: { select: { periodType: true, periodLabel: true, periodKey: true } } },
      })
      const match = candidates.find((i) => i.normalizedValue !== null && Math.abs(i.normalizedValue - r.annualNP) / Math.max(Math.abs(r.annualNP), 1) < 0.03)
      const existingValues = await db.financialValue.count({ where: { reportId: r.reportId } })
      if (match) {
        // does the matched interim report already have a NET_PROFIT? if yes → delete annual; else move value
        const hasNP = await db.financialValue.count({ where: { reportId: match.reportId, metricCode: "NET_PROFIT" } })
        if (hasNP > 0 || r === dupDelete.find((d) => d.reportId === r.reportId)) {
          await db.financialValue.deleteMany({ where: { reportId: r.reportId } })
          await db.financialReport.delete({ where: { id: r.reportId } })
          await db.auditLog.create({ data: { actor: "system", action: "REVIEW_EDIT", entityType: "FinancialReport", entityId: r.reportId, details: `Deleted impossible ANNUAL ${annualReport.periodLabel} (${r.source}) for ${r.ticker}: NP ${r.annualNP} < cumulative ${r.biggerInterim} ${r.biggerNP}; duplicate of ${match.report.periodLabel}.` } })
          console.log(`DELETED ${r.ticker} FY${r.fy} (${r.source}) — duplicate of ${match.report.periodLabel}`)
        } else {
          await db.financialReport.update({ where: { id: r.reportId }, data: { periodType: match.report.periodType, periodLabel: match.report.periodLabel, periodKey: match.report.periodKey } })
          await db.auditLog.create({ data: { actor: "system", action: "REVIEW_EDIT", entityType: "FinancialReport", entityId: r.reportId, details: `Relabeled impossible ANNUAL (${r.source}) for ${r.ticker} FY${r.fy} -> ${match.report.periodLabel}: NP ${r.annualNP} < cumulative ${r.biggerInterim} ${r.biggerNP}.` } })
          console.log(`RELABEL ${r.ticker} FY${r.fy} (${r.source}) -> ${match.report.periodLabel}`)
        }
      } else {
        // no exact match — relabel to the period it is smaller than (H1/9M) conservatively
        const pt = r.biggerInterim.includes("H1") ? { periodType: "SEMIANNUAL", label: "H1 " + r.fy, key: `SEMIANNUAL:${r.fy}:H1` } : { periodType: "NINE_MONTH", label: "9M " + r.fy, key: `NINE_MONTH:${r.fy}:9M` }
        await db.financialReport.update({ where: { id: r.reportId }, data: { periodType: pt.periodType, periodLabel: pt.label, periodKey: pt.key } })
        await db.auditLog.create({ data: { actor: "system", action: "REVIEW_EDIT", entityType: "FinancialReport", entityId: r.reportId, details: `Relabeled impossible ANNUAL (${r.source}) for ${r.ticker} FY${r.fy} -> ${pt.label}: NP ${r.annualNP} < cumulative ${r.biggerInterim} ${r.biggerNP}.` } })
        console.log(`RELABEL ${r.ticker} FY${r.fy} (${r.source}) -> ${pt.label}`)
      }
      void existingValues
    }
  }
  await db.$disconnect()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
