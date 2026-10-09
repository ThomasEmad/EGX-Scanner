/* EGAL FY2022 REVENUE repair — internal-consistency proof (same report):
   FY2022 REVENUE stored = 10 (corrupt placeholder). The SAME Yahoo report has
   COGS = 10,963,806,687 and GROSS_PROFIT = 3,518,085,183, and REVENUE = COGS + GROSS_PROFIT
   => 14,481,891,870 (= 14,481.9M). This EXACTLY matches stockanalysis.com/egx/EGAL FY2022
   (Jun '22) revenue = 14,482M EGP. Guard: only writes if stored value is still the corrupt 10.
   Usage: node scripts/repair-egal-2022.cjs */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()

const CORRECT_REVENUE = 10963806687 + 3518085183 // = 14,481,891,870 (COGS + GROSS_PROFIT)

;(async () => {
  const co = await db.company.findFirst({ where: { ticker: "EGAL" }, select: { id: true } })
  const rep = await db.financialReport.findFirst({
    where: { companyId: co.id, periodType: "ANNUAL", fiscalYear: 2022 },
    select: { id: true, periodLabel: true },
  })
  if (!rep) { console.log("EGAL FY2022 report not found"); process.exit(0) }

  const rev = await db.financialValue.findFirst({ where: { reportId: rep.id, metricCode: "REVENUE" }, select: { id: true, normalizedValue: true } })
  if (!rev) { console.log("EGAL FY2022 REVENUE row not found"); await db.$disconnect(); return }

  console.log(`EGAL ${rep.periodLabel} REVENUE stored = ${rev.normalizedValue} (${(rev.normalizedValue / 1e6).toFixed(2)}M)`)
  // Guard: only fix if it is still the corrupt near-zero placeholder (10)
  if (Math.abs(rev.normalizedValue) > 1000) {
    console.log(`GUARD-SKIP: stored value already looks sane — not overwriting`)
  } else {
    await db.financialValue.update({
      where: { id: rev.id },
      data: { normalizedValue: CORRECT_REVENUE, value: CORRECT_REVENUE },
    })
    console.log(`FIXED: REVENUE -> ${CORRECT_REVENUE} (${(CORRECT_REVENUE / 1e6).toFixed(1)}M)  [COGS+GROSS_PROFIT proof; matches S&P/stockanalysis FY2022 = 14,482M]`)
    await db.auditLog.create({
      data: { actor: "system", action: "REVIEW_EDIT", entityType: "FinancialValue",
        details: `EGAL FY2022 REVENUE ${rev.normalizedValue} -> ${CORRECT_REVENUE}: corrupt placeholder replaced by COGS+GROSS_PROFIT from same report (=14,481.9M, matches stockanalysis.com FY2022 14,482M)` },
    })
  }
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
