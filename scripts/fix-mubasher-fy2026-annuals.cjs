/* Fiscal-calendar-correct relabel of MUBASHER_EARNINGS "FY2026 ANNUAL" reports.
   A Dec-FY company cannot have a FY2026 annual in Sept 2026 — the Mubasher
   earnings-table row labeled "السنوي 2026" actually carried the latest CUMULATIVE
   interim (H1 2026, periodEnd 2026-06-30). June-FY companies' FY2026 (ended
   Jun-2026) IS a legitimate annual and is kept.
   The company's fiscal calendar is read from its own FY2025 annual periodEnd month.
   Usage: node scripts/fix-mubasher-fy2026-annuals.cjs         (dry run)
          APPLY=1 node scripts/fix-mubasher-fy2026-annuals.cjs */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const APPLY = process.env.APPLY === "1"

;(async () => {
  const reps = await db.financialReport.findMany({
    where: { sourceName: "MUBASHER_EARNINGS", periodType: "ANNUAL", fiscalYear: 2026 },
    select: { id: true, companyId: true },
  })
  let relabeled = 0, mergedDeleted = 0, keptJuneFY = 0, skipped = 0
  const log = []
  for (const r of reps) {
    const fyEndMonth = await (async () => {
      const fy25 = await db.financialReport.findFirst({
        where: { companyId: r.companyId, periodType: "ANNUAL", fiscalYear: { lte: 2025 } },
        orderBy: { fiscalYear: "desc" },
        select: { periodEnd: true },
      })
      return fy25?.periodEnd ? fy25.periodEnd.getUTCMonth() + 1 : 12 // default Dec-FY
    })()
    if (fyEndMonth >= 4 && fyEndMonth <= 8) {
      keptJuneFY++
      continue // FY2026 ended ~Jun 2026 — legitimate annual
    }
    if (fyEndMonth < 9 && fyEndMonth !== 12) { skipped++; continue } // unusual calendars — manual only

    const co = await db.company.findUnique({ where: { id: r.companyId }, select: { ticker: true } })
    const existingH1 = await db.financialReport.findFirst({
      where: { companyId: r.companyId, periodType: "SEMIANNUAL", periodLabel: "H1 2026", id: { not: r.id } },
      select: { id: true },
    })
    const annualNP = await db.financialValue.findFirst({ where: { reportId: r.id, metricCode: "NET_PROFIT" }, select: { normalizedValue: true } })
    const desc = `${co.ticker} FY2026 annualNP=${annualNP?.normalizedValue ?? "?"}`
    if (!APPLY) { log.push(`WOULD-RELABEL ${desc} -> H1 2026${existingH1 ? " (existing H1 → merge/delete)" : ""}`); continue }

    if (!existingH1) {
      await db.financialReport.update({
        where: { id: r.id },
        data: { periodType: "SEMIANNUAL", periodLabel: "H1 2026", periodEnd: new Date("2026-06-30T00:00:00Z") },
      })
      await db.auditLog.create({ data: { actor: "system", action: "REVIEW_EDIT", entityType: "FinancialReport", entityId: r.id, details: `Relabeled Mubasher FY2026 ANNUAL -> SEMIANNUAL H1 2026 for ${co.ticker}: Dec-FY company cannot have FY2026 annual in Sept 2026 — Mubasher earnings row carried the latest cumulative interim (periodEnd was Dec-31 placeholder). FY-end month: ${fyEndMonth}.` } })
      relabeled++
      log.push(`RELABEL ${desc} -> H1 2026`)
    } else {
      // H1 2026 already exists from another source — move non-conflicting values, delete the annual
      const have = new Set((await db.financialValue.findMany({ where: { reportId: existingH1.id }, select: { metricCode: true, statementType: true } })).map(v => v.metricCode + ":" + v.statementType))
      const annualValues = await db.financialValue.findMany({ where: { reportId: r.id } })
      let moved = 0
      for (const v of annualValues) {
        if (have.has(v.metricCode + ":" + v.statementType)) continue
        await db.financialValue.update({ where: { id: v.id }, data: { reportId: existingH1.id } })
        moved++
      }
      await db.financialValue.deleteMany({ where: { reportId: r.id } })
      await db.financialReport.delete({ where: { id: r.id } })
      await db.auditLog.create({ data: { actor: "system", action: "REVIEW_EDIT", entityType: "FinancialReport", entityId: existingH1.id, details: `Merged Mubasher FY2026 ANNUAL (Dec-FY company ${co.ticker}, actually H1 2026 cumulative) into existing H1 2026: ${moved} values moved, ${annualValues.length - moved} duplicated; annual deleted.` } })
      mergedDeleted++
      log.push(`MERGE+DELETE ${desc} (${moved} moved)`)
    }
  }
  console.log(JSON.stringify({ total: reps.length, relabeled, mergedDeleted, keptJuneFY, skipped, applied: APPLY }, null, 1))
  for (const l of log.slice(0, 60)) console.log(" " + l)
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
