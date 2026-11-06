/* Unit correction for MHOT FY2022 NET_PROFIT.
   The extracted value is 351 with unit BILLION, but the annual report
   states the figure in MILLION (351M EGP), so we correct unit + normalizedValue.
   Usage: node scripts/fix-mhot-fy2022-net-profit.cjs        (dry run)
          APPLY=1 node scripts/fix-mhot-fy2022-net-profit.cjs */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const APPLY = process.env.APPLY === "1"

;(async () => {
  const company = await db.company.findUnique({ where: { ticker: "MHOT" }, select: { id: true, ticker: true } })
  if (!company) { console.log("MHOT company not found"); await db.$disconnect(); return }

  const report = await db.financialReport.findFirst({
    where: { companyId: company.id, periodType: "ANNUAL", fiscalYear: 2022 },
    select: { id: true, periodLabel: true, sourceName: true },
  })
  if (!report) { console.log("MHOT FY2022 annual report not found"); await db.$disconnect(); return }

  const value = await db.financialValue.findFirst({
    where: { reportId: report.id, metricCode: "NET_PROFIT" },
    select: { id: true, value: true, unit: true, normalizedValue: true, sourceText: true },
  })
  if (!value) { console.log("NET_PROFIT value not found for MHOT FY2022"); await db.$disconnect(); return }

  const expectedNormalized = value.value * 1_000_000
  const needsFix = value.unit === "BILLION" && value.normalizedValue !== expectedNormalized

  console.log(JSON.stringify({
    ticker: company.ticker,
    report: report.periodLabel,
    sourceName: report.sourceName,
    valueId: value.id,
    currentValue: value.value,
    currentUnit: value.unit,
    currentNormalized: value.normalizedValue,
    expectedUnit: "MILLION",
    expectedNormalized: expectedNormalized,
    needsFix,
    sourceText: value.sourceText,
  }, null, 2))

  if (needsFix && APPLY) {
    await db.financialValue.update({
      where: { id: value.id },
      data: { unit: "MILLION", normalizedValue: expectedNormalized, isManuallyCorrected: true, correctedBy: "fix-mhot-fy2022-net-profit", correctedAt: new Date(), correctionReason: "Source states 351M EGP, not 351B EGP; unit misread as BILLION during extraction" },
    })
    await db.auditLog.create({
      data: {
        actor: "system",
        action: "REVIEW_EDIT",
        entityType: "FinancialValue",
        entityId: value.id,
        details: `Corrected MHOT FY2022 NET_PROFIT unit from BILLION to MILLION: ${value.value} -> ${expectedNormalized.toLocaleString()} EGP (was ${value.normalizedValue.toLocaleString()} EGP)`,
      },
    })
    console.log("APPLIED fix")
  } else if (needsFix) {
    console.log("DRY RUN — set APPLY=1 to apply")
  } else {
    console.log("No fix needed")
  }

  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
